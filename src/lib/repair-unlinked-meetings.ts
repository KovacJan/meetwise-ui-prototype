import type {SupabaseClient} from "@supabase/supabase-js";
import {canonicalMeetingKey} from "@/lib/canonical-meeting";

export async function repairUnlinkedMeetings(
  admin: SupabaseClient,
): Promise<{linked: number; errors: number}> {
  const unlinked: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const {data} = await admin
      .from("meetings")
      .select("*")
      .is("occurrence_id", null)
      .range(from, from + 999);
    if (!data?.length) break;
    unlinked.push(...data);
    if (data.length < 1000) break;
  }

  let linked = 0;
  let errors = 0;

  for (const row of unlinked) {
    const key = canonicalMeetingKey(row as Parameters<typeof canonicalMeetingKey>[0]);
    const teamId = row.team_id as string;

    const payload = {
      team_id: teamId,
      canonical_key: key,
      ical_uid: (row.ical_uid as string) ?? null,
      title: (row.title as string) ?? "Untitled Meeting",
      start_time: row.start_time as string,
      end_time: (row.end_time as string) ?? null,
      duration_minutes: (row.duration_minutes as number) ?? 0,
      participant_count: (row.participant_count as number) ?? 0,
      attendees: row.attendees ?? [],
      event_type: (row.event_type as string) ?? null,
      series_master_id: (row.series_master_id as string) ?? null,
      is_cancelled: (row.is_cancelled as boolean) ?? false,
      is_all_day: (row.is_all_day as boolean) ?? false,
      source_count: 1,
      last_merged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const {data: upserted, error: upsertError} = await admin
      .from("meeting_occurrences")
      .upsert(payload, {onConflict: "team_id,canonical_key"})
      .select("id")
      .single();

    if (upsertError || !upserted?.id) {
      errors++;
      continue;
    }

    const {error: linkError} = await admin
      .from("meetings")
      .update({occurrence_id: upserted.id})
      .eq("id", row.id as string);

    if (linkError) {
      errors++;
      continue;
    }

    linked++;
  }

  return {linked, errors};
}
