import type {SupabaseClient} from "@supabase/supabase-js";
import type {Meeting} from "@/types";
import {
  startOfISOWeek,
  endOfISOWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  endOfDay,
  subWeeks,
} from "date-fns";
import {isWeekendMeetingStart} from "@/lib/meeting-filters";
import {mergeOccurrencesForTeam} from "@/lib/meeting-occurrences";

// ─────────────────────────────────────────────────────────────────
// Simple cost helpers (used during initial sync before team_members exist)
// ─────────────────────────────────────────────────────────────────

export function estimateMeetingCost(
  meeting: Pick<Meeting, "duration_minutes" | "participant_count">,
  hourlyRate: number,
): number {
  const hours = meeting.duration_minutes / 60;
  return Math.round(hours * hourlyRate * meeting.participant_count);
}

export function calculateMeetingCost(
  durationMinutes: number,
  participantCount: number,
  hourlyRate: number,
): number {
  const hours = durationMinutes / 60;
  return Math.round(hours * participantCount * hourlyRate);
}

// ─────────────────────────────────────────────────────────────────
// Attendee shape returned by Microsoft Graph
// ─────────────────────────────────────────────────────────────────
type GraphAttendee = {
  type?: string;
  status?: {response?: string; time?: string};
  emailAddress?: {name?: string; address?: string};
};

// ─────────────────────────────────────────────────────────────────
// Cost breakdown types (stored as JSONB in meetings.cost_breakdown)
// ─────────────────────────────────────────────────────────────────
export type MemberCostEntry = {
  team_member_id: string;
  email: string;
  name: string;
  rate: number;
  duration_hours: number;
  cost: number;
};

export type CostBreakdown = {
  matched: MemberCostEntry[];
  unmatched_count: number;
  duration_hours: number;
  total: number;
};

type CostCalculationInput = {
  duration_minutes: number | null;
  attendees: unknown | null;
};

