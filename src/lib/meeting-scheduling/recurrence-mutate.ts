import {parseAttendeeEmails} from "./attendees";
import {createCalendarEvent} from "./create-event";
import {graphStartDate} from "./recurrence";
import {
  buildUpdateEventBody,
  cancelCalendarEvent,
  updateCalendarEvent,
  type UpdateCalendarEventInput,
} from "./mutate-event";
import type {RecurrenceEditScope} from "./recurrence-scope";

type GraphRecurrence = {
  pattern: Record<string, unknown>;
  range: Record<string, unknown>;
};

export type GraphEventSnapshot = {
  id: string;
  subject: string;
  start: string;
  end: string;
  recurrence: GraphRecurrence | null;
  attendeeEmails: string[];
};

function graphError(res: Response, text: string): Error & {status?: number} {
  const err = new Error(`Graph request failed: ${text}`) as Error & {status?: number};
  err.status = res.status;
  return err;
}

export async function fetchGraphEvent(
  accessToken: string,
  eventId: string,
): Promise<GraphEventSnapshot> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
  );
  url.searchParams.set(
    "$select",
    "id,subject,start,end,recurrence,attendees",
  );

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    throw graphError(res, await res.text());
  }

  const json = (await res.json()) as {
    id: string;
    subject?: string;
    start?: {dateTime?: string};
    end?: {dateTime?: string};
    recurrence?: GraphRecurrence | null;
    attendees?: unknown[];
  };

  return {
    id: json.id,
    subject: json.subject ?? "Meeting",
    start: json.start?.dateTime ?? "",
    end: json.end?.dateTime ?? "",
    recurrence: json.recurrence ?? null,
    attendeeEmails: parseAttendeeEmails(json.attendees),
  };
}

export function dayBeforeStartDate(iso: string): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return graphStartDate(d.toISOString());
}

export function buildTruncatedRecurrence(
  recurrence: GraphRecurrence,
  beforeOccurrenceStartIso: string,
): GraphRecurrence {
  const endDate = dayBeforeStartDate(beforeOccurrenceStartIso);
  const startDate =
    typeof recurrence.range.startDate === "string"
      ? recurrence.range.startDate
      : graphStartDate(beforeOccurrenceStartIso);

  return {
    pattern: {...recurrence.pattern},
    range: {
      ...recurrence.range,
      type: "endDate",
      startDate,
      endDate,
    },
  };
}

export function buildFollowingRecurrence(
  masterRecurrence: GraphRecurrence,
  newSeriesStartIso: string,
): GraphRecurrence {
  const startDate = graphStartDate(newSeriesStartIso);
  const range = {...masterRecurrence.range};
  range.startDate = startDate;
  if (range.type === "numbered") {
    delete range.endDate;
  }
  return {
    pattern: {...masterRecurrence.pattern},
    range,
  };
}

export async function truncateSeriesBefore(
  accessToken: string,
  seriesMasterId: string,
  beforeOccurrenceStartIso: string,
  master?: GraphEventSnapshot,
): Promise<void> {
  const snapshot = master ?? (await fetchGraphEvent(accessToken, seriesMasterId));
  if (!snapshot.recurrence) {
    throw new Error("Series master has no recurrence pattern");
  }

  const recurrence = buildTruncatedRecurrence(
    snapshot.recurrence,
    beforeOccurrenceStartIso,
  );

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(seriesMasterId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="UTC"',
      },
      body: JSON.stringify({recurrence}),
    },
  );

  if (!res.ok) {
    throw graphError(res, await res.text());
  }
}

function durationMs(startIso: string, endIso: string): number {
  return Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
}

export async function applyRecurringUpdate(
  accessToken: string,
  scope: RecurrenceEditScope,
  params: {
    outlookEventId: string;
    seriesMasterOutlookId: string | null;
    occurrenceStartIso: string;
    occurrenceEndIso: string;
    update: UpdateCalendarEventInput;
  },
): Promise<void> {
  const timeZone = params.update.timeZone ?? "UTC";

  if (scope === "occurrence" || !params.seriesMasterOutlookId) {
    await updateCalendarEvent(accessToken, params.outlookEventId, params.update);
    return;
  }

  if (scope === "series") {
    await updateCalendarEvent(
      accessToken,
      params.seriesMasterOutlookId,
      params.update,
    );
    return;
  }

  const master = await fetchGraphEvent(
    accessToken,
    params.seriesMasterOutlookId,
  );
  if (!master.recurrence) {
    throw new Error("Cannot split series without recurrence");
  }

  await truncateSeriesBefore(
    accessToken,
    params.seriesMasterOutlookId,
    params.occurrenceStartIso,
    master,
  );

  const startIso =
    params.update.startIso ?? params.occurrenceStartIso;
  const endIso =
    params.update.endIso ??
    new Date(
      new Date(startIso).getTime() +
        durationMs(params.occurrenceStartIso, params.occurrenceEndIso),
    ).toISOString();

  const attendeeEmails = params.update.attendeeEmails ?? master.attendeeEmails;

  await createCalendarEvent(accessToken, {
    title: params.update.title ?? master.subject,
    startIso,
    endIso,
    attendeeEmails,
    timeZone,
    recurrence: buildFollowingRecurrence(master.recurrence, startIso),
  });
}

export async function applyRecurringCancel(
  accessToken: string,
  scope: RecurrenceEditScope,
  params: {
    outlookEventId: string;
    seriesMasterOutlookId: string | null;
    occurrenceStartIso: string;
  },
): Promise<void> {
  if (scope === "occurrence" || !params.seriesMasterOutlookId) {
    await cancelCalendarEvent(accessToken, params.outlookEventId);
    return;
  }

  if (scope === "series") {
    await cancelCalendarEvent(accessToken, params.seriesMasterOutlookId);
    return;
  }

  const master = await fetchGraphEvent(
    accessToken,
    params.seriesMasterOutlookId,
  );
  await truncateSeriesBefore(
    accessToken,
    params.seriesMasterOutlookId,
    params.occurrenceStartIso,
    master,
  );
}

export {buildUpdateEventBody};
