import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createCalendarEvent,
  markMeetwiseCreatedMeeting,
} from "@/lib/meeting-scheduling/create-event";
import {
  buildGraphRecurrence,
  parseMeetingRecurrenceInput,
} from "@/lib/meeting-scheduling/recurrence";
import {
  isSchedulingLeaderError,
  requireSchedulingLeader,
} from "@/lib/meeting-scheduling/leader-auth";
import { syncCalendarForProfile } from "@/lib/calendar-sync";
import { logSchedulingAudit } from "@/lib/meeting-scheduling/scheduling-audit";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = {
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  attendeeEmails?: string[];
  recurrence?: unknown;
};

export async function POST(req: NextRequest) {
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  if (!ctx.calendarWriteEnabled) {
    return NextResponse.json(
      {
        code: "CALENDAR_WRITE_REQUIRED",
        error: "Calendar write access is required to create meetings",
      },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit("scheduling.create", ctx.userId);
  if (!rateLimit.success) {
    return rateLimitedResponse(
      "RATE_LIMIT_SCHEDULING",
      rateLimit.retryAfterSeconds ?? 60,
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.start || !body.end) {
    return NextResponse.json(
      { error: "Missing meeting start or end time" },
      { status: 400 },
    );
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json(
      { code: "TITLE_REQUIRED", error: "Meeting title is required" },
      { status: 400 },
    );
  }

  const startMs = new Date(body.start).getTime();
  const endMs = new Date(body.end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return NextResponse.json(
      { error: "Invalid meeting start or end time" },
      { status: 400 },
    );
  }

  const attendeeEmails = Array.isArray(body.attendeeEmails)
    ? [...new Set(body.attendeeEmails.map((e) => e.trim().toLowerCase()))].filter(
        Boolean,
      )
    : [];

  if (attendeeEmails.length === 0) {
    return NextResponse.json(
      { error: "Select at least one attendee" },
      { status: 400 },
    );
  }

  const startIso = new Date(body.start).toISOString();
  const endIso = new Date(body.end).toISOString();

  let graphRecurrence;
  if (body.recurrence != null) {
    const parsed = parseMeetingRecurrenceInput(body.recurrence, startIso);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    graphRecurrence = buildGraphRecurrence(startIso, parsed.value);
  }

  try {
    const created = await createCalendarEvent(ctx.accessToken, {
      title,
      description: body.description?.trim() || undefined,
      startIso,
      endIso,
      attendeeEmails,
      recurrence: graphRecurrence,
    });

    const syncResult = await syncCalendarForProfile(ctx.admin, {
      id: ctx.userId,
      team_id: ctx.teamId,
      microsoft_refresh_token: ctx.microsoftRefreshToken,
    });

    await markMeetwiseCreatedMeeting(
      ctx.admin,
      created.id,
      ctx.teamId,
      ctx.userId,
    );

    revalidatePath("/", "layout");

    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "create",
      outlookEventId: created.id,
      payload: {
        title: created.subject,
        start: created.start,
        end: created.end,
        attendeeCount: attendeeEmails.length,
        recurring: !!graphRecurrence,
      },
    });

    return NextResponse.json({
      ok: true,
      eventId: created.id,
      title: created.subject,
      start: created.start,
      end: created.end,
      recurring: !!graphRecurrence,
      sync: syncResult,
    });
  } catch (err) {
    const status = (err as {status?: number}).status;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          code: "CALENDAR_WRITE_REQUIRED",
          error: "Calendar write access is required to create meetings",
        },
        { status: 403 },
      );
    }
    console.error("meetings create:", err);
    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "create",
      result: "error",
      errorMessage: err instanceof Error ? err.message : "create failed",
      payload: { attendeeCount: attendeeEmails.length, recurring: !!graphRecurrence },
    });
    return NextResponse.json(
      {
        code: "SCHEDULING_CREATE_FAILED",
        error: "Could not create the meeting in Outlook",
      },
      { status: 502 },
    );
  }
}
