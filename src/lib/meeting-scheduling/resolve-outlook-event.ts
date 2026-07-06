import type {SupabaseClient} from "@supabase/supabase-js";

import {parseAttendeeEmails} from "./attendees";
import {
  availableRecurrenceScopes,
  type RecurrenceEditScope,
} from "./recurrence-scope";

export type ResolvedOutlookEvent = {
  occurrenceId: string;
  outlookEventId: string | null;
  seriesMasterOutlookId: string | null;
  title: string;
  start: string;
  end: string;
  attendeeEmails: string[];
  eventType: string | null;
  isRecurring: boolean;
  recurrenceScopes: RecurrenceEditScope[];
  canEdit: boolean;
  editBlockedCode: "NOT_ORGANIZER" | "NO_OUTLOOK_EVENT" | null;
};

function isRecurringEventType(eventType: string | null, seriesMasterId: string | null): boolean {
  if (seriesMasterId) return true;
  return (
    eventType === "occurrence" ||
    eventType === "exception" ||
    eventType === "seriesMaster"
  );
}

export async function resolveLeaderOutlookEvent(
  admin: SupabaseClient,
  occurrenceId: string,
  leaderId: string,
  teamId: string,
): Promise<ResolvedOutlookEvent | null> {
  const {data: occurrence} = await admin
    .from("meeting_occurrences")
    .select(
      "id, title, start_time, end_time, duration_minutes, attendees, event_type, series_master_id, is_cancelled",
    )
    .eq("id", occurrenceId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!occurrence) return null;

  const {data: leaderMeeting} = await admin
    .from("meetings")
    .select(
      "outlook_event_id, title, start_time, end_time, attendees, event_type, series_master_id",
    )
    .eq("occurrence_id", occurrenceId)
    .eq("team_id", teamId)
    .eq("user_id", leaderId)
    .not("outlook_event_id", "is", null)
    .maybeSingle();

  const title = leaderMeeting?.title ?? occurrence.title ?? "Meeting";
  const start = leaderMeeting?.start_time ?? occurrence.start_time;
  const end =
    leaderMeeting?.end_time ??
    occurrence.end_time ??
    new Date(
      new Date(start).getTime() + (occurrence.duration_minutes ?? 30) * 60000,
    ).toISOString();

  const attendeeEmails = parseAttendeeEmails(
    leaderMeeting?.attendees ?? occurrence.attendees,
  );

  const eventType =
    leaderMeeting?.event_type ?? occurrence.event_type ?? null;

  const seriesMasterOutlookId =
    leaderMeeting?.series_master_id ?? occurrence.series_master_id ?? null;

  const isRecurring = isRecurringEventType(eventType, seriesMasterOutlookId);
  const recurrenceScopes = availableRecurrenceScopes(
    isRecurring,
    !!seriesMasterOutlookId,
  );

  if (!leaderMeeting?.outlook_event_id) {
    return {
      occurrenceId,
      outlookEventId: null,
      seriesMasterOutlookId,
      title,
      start,
      end,
      attendeeEmails,
      eventType,
      isRecurring,
      recurrenceScopes,
      canEdit: false,
      editBlockedCode: "NOT_ORGANIZER",
    };
  }

  return {
    occurrenceId,
    outlookEventId: leaderMeeting.outlook_event_id,
    seriesMasterOutlookId,
    title,
    start,
    end,
    attendeeEmails,
    eventType,
    isRecurring,
    recurrenceScopes,
    canEdit: true,
    editBlockedCode: null,
  };
}
