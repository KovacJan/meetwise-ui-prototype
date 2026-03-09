"use server";

import {
  startOfISOWeek, endOfISOWeek,
  startOfMonth,   endOfMonth,
  startOfYear,    endOfYear,
  endOfDay,
  addDays,        addMonths,
  getISOWeek,
} from "date-fns";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {
  getWeeklyCost,
  getMonthlyCost,
  getAnnualCost,
  getTrendData,
  getCustomRangeCost,
  type CostBreakdown,
} from "@/lib/cost-engine";

export type FilterPeriod = "week" | "month" | "year" | "custom";

export type DashboardData = {
  weeklyCost: number;
  monthlyCost: number;
  annualCost: number;
  trendData: Array<{week: string; cost: number}>;
  isManager: boolean;
  meetings: any[];
   calendarConnected: boolean;
};

export async function getDashboardData(teamId: string): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // Use admin client for DB reads so RLS never silently hides data.
  const admin = createSupabaseAdminClient();

  const {data: profile} = await admin
    .from("profiles")
    .select("id, team_id, is_manager, outlook_connected, microsoft_refresh_token")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.team_id) {
    return {
      weeklyCost: 0,
      monthlyCost: 0,
      annualCost: 0,
      trendData: [],
      isManager: false,
      meetings: [],
      calendarConnected: false,
    };
  }

  const effectiveTeamId = teamId || profile.team_id;

  const calendarConnected =
    // Prefer explicit outlook_connected flag when present
    (profile as any).outlook_connected === true ||
    // Fallback for older rows: presence of refresh token
    !!(profile as any).microsoft_refresh_token;

  const [weeklyCost, monthlyCost, annualCost, trendData] = await Promise.all([
    getWeeklyCost(effectiveTeamId, admin),
    getMonthlyCost(effectiveTeamId, admin),
    getAnnualCost(effectiveTeamId, admin),
    getTrendData(effectiveTeamId, 8, admin),
  ]);

  if (profile.is_manager) {
    const {data} = await admin
      .from("meetings")
      .select("*")
      .eq("team_id", effectiveTeamId)
      .order("start_time", {ascending: false});

    return {
      weeklyCost,
      monthlyCost,
      annualCost,
      trendData,
      isManager: true,
      meetings: data ?? [],
      calendarConnected,
    };
  } else {
    const {data} = await admin
      .from("meetings")
      .select("id,title,start_time,end_time,duration_minutes,participant_count,user_id")
      .eq("team_id", effectiveTeamId)
      .eq("user_id", profile.id)
      .order("start_time", {ascending: false});

    return {
      weeklyCost,
      monthlyCost,
      annualCost,
      trendData,
      isManager: false,
      meetings: data ?? [],
      calendarConnected,
    };
  }
}

export async function getCustomRangeCostForTeam(
  teamId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  return getCustomRangeCost(teamId, from, to, admin);
}

// ─────────────────────────────────────────────────────────────────
// Lightweight KPI fetcher for client (weekly / monthly / annual)
// ─────────────────────────────────────────────────────────────────
export async function getDashboardKpis(): Promise<{
  weeklyCost: number;
  monthlyCost: number;
  annualCost: number;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) {
    return {weeklyCost: 0, monthlyCost: 0, annualCost: 0};
  }

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) {
    return {weeklyCost: 0, monthlyCost: 0, annualCost: 0};
  }

  const teamId = profile.team_id;
  const [weeklyCost, monthlyCost, annualCost] = await Promise.all([
    getWeeklyCost(teamId, admin),
    getMonthlyCost(teamId, admin),
    getAnnualCost(teamId, admin),
  ]);

  return {weeklyCost, monthlyCost, annualCost};
}

// ─────────────────────────────────────────────────────────────────
// Recent Meetings: filtered list for the dashboard table
// ─────────────────────────────────────────────────────────────────

export type MeetingRow = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  participantCount: number;
  /** Raw Outlook attendees array from JSONB column */
  attendees: unknown | null;
  teamCost: number | null;
  cost: number | null;
  isCancelled: boolean;
  seriesMasterId: string | null;
  /** When true, this meeting is excluded from all cost calculations */
  isExcluded: boolean;
};

