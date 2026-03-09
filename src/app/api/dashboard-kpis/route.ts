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
      .select("team_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.team_id) {
      return NextResponse.json(
        {weeklyCost: 0, monthlyCost: 0, annualCost: 0},
        {status: 200},
      );
    }

    const teamId = profile.team_id;
    const [weeklyCost, monthlyCost, annualCost] = await Promise.all([
      getWeeklyCost(teamId, admin),
      getMonthlyCost(teamId, admin),
      getAnnualCost(teamId, admin),
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

