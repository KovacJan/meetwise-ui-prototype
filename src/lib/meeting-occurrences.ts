import type {SupabaseClient} from "@supabase/supabase-js";
import {canonicalMeetingKey} from "@/lib/canonical-meeting";

type MeetingSourceRow = {
  id: string;
  team_id: string;
  ical_uid: string | null;
  title: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  participant_count: number | null;
  attendees: unknown | null;
  event_type: string | null;
  series_master_id: string | null;
  is_cancelled: boolean | null;
  is_all_day: boolean | null;
  occurrence_id: string | null;
  created_at?: string | null;
};

type CanonicalAttendee = {
  emailAddress?: {
    address?: string;
    name?: string;
  };
  [key: string]: unknown;
};

type MergeResult = {
  groups: number;
  linkedRows: number;
  fallbackGroups: number;
};

function mergeAttendees(rows: MeetingSourceRow[]): CanonicalAttendee[] {
  const byEmail = new Map<string, CanonicalAttendee>();

  for (const row of rows) {
    const list = Array.isArray(row.attendees) ? (row.attendees as CanonicalAttendee[]) : [];
    for (const attendee of list) {
      const rawEmail = attendee.emailAddress?.address?.toLowerCase().trim();
      if (!rawEmail) continue;
      if (!byEmail.has(rawEmail)) {
        byEmail.set(rawEmail, attendee);
      }
    }
  }

  return Array.from(byEmail.values());
}

function pickPrimaryRow(rows: MeetingSourceRow[]): MeetingSourceRow {
  return rows.reduce((best, candidate) => {
    const bestDuration = Number(best.duration_minutes ?? 0);
    const candidateDuration = Number(candidate.duration_minutes ?? 0);
    if (candidateDuration > bestDuration) return candidate;
    if (candidateDuration < bestDuration) return best;

    const bestParticipants = Number(best.participant_count ?? 0);
    const candidateParticipants = Number(candidate.participant_count ?? 0);
    if (candidateParticipants > bestParticipants) return candidate;
    if (candidateParticipants < bestParticipants) return best;

    const bestCreated = Date.parse(best.created_at ?? "");
    const candidateCreated = Date.parse(candidate.created_at ?? "");
    if (Number.isFinite(candidateCreated) && Number.isFinite(bestCreated)) {
      if (candidateCreated > bestCreated) return candidate;
      if (candidateCreated < bestCreated) return best;
    }

    return String(candidate.id) < String(best.id) ? candidate : best;
  });
}

export async function mergeOccurrencesForTeam(
  teamId: string,
  supabase: SupabaseClient,
): Promise<MergeResult> {
  const pageSize = 1000;
  const rows: MeetingSourceRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const {data, error} = await supabase
      .from("meetings")
      .select(
        "id, team_id, ical_uid, title, start_time, end_time, duration_minutes, participant_count, attendees, event_type, series_master_id, is_cancelled, is_all_day, occurrence_id, created_at",
      )
      .eq("team_id", teamId)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("mergeOccurrencesForTeam: failed to load meetings", error);
      return {groups: 0, linkedRows: 0, fallbackGroups: 0};
    }

    if (!data || data.length === 0) break;
    rows.push(...(data as MeetingSourceRow[]));
    if (data.length < pageSize) break;
  }

  if (rows.length === 0) return {groups: 0, linkedRows: 0, fallbackGroups: 0};

  const grouped = new Map<string, MeetingSourceRow[]>();
  for (const row of rows) {
    const key = canonicalMeetingKey(row);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  let linkedRows = 0;
  let fallbackGroups = 0;

  for (const [key, group] of grouped) {
    if (key.startsWith("fallback:")) fallbackGroups++;

    const primary = pickPrimaryRow(group);
    const attendees = mergeAttendees(group);
    const participantCount = attendees.length > 0 ? attendees.length : Number(primary.participant_count ?? 0);
    const sourceCount = group.length;

    const payload = {
      team_id: teamId,
      canonical_key: key,
      ical_uid: primary.ical_uid ?? null,
      title: primary.title ?? "Untitled Meeting",
      start_time: primary.start_time,
      end_time: primary.end_time ?? null,
      duration_minutes: primary.duration_minutes ?? 0,
      participant_count: participantCount,
      attendees,
      event_type: primary.event_type ?? null,
      series_master_id: primary.series_master_id ?? null,
      is_cancelled: primary.is_cancelled ?? false,
      is_all_day: primary.is_all_day ?? false,
      source_count: sourceCount,
      last_merged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const {data: upserted, error: upsertError} = await supabase
      .from("meeting_occurrences")
      .upsert(payload, {onConflict: "team_id,canonical_key"})
      .select("id")
      .single();

    if (upsertError || !upserted?.id) {
      console.error("mergeOccurrencesForTeam: upsert failed", {key, error: upsertError});
      continue;
    }

    const ids = group.map((r) => r.id);
    let linked = 0;
    for (const id of ids) {
      const {error: oneError} = await supabase
        .from("meetings")
        .update({occurrence_id: upserted.id})
        .eq("id", id);
      if (!oneError) linked++;
    }

    if (linked === 0) {
      console.error("mergeOccurrencesForTeam: linking failed", {key});
      continue;
    }

    await supabase
      .from("meeting_occurrences")
      .update({source_count: linked})
      .eq("id", upserted.id);

    linkedRows += linked;
  }

  return {groups: grouped.size, linkedRows, fallbackGroups};
}
