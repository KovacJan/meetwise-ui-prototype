"use server";

import {
  startOfISOWeek,
  endOfISOWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfDay,
  addDays,
  addMonths,
  getISOWeek,
} from "date-fns";
import { createSupabaseAdminClient } from "@/app/lib/supabase-server";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";
import {
  getWeeklyCost,
  getMonthlyCost,
  getAnnualCost,
  getWeeklyMinutes,
  getMonthlyMinutes,
  getAnnualMinutes,
  getTrendData,
  getCustomRangeCost,
  type CostBreakdown,
} from "@/lib/cost-engine";
import { dedupeCanonicalMeetings } from "@/lib/canonical-meeting";
import { isWeekendMeetingStart } from "@/lib/meeting-filters";

export type FilterPeriod = "week" | "month" | "year" | "custom";

export type DashboardData = {
  weeklyCost: number;
  monthlyCost: number;
  annualCost: number;
  weeklyMinutes: number;
  monthlyMinutes: number;
  annualMinutes: number;
  trendData: Array<{ week: string; cost: number }>;
  isManager: boolean;
  meetings: any[];
  calendarConnected: boolean;
  calendarWriteEnabled: boolean;
  lastCalendarSyncAt: string | null;
  lastCalendarSyncStatus: "success" | "failed" | null;
  lastCalendarSyncError: string | null;
};

const USE_CANONICAL_MEETINGS = process.env.USE_CANONICAL_MEETINGS !== "0";

