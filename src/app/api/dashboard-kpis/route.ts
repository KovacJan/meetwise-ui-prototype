import {NextResponse} from "next/server";
import {
  startOfISOWeek,
  endOfISOWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfDay,
} from "date-fns";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {
  getWeeklyCost,
  getMonthlyCost,
  getAnnualCost,
  getWeeklyMinutes,
  getMonthlyMinutes,
  getAnnualMinutes,
} from "@/lib/cost-engine";
import {isWeekendMeetingStart} from "@/lib/meeting-filters";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    const empty = {
      weeklyCost: 0,
      monthlyCost: 0,
      annualCost: 0,
      weeklyMinutes: 0,
      monthlyMinutes: 0,
      annualMinutes: 0,
    };

    if (!user) {
      return NextResponse.json(empty, {status: 200});
    }

    const admin = createSupabaseAdminClient();
    const {data: profile} = await admin
      .from("profiles")
      .select("id, team_id, is_manager")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.team_id) {
      return NextResponse.json(empty, {status: 200});
    }

    const teamId = profile.team_id;
    const now = new Date();

    if (profile.is_manager) {
      const [
        weeklyCost,
        monthlyCost,
        annualCost,
        weeklyMinutes,
        monthlyMinutes,
        annualMinutes,
      ] = await Promise.all([
        getWeeklyCost(teamId, admin),
        getMonthlyCost(teamId, admin),
        getAnnualCost(teamId, admin),
        getWeeklyMinutes(teamId, admin),
        getMonthlyMinutes(teamId, admin),
        getAnnualMinutes(teamId, admin),
      ]);
      return NextResponse.json(
        {
          weeklyCost,
          monthlyCost,
          annualCost,
          weeklyMinutes,
          monthlyMinutes,
          annualMinutes,
        },
        {status: 200},
      );
    }

    const sumMinutes = async (from: Date, to: Date) => {
      const {data} = await admin
        .from("meetings")
        .select("duration_minutes, start_time")
        .eq("team_id", teamId)
        .eq("user_id", profile.id)
        .neq("is_cancelled", true)
        .neq("is_excluded", true)
        .neq("is_all_day", true)
        .gte("start_time", from.toISOString())
        .lt("start_time", to.toISOString());
      return (data ?? [])
        .filter((r) => !isWeekendMeetingStart(r.start_time))
        .reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
    };

    const [weeklyMinutes, monthlyMinutes, annualMinutes] = await Promise.all([
      sumMinutes(startOfISOWeek(now), endOfISOWeek(now)),
      sumMinutes(startOfMonth(now), endOfMonth(now)),
      sumMinutes(startOfYear(now), endOfDay(now)),
    ]);

    return NextResponse.json(
      {
        weeklyCost: 0,
        monthlyCost: 0,
        annualCost: 0,
        weeklyMinutes,
        monthlyMinutes,
        annualMinutes,
      },
      {status: 200},
    );
  } catch (err) {
    console.error("GET /api/dashboard-kpis failed", err);
    return NextResponse.json(
      {
        weeklyCost: 0,
        monthlyCost: 0,
        annualCost: 0,
        weeklyMinutes: 0,
        monthlyMinutes: 0,
        annualMinutes: 0,
      },
      {status: 500},
    );
  }
}
