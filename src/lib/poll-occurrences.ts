import type {SupabaseClient} from "@supabase/supabase-js";

export const USE_CANONICAL_MEETINGS = process.env.USE_CANONICAL_MEETINGS !== "0";

export type PollOccurrenceRow = {
  id: string;
  title: string;
  team_id: string;
  end_time: string | null;
  start_time: string;
  duration_minutes: number;
  attendees?: unknown;
  is_cancelled?: boolean;
  is_excluded?: boolean;
  is_all_day?: boolean;
  poll_sent?: boolean;
};

export function occurrenceHasAttendee(
  row: {attendees?: unknown},
  email: string,
): boolean {
  const attendees = Array.isArray(row.attendees)
    ? (row.attendees as {emailAddress?: {address?: string}}[])
    : [];
  const normalized = email.toLowerCase().trim();
  return attendees.some(
    (a) =>
      a?.emailAddress?.address &&
      String(a.emailAddress.address).toLowerCase().trim() === normalized,
  );
}

let pollDigestOccurrenceColumnReady: boolean | null = null;
let occurrencePollColumnsReady: boolean | null = null;

export async function hasPollDigestOccurrenceColumn(
  admin: SupabaseClient,
): Promise<boolean> {
  if (pollDigestOccurrenceColumnReady !== null) return pollDigestOccurrenceColumnReady;
  const {error} = await admin.from("poll_digest_sent").select("occurrence_id").limit(1);
  pollDigestOccurrenceColumnReady = !error;
  return pollDigestOccurrenceColumnReady;
}

export async function hasOccurrencePollColumns(
  admin: SupabaseClient,
): Promise<boolean> {
  if (occurrencePollColumnsReady !== null) return occurrencePollColumnsReady;
  const {error} = await admin.from("meeting_occurrences").select("poll_sent").limit(1);
  occurrencePollColumnsReady = !error;
  return occurrencePollColumnsReady;
}

export async function getRepresentativeMeetingId(
  admin: SupabaseClient,
  occurrenceId: string,
): Promise<string | null> {
  const {data} = await admin
    .from("meetings")
    .select("id")
    .eq("occurrence_id", occurrenceId)
    .order("created_at", {ascending: true})
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolvePollMetadata(
  admin: SupabaseClient,
  id: string,
): Promise<{
  occurrenceId: string | null;
  title: string;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
} | null> {
  const {data: occurrence} = await admin
    .from("meeting_occurrences")
    .select("id, title, duration_minutes, start_time, end_time")
    .eq("id", id)
    .maybeSingle();

  if (occurrence) {
    return {
      occurrenceId: occurrence.id,
      title: occurrence.title,
      durationMinutes: occurrence.duration_minutes ?? 0,
      startTime: occurrence.start_time,
      endTime: occurrence.end_time,
    };
  }

  const {data: meeting} = await admin
    .from("meetings")
    .select("id, title, duration_minutes, start_time, end_time, occurrence_id")
    .eq("id", id)
    .maybeSingle();

  if (!meeting) return null;

  return {
    occurrenceId: meeting.occurrence_id ?? null,
    title: meeting.title,
    durationMinutes: meeting.duration_minutes ?? 0,
    startTime: meeting.start_time,
    endTime: meeting.end_time,
  };
}
