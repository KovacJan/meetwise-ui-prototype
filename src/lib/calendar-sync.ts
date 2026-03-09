import type {SupabaseClient} from "@supabase/supabase-js";
import {decryptToken} from "@/lib/token-encryption";
import {getAccessToken, getCalendarEvents} from "@/lib/microsoft-graph";
import {recalculateMeetingCosts} from "@/lib/cost-engine";

type ProfileForSync = {
  id: string;
  team_id: string | null;
  microsoft_refresh_token: string | null;
};

type SyncResult = {
  synced: number;
  total: number;
  deleted: number;
  costsRecalculated: number;
};

/**
 * Sync calendar events from Microsoft Graph into the `meetings` table
 * for a single profile, and recalculate meeting costs for the team.
 */
export async function syncCalendarForProfile(
  admin: SupabaseClient,
  profile: ProfileForSync,
): Promise<SyncResult> {
  if (!profile.team_id || !profile.microsoft_refresh_token) {
    return {synced: 0, total: 0, deleted: 0, costsRecalculated: 0};
  }

  const decryptedRefreshToken = decryptToken(profile.microsoft_refresh_token);

  // Verify the team exists
  const {data: team, error: teamError} = await admin
    .from("teams")
    .select("id")
    .eq("id", profile.team_id)
    .single();

  if (teamError || !team) {
    console.error(
      "sync-calendar: team not found for profile",
      profile.id,
      teamError,
    );
    return {synced: 0, total: 0, deleted: 0, costsRecalculated: 0};
  }

  // Sync window: last 3 months → +1 month ahead
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - 3);
  const to = new Date(now);
  to.setMonth(to.getMonth() + 1);

  // Fetch events from Microsoft Graph
  let events:
    | {
        id: string;
        subject: string | null;
        start: string;
        end: string;
        durationMinutes: number;
        participantCount: number;
        isAllDay?: boolean;
        originalStartTimeZone?: string | null;
        originalEndTimeZone?: string | null;
        type?: string | null;
        seriesMasterId?: string | null;
        recurrence?: unknown;
        isCancelled?: boolean;
        attendees?: unknown;
      }[]
    | undefined;

  try {
    const tokenResponse = await getAccessToken(decryptedRefreshToken);
    events = await getCalendarEvents(tokenResponse.access_token, from, to);
  } catch (err) {
    console.error("sync-calendar: Graph fetch failed", {
      profileId: profile.id,
      error: err,
    });
    return {synced: 0, total: 0, deleted: 0, costsRecalculated: 0};
  }

  if (!events || events.length === 0) {
    return {synced: 0, total: 0, deleted: 0, costsRecalculated: 0};
  }

  let synced = 0;

  // Track all event IDs returned from the calendar API
  const fetchedEventIds = new Set<string>();

  for (const event of events) {
    fetchedEventIds.add(event.id);

    const {error: upsertError} = await admin
      .from("meetings")
      .upsert(
        {
          user_id: profile.id,
          team_id: profile.team_id,
          outlook_event_id: event.id,
          title: event.subject,
          start_time: event.start,
          end_time: event.end,
          duration_minutes: event.durationMinutes,
          participant_count: event.participantCount,
          is_all_day: event.isAllDay ?? false,
          original_start_timezone: event.originalStartTimeZone ?? null,
          original_end_timezone: event.originalEndTimeZone ?? null,
          event_type: event.type ?? null,
          series_master_id: event.seriesMasterId ?? null,
          recurrence: event.recurrence ?? null,
          is_cancelled: event.isCancelled ?? false,
          attendees: event.attendees ?? null,
        },
        {onConflict: "outlook_event_id"},
      );

    if (!upsertError) {
      synced++;
    } else {
      console.error("sync-calendar: upsert failed", {
        profileId: profile.id,
        error: upsertError,
      });
    }
  }

  // Remove meetings that were deleted from the calendar
  const {data: existingMeetings, error: existingError} = await admin
    .from("meetings")
    .select("id, outlook_event_id, start_time")
    .eq("user_id", profile.id)
    .eq("team_id", profile.team_id)
    .not("outlook_event_id", "is", null);

  if (existingError) {
    console.error(
      "sync-calendar: failed to fetch existing meetings for deletion check",
      existingError,
    );
  }

  let deleted = 0;
  if (existingMeetings) {
    // Only delete events whose start_time falls within the sync window —
    // events outside the window were legitimately not fetched and should stay.
    const toDelete = existingMeetings
      .filter((m) => {
        if (!m.outlook_event_id || fetchedEventIds.has(m.outlook_event_id)) {
          return false;
        }
        const st = new Date(m.start_time);
        return st >= from && st < to;
      })
      .map((m) => m.id);

    if (toDelete.length > 0) {
      const {error: deleteError} = await admin
        .from("meetings")
        .delete()
        .in("id", toDelete);

      if (deleteError) {
        console.error("sync-calendar: delete failed", deleteError);
      } else {
        deleted = toDelete.length;
      }
    }
  }

  // Recalculate team_cost for all meetings using email-matched member rates
  const {updated, errors} = await recalculateMeetingCosts(
    profile.team_id,
    admin,
  );

  console.log(
    "sync-calendar: finished for profile",
    profile.id,
    `synced=${synced}/${events.length}, deleted=${deleted}, recalculated=${updated} costs (${errors} errors)`,
  );

  return {
    synced,
    total: events.length,
    deleted,
    costsRecalculated: updated,
  };
}

