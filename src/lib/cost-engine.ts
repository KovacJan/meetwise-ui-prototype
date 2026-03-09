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

// ─────────────────────────────────────────────────────────────────
// Core: recalculate team_cost for every meeting in a team
// ─────────────────────────────────────────────────────────────────
export async function recalculateMeetingCosts(
  teamId: string,
  supabase: SupabaseClient,
): Promise<{updated: number; errors: number}> {
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

  // 2. Fetch all non-excluded meetings for the team
  const {data: meetings, error: meetingsError} = await supabase
    .from("meetings")
    .select(
      "id, duration_minutes, attendees, is_all_day, is_cancelled, participant_count",
    )
    .eq("team_id", teamId)
    .neq("is_excluded", true);

  if (meetingsError || !meetings) {
    console.error("recalculateMeetingCosts: failed to load meetings", meetingsError);
    return {updated: 0, errors: 0};
  }

  let updated = 0;
  let errors = 0;

  for (const meeting of meetings) {
    // Skip all-day events (no meaningful duration cost) and cancelled meetings
    if (meeting.is_all_day || meeting.is_cancelled) {
      await supabase
        .from("meetings")
        .update({team_cost: 0, cost_breakdown: null, matched_member_count: 0})
        .eq("id", meeting.id);
      continue;
    }

    const durationHours = (meeting.duration_minutes ?? 0) / 60;
    const attendees: GraphAttendee[] = Array.isArray(meeting.attendees)
      ? (meeting.attendees as GraphAttendee[])
      : [];

    const matched: MemberCostEntry[] = [];
    const seenMemberIds = new Set<string>();

    for (const attendee of attendees) {
      const email = attendee.emailAddress?.address?.toLowerCase().trim() ?? "";
      if (!email) continue;

      const member = memberByEmail.get(email);
      if (!member) continue;

      // Avoid double-counting if the same person appears twice
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

    const breakdown: CostBreakdown = {
      matched,
      unmatched_count: unmatchedCount,
      duration_hours: durationHours,
      total: totalTeamCost,
    };

    const {error: updateError} = await supabase
      .from("meetings")
      .update({
        team_cost: totalTeamCost,
        cost_breakdown: breakdown,
        matched_member_count: matched.length,
        unmatched_attendee_count: unmatchedCount,
      })
      .eq("id", meeting.id);

    if (updateError) {
      console.error("recalculateMeetingCosts: update failed for meeting", meeting.id, updateError);
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
    .from("meetings")
    .select("cost, team_cost, start_time")
    .eq("team_id", teamId)
    .neq("is_cancelled", true)
    .neq("is_excluded", true)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString());

  if (error || !data) return 0;

  // Only use team_cost (from team members with hourly rate). No fallback to sync cost.
  return data.reduce((sum, row) => sum + (row.team_cost ?? 0), 0);
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
    .from("meetings")
    .select("cost, team_cost, start_time")
    .eq("team_id", teamId)
    .neq("is_excluded", true)
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString());

  if (error || !data) return [];

  const buckets = new Map<string, number>();

  for (const row of data) {
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