function calculateCostForAttendees(
  row: CostCalculationInput,
  memberByEmail: Map<string, {id: string; email: string; display_name: string; hourly_rate: number}>,
): {
  totalTeamCost: number;
  matchedCount: number;
  unmatchedCount: number;
  breakdown: CostBreakdown;
} {
  const durationHours = (row.duration_minutes ?? 0) / 60;
  const attendees: GraphAttendee[] = Array.isArray(row.attendees)
    ? (row.attendees as GraphAttendee[])
    : [];

  const matched: MemberCostEntry[] = [];
  const seenMemberIds = new Set<string>();

  for (const attendee of attendees) {
    const email = attendee.emailAddress?.address?.toLowerCase().trim() ?? "";
    if (!email) continue;

    const member = memberByEmail.get(email);
    if (!member) continue;

    if (seenMemberIds.has(member.id)) continue;
    seenMemberIds.add(member.id);

    const cost = Math.round(member.hourly_rate * durationHours * 100) / 100;
    matched.push({
      team_member_id: member.id,
      email: member.email,
      name: member.display_name,
      rate: member.hourly_rate,
      duration_hours: durationHours,
      cost,
    });
  }

  const totalTeamCost = matched.reduce((s, e) => s + e.cost, 0);
  const unmatchedCount = attendees.filter((a) => {
    const email = a.emailAddress?.address?.toLowerCase().trim() ?? "";
    return email && !memberByEmail.has(email);
  }).length;

  return {
    totalTeamCost,
    matchedCount: matched.length,
    unmatchedCount,
    breakdown: {
      matched,
      unmatched_count: unmatchedCount,
      duration_hours: durationHours,
      total: totalTeamCost,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Core: recalculate team_cost for every meeting in a team
// ─────────────────────────────────────────────────────────────────
export async function recalculateMeetingCosts(
  teamId: string,
  supabase: SupabaseClient,
): Promise<{updated: number; errors: number}> {
  await mergeOccurrencesForTeam(teamId, supabase);

  // 1. Fetch all active (non-excluded) team members with their rates
  const {data: members, error: membersError} = await supabase
    .from("team_members")
    .select("id, email, display_name, hourly_rate")
    .eq("team_id", teamId)
    .neq("is_excluded", true);

  if (membersError) {
    console.error("recalculateMeetingCosts: failed to load team_members", membersError);
    return {updated: 0, errors: 0};
  }

  // Build a lowercase-email → member map for fast lookup.
  // If there are no members, memberByEmail is empty — every attendee is unmatched
  // and team_cost will be set to 0 for all meetings (no early-return fallback).
  const memberByEmail = new Map(
    (members ?? []).map((m) => [m.email.toLowerCase().trim(), m]),
  );

  // 2. Fetch all non-excluded canonical occurrences for the team
  const {data: occurrences, error: occurrencesError} = await supabase
    .from("meeting_occurrences")
    .select(
      "id, start_time, duration_minutes, attendees, is_all_day, is_cancelled",
    )
    .eq("team_id", teamId)
    .neq("is_excluded", true);

  if (occurrencesError || !occurrences) {
    console.error("recalculateMeetingCosts: failed to load meeting_occurrences", occurrencesError);
    return {updated: 0, errors: 0};
  }

  let updated = 0;
  let errors = 0;

  for (const occurrence of occurrences) {
    // Skip all-day events (no meaningful duration cost) and cancelled meetings
    if (
      occurrence.is_all_day ||
      occurrence.is_cancelled ||
      isWeekendMeetingStart(occurrence.start_time)
    ) {
      await supabase
        .from("meeting_occurrences")
        .update({team_cost: 0, cost_breakdown: null, matched_member_count: 0})
        .eq("id", occurrence.id);
      continue;
    }

    const {totalTeamCost, matchedCount, unmatchedCount, breakdown} = calculateCostForAttendees(
      occurrence,
      memberByEmail,
    );

    const {error: updateError} = await supabase
      .from("meeting_occurrences")
      .update({
        team_cost: totalTeamCost,
        cost_breakdown: breakdown,
        matched_member_count: matchedCount,
        unmatched_attendee_count: unmatchedCount,
      })
      .eq("id", occurrence.id);

    if (updateError) {
      console.error(
        "recalculateMeetingCosts: update failed for occurrence",
        occurrence.id,
        updateError,
      );
      errors++;
    } else {
      updated++;
    }
  }

  return {updated, errors};
}

// ─────────────────────────────────────────────────────────────────
// Aggregate cost queries (prefer team_cost over legacy cost)
// ─────────────────────────────────────────────────────────────────

async function sumCostsForRange(
  teamId: string,
  from: Date,
  to: Date,
  supabase: SupabaseClient,
): Promise<number> {
  const {data, error} = await supabase
    .from("meeting_occurrences")
    .select("team_cost, start_time")
    .eq("team_id", teamId)
    .neq("is_cancelled", true)
    .neq("is_excluded", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());

  if (error || !data) return 0;

  const visibleRows = data.filter((row) => !isWeekendMeetingStart(row.start_time as string));
  return visibleRows.reduce((sum, row) => sum + (row.team_cost ?? 0), 0);
}

async function sumMinutesForRange(
  teamId: string,
  from: Date,
  to: Date,
  supabase: SupabaseClient,
): Promise<number> {
  const {data, error} = await supabase
    .from("meeting_occurrences")
    .select("start_time, duration_minutes")
    .eq("team_id", teamId)
    .neq("is_cancelled", true)
    .neq("is_excluded", true)
    .neq("is_all_day", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());

  if (error || !data) return 0;

  const visibleRows = data.filter((row) => !isWeekendMeetingStart(row.start_time as string));
  return visibleRows.reduce(
    (sum, row) => sum + (row.duration_minutes ?? 0),
    0,
  );
}

export async function getWeeklyMinutes(
  teamId: string,
  supabase: SupabaseClient,
): Promise<number> {
  return sumMinutesForRange(
    teamId,
    startOfISOWeek(new Date()),
    endOfISOWeek(new Date()),
    supabase,
  );
}

export async function getMonthlyMinutes(
  teamId: string,
  supabase: SupabaseClient,
): Promise<number> {
  return sumMinutesForRange(
    teamId,
    startOfMonth(new Date()),
    endOfMonth(new Date()),
    supabase,
  );
}

export async function getAnnualMinutes(
  teamId: string,
  supabase: SupabaseClient,
): Promise<number> {
  const now = new Date();
  return sumMinutesForRange(teamId, startOfYear(now), endOfDay(now), supabase);
}

export async function getWeeklyCost(
  teamId: string,
  supabase: SupabaseClient,
): Promise<number> {
  return sumCostsForRange(teamId, startOfISOWeek(new Date()), endOfISOWeek(new Date()), supabase);
}

export async function getMonthlyCost(
  teamId: string,
  supabase: SupabaseClient,
): Promise<number> {
  return sumCostsForRange(teamId, startOfMonth(new Date()), endOfMonth(new Date()), supabase);
}

export async function getAnnualCost(
  teamId: string,
  supabase: SupabaseClient,
): Promise<number> {
  const now = new Date();
  // Year-to-date only: from start of year through end of today (no future months)
  return sumCostsForRange(teamId, startOfYear(now), endOfDay(now), supabase);
}

export async function getCustomRangeCost(
  teamId: string,
  from: Date,
  to: Date,
  supabase: SupabaseClient,
): Promise<number> {
  return sumCostsForRange(teamId, from, to, supabase);
}

export async function getTrendData(
  teamId: string,
  weeks: number,
  supabase: SupabaseClient,
): Promise<Array<{week: string; cost: number}>> {
  const now = new Date();
  const start = startOfISOWeek(subWeeks(now, weeks - 1));
  const end = endOfISOWeek(now);

  const {data, error} = await supabase
    .from("meeting_occurrences")
    .select("team_cost, start_time")
    .eq("team_id", teamId)
    .neq("is_excluded", true)
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString());

  if (error || !data) return [];

  const buckets = new Map<string, number>();

  const visibleRows = data.filter((row) => !isWeekendMeetingStart(row.start_time as string));
  for (const row of visibleRows) {
    const date = new Date(row.start_time as string);
    const isoWeekStart = startOfISOWeek(date);
    const weekLabel = `W${getISOWeekNumber(isoWeekStart)}`;
    const rowCost = row.team_cost ?? 0;
    buckets.set(weekLabel, (buckets.get(weekLabel) ?? 0) + rowCost);
  }

  const result: Array<{week: string; cost: number}> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = startOfISOWeek(subWeeks(now, i));
    const label = `W${getISOWeekNumber(weekStart)}`;
    result.push({week: label, cost: buckets.get(label) ?? 0});
  }
  return result;
}

function getISOWeekNumber(date: Date): number {
  const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
