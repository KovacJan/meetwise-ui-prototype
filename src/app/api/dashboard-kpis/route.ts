import {NextResponse} from "next/server";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {getWeeklyCost, getMonthlyCost, getAnnualCost} from "@/lib/cost-engine";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {weeklyCost: 0, monthlyCost: 0, annualCost: 0},
        {status: 200},
      );
    }

    const admin = createSupabaseAdminClient();
    const {data: profile} = await admin
      .from("profiles")
      .select("id, team_id, is_manager")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.team_id) {
      return NextResponse.json(
        {weeklyCost: 0, monthlyCost: 0, annualCost: 0},
        {status: 200},
      );
    }

    const teamId = profile.team_id;
    const now = new Date();
    const [weeklyCost, monthlyCost, annualCost] = profile.is_manager
      ? await Promise.all([
          getWeeklyCost(teamId, admin),
          getMonthlyCost(teamId, admin),
          getAnnualCost(teamId, admin),
        ])
      : await Promise.all([
          (async () => {
            const {data} = await admin
              .from("meetings")
              .select("team_cost")
              .eq("team_id", teamId)
              .eq("user_id", profile.id)
              .neq("is_cancelled", true)
              .neq("is_excluded", true)
              .gte("start_time", new Date(now.setDate(now.getDate() - now.getDay() + 1)).toISOString());
            return (data ?? []).reduce((s, r) => s + (r.team_cost ?? 0), 0);
          })(),
          (async () => {
            const start = new Date();
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            const {data} = await admin
              .from("meetings")
              .select("team_cost")
              .eq("team_id", teamId)
              .eq("user_id", profile.id)
              .neq("is_cancelled", true)
              .neq("is_excluded", true)
              .gte("start_time", start.toISOString())
              .lt("start_time", end.toISOString());
            return (data ?? []).reduce((s, r) => s + (r.team_cost ?? 0), 0);
          })(),
          (async () => {
            const start = new Date(new Date().getFullYear(), 0, 1);
            const {data} = await admin
              .from("meetings")
              .select("team_cost")
              .eq("team_id", teamId)
              .eq("user_id", profile.id)
              .neq("is_cancelled", true)
              .neq("is_excluded", true)
              .gte("start_time", start.toISOString())
              .lt("start_time", new Date().toISOString());
            return (data ?? []).reduce((s, r) => s + (r.team_cost ?? 0), 0);
          })(),
        ]);

    return NextResponse.json(
      {weeklyCost, monthlyCost, annualCost},
      {status: 200},
    );
  } catch (err) {
    console.error("GET /api/dashboard-kpis failed", err);
    return NextResponse.json(
      {weeklyCost: 0, monthlyCost: 0, annualCost: 0},
      {status: 500},
    );
  }
}