async function getUserOccurrenceIdsForRange(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teamId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<string[]> {
  const { data, error } = await admin
    .from("meetings")
    .select("occurrence_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .not("occurrence_id", "is", null)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());

  if (error || !data) return [];
  return [
    ...new Set(data.map((r) => r.occurrence_id).filter(Boolean) as string[]),
  ];
}

type TrendMeetingRow = {
  start_time: string;
  team_cost: number | null;
  duration_minutes: number | null;
  is_excluded: boolean | null;
};

/** Load meetings for dashboard trend charts (same sources as the meetings table). */
async function loadTrendMeetingsForPeriod(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  profile: { id: string; team_id: string; is_manager: boolean },
  fromIso: string,
  toIso: string,
): Promise<TrendMeetingRow[]> {
  const from = new Date(fromIso);
  const to = new Date(toIso);

  if (profile.is_manager && USE_CANONICAL_MEETINGS) {
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select("start_time, team_cost, duration_minutes, is_excluded")
      .eq("team_id", profile.team_id)
      .neq("is_all_day", true)
      .neq("is_cancelled", true)
      .gte("start_time", fromIso)
      .lt("start_time", toIso)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("loadTrendMeetingsForPeriod: meeting_occurrences", error);
      return [];
    }

    return (data ?? []).filter(
      (m) => !isWeekendMeetingStart(m.start_time),
    ) as TrendMeetingRow[];
  }

  if (USE_CANONICAL_MEETINGS && !profile.is_manager) {
    const ids = await getUserOccurrenceIdsForRange(
      admin,
      profile.team_id,
      profile.id,
      from,
      to,
    );
    if (ids.length === 0) return [];

    const { data, error } = await admin
      .from("meeting_occurrences")
      .select("start_time, team_cost, duration_minutes, is_excluded")
      .eq("team_id", profile.team_id)
      .in("id", ids)
      .neq("is_all_day", true)
      .neq("is_cancelled", true)
      .order("start_time", { ascending: true });

    if (error) {
      console.error(
        "loadTrendMeetingsForPeriod: member meeting_occurrences",
        error,
      );
      return [];
    }

    return (data ?? []).filter(
      (m) => !isWeekendMeetingStart(m.start_time),
    ) as TrendMeetingRow[];
  }

  let query = admin
    .from("meetings")
    .select("start_time, team_cost, duration_minutes, is_excluded")
    .eq("team_id", profile.team_id)
    .neq("is_all_day", true)
    .neq("is_cancelled", true)
    .gte("start_time", fromIso)
    .lt("start_time", toIso);

  if (!profile.is_manager) {
    query = query.eq("user_id", profile.id);
  }

  const { data, error } = await query.order("start_time", { ascending: true });
  if (error) {
    console.error("loadTrendMeetingsForPeriod: meetings", error);
    return [];
  }

  return (data ?? []).filter(
    (m) => !isWeekendMeetingStart(m.start_time),
  ) as TrendMeetingRow[];
}

async function sumCostsForUserRange(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teamId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<number> {
  if (USE_CANONICAL_MEETINGS) {
    const ids = await getUserOccurrenceIdsForRange(
      admin,
      teamId,
      userId,
      from,
      to,
    );
    if (ids.length === 0) return 0;
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select("team_cost, start_time")
      .eq("team_id", teamId)
      .in("id", ids)
      .neq("is_cancelled", true)
      .neq("is_excluded", true);
    if (error || !data) return 0;
    return data
      .filter((row) => !isWeekendMeetingStart(row.start_time))
      .reduce((sum, row) => sum + (row.team_cost ?? 0), 0);
  }

  const { data, error } = await admin
    .from("meetings")
    .select("team_cost, start_time")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .neq("is_cancelled", true)
    .neq("is_excluded", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());
  if (error || !data) return 0;
  return data
    .filter((row) => !isWeekendMeetingStart(row.start_time))
    .reduce((sum, row) => sum + (row.team_cost ?? 0), 0);
}

async function sumMinutesForUserRange(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teamId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<number> {
  if (USE_CANONICAL_MEETINGS) {
    const ids = await getUserOccurrenceIdsForRange(
      admin,
      teamId,
      userId,
      from,
      to,
    );
    if (ids.length === 0) return 0;
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select("duration_minutes, start_time")
      .eq("team_id", teamId)
      .in("id", ids)
      .neq("is_cancelled", true)
      .neq("is_excluded", true)
      .neq("is_all_day", true);
    if (error || !data) return 0;
    return data
      .filter((row) => !isWeekendMeetingStart(row.start_time))
      .reduce((sum, row) => sum + (row.duration_minutes ?? 0), 0);
  }

  const { data, error } = await admin
    .from("meetings")
    .select("duration_minutes, start_time")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .neq("is_cancelled", true)
    .neq("is_excluded", true)
    .neq("is_all_day", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());
  if (error || !data) return 0;
  return data
    .filter((row) => !isWeekendMeetingStart(row.start_time))
    .reduce((sum, row) => sum + (row.duration_minutes ?? 0), 0);
}

export async function getDashboardData(teamId: string): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // Use admin client for DB reads so RLS never silently hides data.
  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, team_id, is_manager, outlook_connected, microsoft_refresh_token, calendar_write_enabled, last_calendar_sync_at, last_calendar_sync_status, last_calendar_sync_error",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.team_id) {
    return {
      weeklyCost: 0,
      monthlyCost: 0,
      annualCost: 0,
      weeklyMinutes: 0,
      monthlyMinutes: 0,
      annualMinutes: 0,
      trendData: [],
      isManager: false,
      meetings: [],
      calendarConnected: false,
      calendarWriteEnabled: false,
      lastCalendarSyncAt: null,
      lastCalendarSyncStatus: null,
      lastCalendarSyncError: null,
    };
  }

  const effectiveTeamId = teamId || profile.team_id;

  const calendarConnected =
    (profile as any).outlook_connected === true ||
    !!(profile as any).microsoft_refresh_token;

  const calendarWriteEnabled =
    (profile as {calendar_write_enabled?: boolean}).calendar_write_enabled ===
    true;

  if (profile.is_manager) {
    const [
      weeklyCost,
      monthlyCost,
      annualCost,
      weeklyMinutes,
      monthlyMinutes,
      annualMinutes,
      trendData,
    ] = await Promise.all([
      getWeeklyCost(effectiveTeamId, admin),
      getMonthlyCost(effectiveTeamId, admin),
      getAnnualCost(effectiveTeamId, admin),
      getWeeklyMinutes(effectiveTeamId, admin),
      getMonthlyMinutes(effectiveTeamId, admin),
      getAnnualMinutes(effectiveTeamId, admin),
      getTrendData(effectiveTeamId, 8, admin),
    ]);

    const table = USE_CANONICAL_MEETINGS ? "meeting_occurrences" : "meetings";
    const { data } = await admin
      .from(table)
      .select("*")
      .eq("team_id", effectiveTeamId)
      .order("start_time", { ascending: false });

    return {
      weeklyCost,
      monthlyCost,
      annualCost,
      weeklyMinutes,
      monthlyMinutes,
      annualMinutes,
      trendData,
      isManager: true,
      meetings: (data ?? []).filter(
        (m) => !isWeekendMeetingStart(m.start_time),
      ),
      calendarConnected,
      calendarWriteEnabled,
      lastCalendarSyncAt: profile.last_calendar_sync_at ?? null,
      lastCalendarSyncStatus:
        (profile.last_calendar_sync_status as "success" | "failed" | null) ??
        null,
      lastCalendarSyncError: profile.last_calendar_sync_error ?? null,
    };
  } else {
    const now = new Date();
    const [weeklyMinutes, monthlyMinutes, annualMinutes] = await Promise.all([
      sumMinutesForUserRange(
        admin,
        effectiveTeamId,
        profile.id,
        startOfISOWeek(now),
        endOfISOWeek(now),
      ),
      sumMinutesForUserRange(
        admin,
        effectiveTeamId,
        profile.id,
        startOfMonth(now),
        endOfMonth(now),
      ),
      sumMinutesForUserRange(
        admin,
        effectiveTeamId,
        profile.id,
        startOfYear(now),
        endOfDay(now),
      ),
    ]);

    const trendData = await (async () => {
      const start = startOfISOWeek(addDays(now, -7 * (8 - 1)));
      const end = endOfISOWeek(now);
      const { data } = await admin
        .from("meetings")
        .select("start_time, duration_minutes")
        .eq("team_id", effectiveTeamId)
        .eq("user_id", profile.id)
        .neq("is_excluded", true)
        .neq("is_cancelled", true)
        .neq("is_all_day", true)
        .gte("start_time", start.toISOString())
        .lt("start_time", end.toISOString());
      const buckets = new Map<string, number>();
      for (const row of data ?? []) {
        if (isWeekendMeetingStart(row.start_time)) continue;
        const weekLabel = `W${getISOWeek(startOfISOWeek(new Date(row.start_time)))}`;
        buckets.set(
          weekLabel,
          (buckets.get(weekLabel) ?? 0) + (row.duration_minutes ?? 0),
        );
      }
      const out: Array<{ week: string; cost: number }> = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = startOfISOWeek(addDays(now, -7 * i));
        const label = `W${getISOWeek(weekStart)}`;
        out.push({ week: label, cost: buckets.get(label) ?? 0 });
      }
      return out;
    })();

    const { data } = await admin
      .from("meetings")
      .select(
        "id,title,start_time,end_time,duration_minutes,participant_count,user_id",
      )
      .eq("team_id", effectiveTeamId)
      .eq("user_id", profile.id)
      .order("start_time", { ascending: false });

    return {
      weeklyCost: 0,
      monthlyCost: 0,
      annualCost: 0,
      weeklyMinutes,
      monthlyMinutes,
      annualMinutes,
      trendData,
      isManager: false,
      meetings: (data ?? []).filter(
        (m) => !isWeekendMeetingStart(m.start_time),
      ),
      calendarConnected,
      calendarWriteEnabled,
      lastCalendarSyncAt: profile.last_calendar_sync_at ?? null,
      lastCalendarSyncStatus:
        (profile.last_calendar_sync_status as "success" | "failed" | null) ??
        null,
      lastCalendarSyncError: profile.last_calendar_sync_error ?? null,
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
  weeklyMinutes: number;
  monthlyMinutes: number;
  annualMinutes: number;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      weeklyCost: 0,
      monthlyCost: 0,
      annualCost: 0,
      weeklyMinutes: 0,
      monthlyMinutes: 0,
      annualMinutes: 0,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) {
    return {
      weeklyCost: 0,
      monthlyCost: 0,
      annualCost: 0,
      weeklyMinutes: 0,
      monthlyMinutes: 0,
      annualMinutes: 0,
    };
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
    return {
      weeklyCost,
      monthlyCost,
      annualCost,
      weeklyMinutes,
      monthlyMinutes,
      annualMinutes,
    };
  }

  const [weeklyMinutes, monthlyMinutes, annualMinutes] = await Promise.all([
    sumMinutesForUserRange(
      admin,
      teamId,
      profile.id,
      startOfISOWeek(now),
      endOfISOWeek(now),
    ),
    sumMinutesForUserRange(
      admin,
      teamId,
      profile.id,
      startOfMonth(now),
      endOfMonth(now),
    ),
    sumMinutesForUserRange(
      admin,
      teamId,
      profile.id,
      startOfYear(now),
      endOfDay(now),
    ),
  ]);

  return {
    weeklyCost: 0,
    monthlyCost: 0,
    annualCost: 0,
    weeklyMinutes,
    monthlyMinutes,
    annualMinutes,
  };
}

// ─────────────────────────────────────────────────────────────────
// Recent Meetings: filtered list for the dashboard table
// ─────────────────────────────────────────────────────────────────

export type MeetingRow = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  icalUid: string | null;
  eventType: string | null;
  durationMinutes: number;
  participantCount: number;
  /** Team members matched for cost/time calculation (not total calendar attendees) */
  matchedMemberCount: number;
  /** Raw Outlook attendees array from JSONB column */
  attendees: unknown | null;
  teamCost: number | null;
  cost: number | null;
  isCancelled: boolean;
  seriesMasterId: string | null;
  /** When true, this meeting is excluded from all cost calculations */
  isExcluded: boolean;
};

