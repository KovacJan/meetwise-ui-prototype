import {NextRequest, NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {isWeekendMeetingStart} from "@/lib/meeting-filters";

const USE_CANONICAL_MEETINGS = process.env.USE_CANONICAL_MEETINGS !== "0";

const TYPE_COLORS: Record<string, string> = {
  Standups: "hsl(232,60%,55%)",
  Planning: "hsl(190,70%,50%)",
  Reviews: "hsl(160,60%,45%)",
  "1:1s": "hsl(280,55%,55%)",
  "All-hands": "hsl(45,85%,55%)",
  Other: "hsl(210,20%,45%)",
};

function categorizeMeeting(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("standup") || t.includes("stand-up") || t.includes("daily"))
    return "Standups";
  if (
    t.includes("planning") ||
    t.includes("sprint") ||
    t.includes("roadmap")
  )
    return "Planning";
  if (
    t.includes("review") ||
    t.includes("retro") ||
    t.includes("retrospective")
  )
    return "Reviews";
  if (t.includes("1:1") || t.includes("one on one") || t.includes("1-1"))
    return "1:1s";
  if (
    t.includes("all-hands") ||
    t.includes("all hands") ||
    t.includes("allhands")
  )
    return "All-hands";
  return "Other";
}

function getPeriodDates(
  period: string,
  from?: string | null,
  to?: string | null,
): {startDate: Date; endDate: Date; label: string} {
  const endDate = new Date();
  let startDate: Date;
  let label: string;

  if (period === "custom" && from && to) {
    startDate = new Date(from);
    const customEnd = new Date(to);
    return {startDate, endDate: customEnd, label: `${from} – ${to}`};
  } else if (period === "week") {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    label = "last 7 days";
  } else if (period === "quarter") {
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    label = "last 3 months";
  } else if (period === "year") {
    startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    label = "last 12 months";
  } else {
    // month (default)
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    label = "last 30 days";
  }

  return {startDate, endDate, label};
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .single();

  if (!profile?.team_id) {
    return NextResponse.json({error: "No team"}, {status: 404});
  }

  const teamId = profile.team_id;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "month";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const {startDate, endDate, label} = getPeriodDates(period, from, to);

  let meetings: Array<Record<string, any>> | null = null;
  let meetingsError: unknown = null;

  if (USE_CANONICAL_MEETINGS && !profile.is_manager) {
    const {data: sourceRows, error: sourceError} = await admin
      .from("meetings")
      .select("occurrence_id")
      .eq("team_id", teamId)
      .eq("user_id", profile.id)
      .not("occurrence_id", "is", null)
      .gte("start_time", startDate.toISOString())
      .lte("start_time", endDate.toISOString());

    if (sourceError) {
      meetingsError = sourceError;
    } else {
      const occurrenceIds = [
        ...new Set((sourceRows ?? []).map((r) => r.occurrence_id).filter(Boolean)),
      ] as string[];
      if (occurrenceIds.length === 0) {
        meetings = [];
      } else {
        const {data, error} = await admin
          .from("meeting_occurrences")
          .select(
            "id,title,duration_minutes,participant_count,team_cost,efficiency_score,ai_insight,start_time,series_master_id,ical_uid",
          )
          .eq("team_id", teamId)
          .in("id", occurrenceIds)
          .eq("is_cancelled", false)
          .neq("is_excluded", true)
          .order("team_cost", {ascending: false});
        meetings = data;
        meetingsError = error;
      }
    }
  } else {
    let meetingsQuery = admin
      .from(profile.is_manager && USE_CANONICAL_MEETINGS ? "meeting_occurrences" : "meetings")
      .select(
        "id,title,duration_minutes,participant_count,team_cost,efficiency_score,ai_insight,start_time,series_master_id,ical_uid",
      )
      .eq("team_id", teamId)
      .eq("is_cancelled", false)
      .neq("is_excluded", true)
      .gte("start_time", startDate.toISOString())
      .lte("start_time", endDate.toISOString());

    if (!profile.is_manager) {
      meetingsQuery = meetingsQuery.eq("user_id", profile.id);
    }

    const queryResult = await meetingsQuery.order("team_cost", {ascending: false});
    meetings = queryResult.data as Array<Record<string, any>> | null;
    meetingsError = queryResult.error;
  }

  if (meetingsError) {
    console.error("Failed to load meetings for insights:", meetingsError);
    return NextResponse.json(
      {error: "Failed to load meetings"},
      {status: 500},
    );
  }

  const list = (meetings ?? []).filter(
    (m) => !isWeekendMeetingStart(m.start_time),
  );

  // ─── Poll response counts per meeting (for debug/details view) ──────────────
  const pollCounts: Record<string, number> = {};
  if (list.length > 0) {
    const pollJoinField =
      profile.is_manager && USE_CANONICAL_MEETINGS ? "occurrence_id" : "meeting_id";
    const {data: pollRows} = await admin
      .from("poll_responses")
      .select("meeting_id, occurrence_id")
      .in(
        pollJoinField,
        list.map((m) => m.id),
      );
    for (const row of pollRows ?? []) {
      const key = (pollJoinField === "occurrence_id"
        ? row.occurrence_id
        : row.meeting_id) as string;
      if (!key) continue;
      pollCounts[key] = (pollCounts[key] ?? 0) + 1;
    }
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const isManager = profile.is_manager === true;
  const totalCost = isManager
    ? list.reduce((sum, m) => sum + (m.team_cost ?? 0), 0)
    : 0;
  const totalMinutes = list.reduce(
    (sum, m) => sum + (m.duration_minutes ?? 0),
    0,
  );
  const withScore = list.filter((m) => m.efficiency_score !== null);
  const avgEfficiency =
    withScore.length > 0
      ? withScore.reduce((sum, m) => sum + (m.efficiency_score ?? 0), 0) /
        withScore.length
      : null;
  const analyzedCount = list.filter((m) => m.ai_insight).length;
  const lowEfficiencyMeetings = withScore.filter(
    (m) => (m.efficiency_score ?? 0) < 50,
  );
  const estimatedSavings = isManager
    ? lowEfficiencyMeetings.reduce(
        (sum, m) => sum + (m.team_cost ?? 0) * 0.4,
        0,
      )
    : 0;

  // ─── Top 5 most expensive (deduplicated by title – keep highest-cost occurrence) ──
  const titleBestMap = new Map<string, typeof list[0]>();
  for (const m of list) {
    const key = m.title.trim().toLowerCase();
    const existing = titleBestMap.get(key);
    if (!existing || (m.team_cost ?? 0) > (existing.team_cost ?? 0)) {
      titleBestMap.set(key, m);
    }
  }
  const dedupedByTitle = Array.from(titleBestMap.values()).sort(
    (a, b) => (b.team_cost ?? 0) - (a.team_cost ?? 0),
  );
  const topMeetings = dedupedByTitle.slice(0, 5).map((m) => ({
    id: m.id,
    title: m.title,
    cost: isManager ? (m.team_cost ?? 0) : 0,
    duration: m.duration_minutes,
    people: m.participant_count,
    date: m.start_time,
    efficiencyScore: m.efficiency_score ?? null,
    aiInsight: m.ai_insight ?? null,
  }));

  // ─── Efficiency distribution ──────────────────────────────────────────────
  const high = withScore.filter((m) => (m.efficiency_score ?? 0) >= 75).length;
  const medium = withScore.filter(
    (m) =>
      (m.efficiency_score ?? 0) >= 50 && (m.efficiency_score ?? 0) < 75,
  ).length;
  const low = withScore.filter((m) => (m.efficiency_score ?? 0) < 50).length;
  const total = withScore.length;

  // ─── Cost breakdown by type ────────────────────────────────────────────────
  const typeMap: Record<string, number> = {};
  for (const m of list) {
    const cat = categorizeMeeting(m.title);
    typeMap[cat] = (typeMap[cat] ?? 0) + (m.team_cost ?? 0);
  }
  const typeTotal = Object.values(typeMap).reduce((s, v) => s + v, 0);
  const costBreakdown = isManager
    ? Object.entries(typeMap)
        .sort(([, a], [, b]) => b - a)
        .map(([name, cost]) => ({
          name,
          value: typeTotal > 0 ? Math.round((cost / typeTotal) * 100) : 0,
          cost,
          color: TYPE_COLORS[name] ?? "hsl(210,20%,45%)",
        }))
    : [];

  // ─── Recent AI insights ────────────────────────────────────────────────────
  const recentInsights = list
    .filter((m) => m.ai_insight)
    .slice(0, 6)
    .map((m) => ({
      meetingTitle: m.title,
      insight: m.ai_insight!,
      efficiencyScore: m.efficiency_score ?? 0,
      date: m.start_time,
    }));

  const aiModel =
    process.env.AZURE_OPENAI_DEPLOYMENT ??
    (process.env.OPENAI_API_KEY ? "gpt-4o-mini" : null);

  return NextResponse.json({
    period: label,
    aiModel,
    isManager,
    kpis: {
      totalCost,
      totalMinutes,
      avgEfficiencyScore: avgEfficiency,
      meetingsAnalyzed: analyzedCount,
      estimatedSavings,
      totalMeetings: list.length,
      lowEfficiencyMeetings: lowEfficiencyMeetings.length,
    },
    topMeetings,
    efficiencyDistribution: {
      high: total > 0 ? Math.round((high / total) * 100) : 0,
      medium: total > 0 ? Math.round((medium / total) * 100) : 0,
      low: total > 0 ? Math.round((low / total) * 100) : 0,
      hasData: total > 0,
    },
    costBreakdown,
    recentInsights,
    debugMeetings: list.map((m) => ({
      id: m.id,
      title: m.title,
      cost: isManager ? (m.team_cost ?? 0) : 0,
      duration: m.duration_minutes,
      people: m.participant_count,
      efficiencyScore: m.efficiency_score,
      hasInsight: Boolean(m.ai_insight),
      includedInAvgEfficiency: m.efficiency_score !== null,
      includedInMeetingsAnalyzed: Boolean(m.ai_insight),
      isLowEfficiency:
        m.efficiency_score !== null && (m.efficiency_score ?? 0) < 50,
      pollResponseCount: pollCounts[m.id] ?? 0,
    })),
  });
}
