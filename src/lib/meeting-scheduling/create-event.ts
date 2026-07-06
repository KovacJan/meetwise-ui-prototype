import type {SupabaseClient} from "@supabase/supabase-js";

import {buildAttendeesPayload} from "./attendees";
import {graphDateTime} from "./graph-datetime";
import type {GraphRecurrence} from "./recurrence";

export type CreateCalendarEventInput = {
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
  timeZone?: string;
  recurrence?: GraphRecurrence;
};

export type CreatedCalendarEvent = {
  id: string;
  iCalUId: string | null;
  subject: string;
  start: string;
  end: string;
};

export function buildCreateEventBody(input: CreateCalendarEventInput) {
  const timeZone = input.timeZone ?? "UTC";
  const body: Record<string, unknown> = {
    subject: input.title.trim() || "Meeting",
    start: {dateTime: graphDateTime(input.startIso), timeZone},
    end: {dateTime: graphDateTime(input.endIso), timeZone},
    attendees: buildAttendeesPayload(input.attendeeEmails),
  };
  if (input.recurrence) {
    body.recurrence = input.recurrence;
  }
  const description = input.description?.trim();
  if (description) {
    body.body = {contentType: "text", content: description};
  }
  return body;
}

export async function createCalendarEvent(
  accessToken: string,
  input: CreateCalendarEventInput,
): Promise<CreatedCalendarEvent> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: `outlook.timezone="${input.timeZone ?? "UTC"}"`,
    },
    body: JSON.stringify(buildCreateEventBody(input)),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`createEvent failed: ${text}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    id: string;
    iCalUId?: string;
    subject?: string;
    start?: {dateTime?: string};
    end?: {dateTime?: string};
  };

  return {
    id: json.id,
    iCalUId: json.iCalUId ?? null,
    subject: json.subject ?? input.title,
    start: json.start?.dateTime ?? input.startIso,
    end: json.end?.dateTime ?? input.endIso,
  };
}

export async function markMeetwiseCreatedMeeting(
  admin: SupabaseClient,
  outlookEventId: string,
  teamId: string,
  userId: string,
): Promise<void> {
  const {error} = await admin
    .from("meetings")
    .update({created_via: "meetwise", created_by: userId})
    .eq("outlook_event_id", outlookEventId)
    .eq("team_id", teamId);

  if (error) {
    console.error("markMeetwiseCreatedMeeting:", error.message);
  }
}