export async function getMeetingsForPeriod(
  fromIso: string,
  toIso: string,
): Promise<MeetingRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return [];

  const {data, error} = await admin
    .from("meetings")
    .select(
      "id, title, start_time, end_time, duration_minutes, participant_count, attendees, team_cost, cost, is_cancelled, series_master_id, is_excluded",
    )
    .eq("team_id", profile.team_id)
    .neq("is_all_day", true)
    .gte("start_time", fromIso)
    .lt("start_time", toIso)
    .order("start_time", {ascending: true});

  if (error || !data) return [];

  return data.map((m) => ({
    id: m.id,
    title: m.title ?? "Untitled",
    startTime: m.start_time,
    endTime: m.end_time ?? null,
    durationMinutes: m.duration_minutes ?? 0,
    participantCount: m.participant_count ?? 0,
    attendees: m.attendees ?? null,
    teamCost: m.team_cost ?? null,
    cost: m.cost ?? null,
    isCancelled: m.is_cancelled ?? false,
    seriesMasterId: m.series_master_id ?? null,
    isExcluded: m.is_excluded ?? false,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Dev debug: per-meeting cost breakdown for a named period
// ─────────────────────────────────────────────────────────────────

export type DebugMeeting = {
  id: string;
  title: string;
  startTime: string;
  durationMinutes: number;
  participantCount: number;
  teamCost: number | null;
  isExcluded: boolean;
  breakdown: CostBreakdown | null;
};

export type DebugPeriod = "week" | "month" | "year";

export async function getCostBreakdownForPeriod(
  period: DebugPeriod,
): Promise<DebugMeeting[]> {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return [];

  const now = new Date();
  const ranges: Record<DebugPeriod, [Date, Date]> = {
    week:  [startOfISOWeek(now), endOfISOWeek(now)],
    month: [startOfMonth(now),   endOfMonth(now)],
    year:  [startOfYear(now),    endOfDay(now)], // YTD only, no future months
  };
  const [from, to] = ranges[period];

  const {data, error} = await admin
    .from("meetings")
    .select(
      "id, title, start_time, duration_minutes, participant_count, team_cost, is_excluded, cost_breakdown",
    )
    .eq("team_id", profile.team_id)
    .neq("is_cancelled", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString())
    .order("start_time", {ascending: true});

  if (error || !data) return [];

  return data.map((m) => ({
    id: m.id,
    title: m.title ?? "Untitled",
    startTime: m.start_time,
    durationMinutes: m.duration_minutes ?? 0,
    participantCount: m.participant_count ?? 0,
    teamCost: m.team_cost ?? null,
    isExcluded: m.is_excluded ?? false,
    breakdown: (m.cost_breakdown as CostBreakdown | null) ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Cost Trend: time-bucketed cost data for the area chart
// ─────────────────────────────────────────────────────────────────

export type TrendGranularity = "day" | "week" | "month";
export type CostTrendPoint = {label: string; cost: number};

/** Map next-intl locale to Intl locale string for date formatting */
function dateLocale(locale: string): string {
  return locale === "de" ? "de-DE" : "en-GB";
}

export type NoCostReasons = {
  hasSyncedCalendar: boolean;
  /** True if there is at least one meeting in the period (so "calendar not synced" can be ruled out) */
  hasMeetingsInPeriod: boolean;
  hasTeamMembersWithRate: boolean;
  hasMatchingAttendeesInPeriod: boolean;
};

export async function getCostTrendForPeriod(
  fromIso: string,
  toIso: string,
  locale: string = "en",
): Promise<{
  points: CostTrendPoint[];
  granularity: TrendGranularity;
  noCostReasons?: NoCostReasons;
}> {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return {points: [], granularity: "day"};

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id, outlook_connected, microsoft_refresh_token")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return {points: [], granularity: "day"};

  const hasSyncedCalendar =
    (profile as {outlook_connected?: boolean; microsoft_refresh_token?: string}).outlook_connected === true ||
    !!(profile as {outlook_connected?: boolean; microsoft_refresh_token?: string}).microsoft_refresh_token;

  const from = new Date(fromIso);
  const to = new Date(toIso);
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  const granularity: TrendGranularity =
    diffDays <= 14 ? "day" : diffDays <= 90 ? "week" : "month";

  const {data: meetingsData} = await admin
    .from("meetings")
    .select("start_time, team_cost, cost, is_cancelled")
    .eq("team_id", profile.team_id)
    .neq("is_all_day", true)
    .neq("is_cancelled", true)
    .neq("is_excluded", true)
    .gte("start_time", fromIso)
    .lt("start_time", toIso)
    .order("start_time", {ascending: true});

  const meetings = meetingsData ?? [];

  // Reasons for no cost (for dynamic no-cost message) — always compute when we have a team
  const {data: membersWithRate} = await admin
    .from("team_members")
    .select("id")
    .eq("team_id", profile.team_id)
    .not("hourly_rate", "is", null)
    .gt("hourly_rate", 0);
  const hasTeamMembersWithRate = (membersWithRate?.length ?? 0) > 0;
  const hasMeetingsInPeriod = meetings.length > 0;
  const hasMatchingAttendeesInPeriod = meetings.some(
    (m) => (m.team_cost ?? 0) > 0,
  );

  // Pre-populate ordered buckets so every time-slot is represented.
  const buckets = new Map<string, number>();
  if (granularity === "day") {
    const d = new Date(from);
    d.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (d <= end) {
      buckets.set(d.toISOString().slice(0, 10), 0);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else if (granularity === "week") {
    let d = startOfISOWeek(from);
    while (d <= to) {
      buckets.set(d.toISOString().slice(0, 10), 0);
      d = addDays(d, 7);
    }
  } else {
    let d = startOfMonth(from);
    while (d <= to) {
      buckets.set(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        0,
      );
      d = addMonths(d, 1);
    }
  }

  // Accumulate meeting costs into buckets
  for (const m of meetings) {
    const d = new Date(m.start_time);
    let key: string;
    if (granularity === "day") {
      key = m.start_time.slice(0, 10);
    } else if (granularity === "week") {
      key = startOfISOWeek(d).toISOString().slice(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + (m.team_cost ?? 0));
    }
  }

  const loc = dateLocale(locale);
  const points = [...buckets.entries()].map(([key, cost]) => {
    let label: string;
    if (granularity === "day") {
      label = new Intl.DateTimeFormat(loc, {
        weekday: "short",
        day: "numeric",
      }).format(new Date(key + "T12:00:00Z"));
    } else if (granularity === "week") {
      const weekNum = getISOWeek(new Date(key + "T12:00:00Z"));
      label = locale === "de" ? `KW ${weekNum}` : `Week ${weekNum}`;
    } else {
      label = new Intl.DateTimeFormat(loc, {
        month: "short",
        year: "2-digit",
      }).format(new Date(key + "-15T12:00:00Z"));
    }
    return {label, cost};
  });

  return {
    points,
    granularity,
    noCostReasons: {
      hasSyncedCalendar,
      hasMeetingsInPeriod,
      hasTeamMembersWithRate,
      hasMatchingAttendeesInPeriod,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Forecast: custom range cost (no teamId needed — auth handles it)
// ─────────────────────────────────────────────────────────────────

export async function calculateCustomRangeCost(
  fromIso: string,
  toIso: string,
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return 0;

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return 0;

  return getCustomRangeCost(
    profile.team_id,
    new Date(fromIso),
    new Date(toIso),
    admin,
  );
}

// ─────────────────────────────────────────────────────────────────
// Toggle meeting exclusion from all cost calculations
// ─────────────────────────────────────────────────────────────────

export async function toggleMeetingExclusion(
  meetingIds: string[],
  isExcluded: boolean,
): Promise<{success: boolean; error?: string}> {
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return {success: false, error: "Unauthorized"};

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return {success: false, error: "No team assigned"};
  if (!profile.is_manager) return {success: false, error: "Only managers can exclude meetings"};

  if (!Array.isArray(meetingIds) || meetingIds.length === 0) {
    return {success: false, error: "No meetings provided"};
  }

  const {error} = await admin
    .from("meetings")
    .update({is_excluded: isExcluded})
    .in("id", meetingIds)
    .eq("team_id", profile.team_id);

  if (error) return {success: false, error: error.message};
  return {success: true};
}
