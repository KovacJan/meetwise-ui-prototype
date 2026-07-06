import {buildAttendeesPayload} from "./attendees";
import {graphDateTime} from "./graph-datetime";

export type UpdateCalendarEventInput = {
  title?: string;
  startIso?: string;
  endIso?: string;
  attendeeEmails?: string[];
  timeZone?: string;
};

export function buildUpdateEventBody(input: UpdateCalendarEventInput) {
  const timeZone = input.timeZone ?? "UTC";
  const body: Record<string, unknown> = {};

  if (input.title !== undefined) {
    body.subject = input.title.trim() || "Meeting";
  }
  if (input.startIso) {
    body.start = {dateTime: graphDateTime(input.startIso), timeZone};
  }
  if (input.endIso) {
    body.end = {dateTime: graphDateTime(input.endIso), timeZone};
  }
  if (input.attendeeEmails) {
    body.attendees = buildAttendeesPayload(input.attendeeEmails);
  }

  return body;
}

export async function updateCalendarEvent(
  accessToken: string,
  outlookEventId: string,
  input: UpdateCalendarEventInput,
): Promise<void> {
  const body = buildUpdateEventBody(input);
  if (Object.keys(body).length === 0) return;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookEventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: `outlook.timezone="${input.timeZone ?? "UTC"}"`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`updateEvent failed: ${text}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
}

export async function cancelCalendarEvent(
  accessToken: string,
  outlookEventId: string,
): Promise<void> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookEventId)}`,
    {
      method: "DELETE",
      headers: {Authorization: `Bearer ${accessToken}`},
    },
  );

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`cancelEvent failed: ${text}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
}