function isLikelyPrivateMeeting(row: {
  title?: string | null;
  participant_count?: number | null;
  matched_member_count?: number | null;
  attendees?: unknown | null;
}): boolean {
  const title = (row.title ?? "").trim();
  const matchedCount = row.matched_member_count ?? 0;
  const attendeeCount = Array.isArray(row.attendees) ? row.attendees.length : 0;
  const hasNoAttendeeDetails = attendeeCount === 0;
  const hasObfuscatedSubject = /^[A-Z]\d{3,}[A-Z]\d+$/.test(title);

  return hasNoAttendeeDetails && matchedCount === 0 && hasObfuscatedSubject;
}

export async function getMeetingsForPeriod(
  fromIso: string,
  toIso: string,
): Promise<MeetingRow[]> {
  type MeetingQueryRow = {
    id: string;
    title: string | null;
    start_time: string;
    end_time: string | null;
    event_type: string | null;
    duration_minutes: number | null;
    participant_count: number | null;
    matched_member_count: number | null;
    attendees: unknown | null;
    team_cost: number | null;
    cost: number | null;
    is_cancelled: boolean | null;
    series_master_id: string | null;
    ical_uid: string | null;
    is_excluded: boolean | null;
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return [];

  if (profile.is_manager && USE_CANONICAL_MEETINGS) {
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select(
        "id, title, start_time, end_time, event_type, duration_minutes, participant_count, matched_member_count, attendees, team_cost, is_cancelled, series_master_id, ical_uid, is_excluded",
      )
      .eq("team_id", profile.team_id)
      .neq("is_all_day", true)
      .gte("start_time", fromIso)
      .lt("start_time", toIso)
      .order("start_time", { ascending: true });

    if (error || !data) return [];
    const rows = (data as MeetingQueryRow[]).filter(
      (m) => !isLikelyPrivateMeeting(m) && !isWeekendMeetingStart(m.start_time),
    );
    return rows.map((m) => ({
      id: m.id,
      title: m.title ?? "Untitled",
      startTime: m.start_time,
      endTime: m.end_time ?? null,
      icalUid: m.ical_uid ?? null,
      eventType: m.event_type ?? null,
      durationMinutes: m.duration_minutes ?? 0,
      participantCount: m.participant_count ?? 0,
      matchedMemberCount: m.matched_member_count ?? 0,
      attendees: m.attendees ?? null,
      teamCost: m.team_cost ?? null,
      cost: m.cost ?? null,
      isCancelled: m.is_cancelled ?? false,
      seriesMasterId: m.series_master_id ?? null,
      isExcluded: m.is_excluded ?? false,
    }));
  }

  if (USE_CANONICAL_MEETINGS && !profile.is_manager) {
    const ids = await getUserOccurrenceIdsForRange(
      admin,
      profile.team_id,
      profile.id,
      new Date(fromIso),
      new Date(toIso),
    );
    if (ids.length === 0) return [];
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select(
        "id, title, start_time, end_time, event_type, duration_minutes, participant_count, matched_member_count, attendees, team_cost, is_cancelled, series_master_id, ical_uid, is_excluded",
      )
      .eq("team_id", profile.team_id)
      .in("id", ids)
      .neq("is_all_day", true)
      .order("start_time", { ascending: true });
    if (error || !data) return [];
    const rows = (data as MeetingQueryRow[]).filter(
      (m) => !isLikelyPrivateMeeting(m) && !isWeekendMeetingStart(m.start_time),
    );
    return rows.map((m) => ({
      id: m.id,
      title: m.title ?? "Untitled",
      startTime: m.start_time,
      endTime: m.end_time ?? null,
      icalUid: m.ical_uid ?? null,
      eventType: m.event_type ?? null,
      durationMinutes: m.duration_minutes ?? 0,
      participantCount: m.participant_count ?? 0,
      matchedMemberCount: m.matched_member_count ?? 0,
      attendees: m.attendees ?? null,
      teamCost: m.team_cost ?? null,
      cost: m.cost ?? null,
      isCancelled: m.is_cancelled ?? false,
      seriesMasterId: m.series_master_id ?? null,
      isExcluded: m.is_excluded ?? false,
    }));
  }

  let query = admin
    .from("meetings")
    .select(
      "id, title, start_time, end_time, event_type, duration_minutes, participant_count, matched_member_count, attendees, team_cost, cost, is_cancelled, series_master_id, ical_uid, is_excluded",
    )
    .eq("team_id", profile.team_id)
    .neq("is_all_day", true)
    .gte("start_time", fromIso)
    .lt("start_time", toIso);

  if (!profile.is_manager) {
    query = query.eq("user_id", profile.id);
  }

  const { data, error } = await query.order("start_time", { ascending: true });

  if (error || !data) return [];

  const typedData = ((data ?? []) as MeetingQueryRow[]).filter(
    (m) => !isLikelyPrivateMeeting(m) && !isWeekendMeetingStart(m.start_time),
  );
  const rowsForView = typedData;

  return rowsForView.map((m) => ({
    id: m.id,
    title: m.title ?? "Untitled",
    startTime: m.start_time,
    endTime: m.end_time ?? null,
    icalUid: m.ical_uid ?? null,
    eventType: m.event_type ?? null,
    durationMinutes: m.duration_minutes ?? 0,
    participantCount: m.participant_count ?? 0,
    matchedMemberCount: m.matched_member_count ?? 0,
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
  attendees: unknown | null;
  teamCost: number | null;
  isExcluded: boolean;
  breakdown: CostBreakdown | null;
};

export type DebugPeriod = "week" | "month" | "year";

export async function getCostBreakdownForPeriod(
  period: DebugPeriod,
): Promise<DebugMeeting[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return [];

  const now = new Date();
  const ranges: Record<DebugPeriod, [Date, Date]> = {
    week: [startOfISOWeek(now), endOfISOWeek(now)],
    month: [startOfMonth(now), endOfMonth(now)],
    year: [startOfYear(now), endOfDay(now)], // YTD only, no future months
  };
  const [from, to] = ranges[period];

  if (profile.is_manager && USE_CANONICAL_MEETINGS) {
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select(
        "id, title, start_time, duration_minutes, participant_count, attendees, team_cost, is_excluded, cost_breakdown",
      )
      .eq("team_id", profile.team_id)
      .neq("is_cancelled", true)
      .gte("start_time", from.toISOString())
      .lt("start_time", to.toISOString())
      .order("start_time", { ascending: true });
    if (error || !data) return [];
    const filteredRows = (data ?? []).filter(
      (m) => !isLikelyPrivateMeeting(m) && !isWeekendMeetingStart(m.start_time),
    );
    return filteredRows.map((m) => ({
      id: m.id,
      title: m.title ?? "Untitled",
      startTime: m.start_time,
      durationMinutes: m.duration_minutes ?? 0,
      participantCount: m.participant_count ?? 0,
      attendees: m.attendees ?? null,
      teamCost: m.team_cost ?? null,
      isExcluded: m.is_excluded ?? false,
      breakdown: (m.cost_breakdown as CostBreakdown | null) ?? null,
    }));
  }

  if (USE_CANONICAL_MEETINGS && !profile.is_manager) {
    const ids = await getUserOccurrenceIdsForRange(
      admin,
      profile.team_id,
      profile.id,
      from,
      to,
    );
    if (ids.length === 0) return [];
    const { data, error } = await admin
      .from("meeting_occurrences")
      .select(
        "id, title, start_time, duration_minutes, participant_count, attendees, team_cost, is_excluded, cost_breakdown",
      )
      .eq("team_id", profile.team_id)
      .in("id", ids)
      .neq("is_cancelled", true)
      .order("start_time", { ascending: true });
    if (error || !data) return [];
    const filteredRows = (data ?? []).filter(
      (m) => !isLikelyPrivateMeeting(m) && !isWeekendMeetingStart(m.start_time),
    );
    return filteredRows.map((m) => ({
      id: m.id,
      title: m.title ?? "Untitled",
      startTime: m.start_time,
      durationMinutes: m.duration_minutes ?? 0,
      participantCount: m.participant_count ?? 0,
      attendees: m.attendees ?? null,
      teamCost: m.team_cost ?? null,
      isExcluded: m.is_excluded ?? false,
      breakdown: (m.cost_breakdown as CostBreakdown | null) ?? null,
    }));
  }

  let query = admin
    .from("meetings")
    .select(
      "id, title, start_time, duration_minutes, participant_count, attendees, team_cost, is_excluded, cost_breakdown, ical_uid, series_master_id",
    )
    .eq("team_id", profile.team_id)
    .neq("is_cancelled", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());

  if (!profile.is_manager) {
    query = query.eq("user_id", profile.id);
  }

  const { data, error } = await query.order("start_time", { ascending: true });

  if (error || !data) return [];

  const filteredRows = (data ?? []).filter(
    (m) => !isLikelyPrivateMeeting(m) && !isWeekendMeetingStart(m.start_time),
  );
  const rowsForView = filteredRows;

  return rowsForView.map((m) => ({
    id: m.id,
    title: m.title ?? "Untitled",
    startTime: m.start_time,
    durationMinutes: m.duration_minutes ?? 0,
    participantCount: m.participant_count ?? 0,
    attendees: m.attendees ?? null,
    teamCost: m.team_cost ?? null,
    isExcluded: m.is_excluded ?? false,
    breakdown: (m.cost_breakdown as CostBreakdown | null) ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Cost Trend: time-bucketed cost data for the area chart
// ─────────────────────────────────────────────────────────────────

export type TrendGranularity = "day" | "week" | "month";
export type CostTrendPoint = { label: string; cost: number };

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { points: [], granularity: "day" };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, team_id, is_manager, outlook_connected, microsoft_refresh_token",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return { points: [], granularity: "day" };

  const hasSyncedCalendar =
    (
      profile as {
        outlook_connected?: boolean;
        microsoft_refresh_token?: string;
      }
    ).outlook_connected === true ||
    !!(
      profile as {
        outlook_connected?: boolean;
        microsoft_refresh_token?: string;
      }
    ).microsoft_refresh_token;

  const from = new Date(fromIso);
  const to = new Date(toIso);
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  const granularity: TrendGranularity =
    diffDays <= 14 ? "day" : diffDays <= 90 ? "week" : "month";

  const meetings = await loadTrendMeetingsForPeriod(
    admin,
    {
      id: profile.id,
      team_id: profile.team_id,
      is_manager: profile.is_manager,
    },
    fromIso,
    toIso,
  );

  // Reasons for no cost (for dynamic no-cost message) — always compute when we have a team
  const { data: membersWithRate } = await admin
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

  // Accumulate meeting costs into buckets (excluded meetings still count toward presence)
  for (const m of meetings) {
    if (m.is_excluded) continue;
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
    return { label, cost };
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

/** Same bucketing as cost trend; point `cost` field holds total minutes in the bucket. */
export async function getTimeTrendForPeriod(
  fromIso: string,
  toIso: string,
  locale: string = "en",
): Promise<{ points: CostTrendPoint[]; granularity: TrendGranularity }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { points: [], granularity: "day" };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return { points: [], granularity: "day" };

  const from = new Date(fromIso);
  const to = new Date(toIso);
  const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  const granularity: TrendGranularity =
    diffDays <= 14 ? "day" : diffDays <= 90 ? "week" : "month";

  const meetings = await loadTrendMeetingsForPeriod(
    admin,
    {
      id: profile.id,
      team_id: profile.team_id,
      is_manager: profile.is_manager,
    },
    fromIso,
    toIso,
  );

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

  for (const m of meetings) {
    if (m.is_excluded) continue;
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
      buckets.set(key, (buckets.get(key) ?? 0) + (m.duration_minutes ?? 0));
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
    return { label, cost };
  });

  return { points, granularity };
}

// ─────────────────────────────────────────────────────────────────
// Forecast: custom range cost (no teamId needed — auth handles it)
// ─────────────────────────────────────────────────────────────────

export async function calculateCustomRangeCost(
  fromIso: string,
  toIso: string,
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return 0;

  if (profile.is_manager) {
    return getCustomRangeCost(
      profile.team_id,
      new Date(fromIso),
      new Date(toIso),
      admin,
    );
  }

  return sumCostsForUserRange(
    admin,
    profile.team_id,
    profile.id,
    new Date(fromIso),
    new Date(toIso),
  );
}

// ─────────────────────────────────────────────────────────────────
// Toggle meeting exclusion from all cost calculations
// ─────────────────────────────────────────────────────────────────

export async function toggleMeetingExclusion(
  meetingIds: string[],
  isExcluded: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return { success: false, error: "No team assigned" };
  if (!profile.is_manager)
    return { success: false, error: "Only managers can exclude meetings" };

  if (!Array.isArray(meetingIds) || meetingIds.length === 0) {
    return { success: false, error: "No meetings provided" };
    return { success: false, error: "No meetings provided" };
  }

  const table = USE_CANONICAL_MEETINGS ? "meeting_occurrences" : "meetings";
  const { error } = await admin
    .from(table)
    .update({ is_excluded: isExcluded })
    .in("id", meetingIds)
    .eq("team_id", profile.team_id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
