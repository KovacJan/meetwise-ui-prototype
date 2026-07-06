import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  applyRecurringCancel,
  applyRecurringUpdate,
} from "@/lib/meeting-scheduling/recurrence-mutate";
import { parseRecurrenceEditScope } from "@/lib/meeting-scheduling/recurrence-scope";
import {
  isSchedulingLeaderError,
  requireSchedulingLeader,
} from "@/lib/meeting-scheduling/leader-auth";
import { resolveLeaderOutlookEvent } from "@/lib/meeting-scheduling/resolve-outlook-event";
import { logSchedulingAudit } from "@/lib/meeting-scheduling/scheduling-audit";
import {
  graphHttpErrorStatus,
  syncAfterSchedulingMutation,
} from "@/lib/meeting-scheduling/sync-after-mutation";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ occurrenceId: string }> };

type PatchBody = {
  title?: string;
  start?: string;
  end?: string;
  attendeeEmails?: string[];
  scope?: string;
};

type DeleteBody = {
  scope?: string;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { occurrenceId } = await params;
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  const resolved = await resolveLeaderOutlookEvent(
    ctx.admin,
    occurrenceId,
    ctx.userId,
    ctx.teamId,
  );

  if (!resolved) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const { data: members } = await ctx.admin
    .from("team_members")
    .select("email, display_name")
    .eq("team_id", ctx.teamId)
    .neq("status", "pending")
    .eq("is_excluded", false);

  return NextResponse.json({
    ...resolved,
    calendarWriteEnabled: ctx.calendarWriteEnabled,
    teamAttendees: (members ?? []).map((m) => ({
      email: m.email,
      name: m.display_name,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { occurrenceId } = await params;
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  if (!ctx.calendarWriteEnabled) {
    return NextResponse.json(
      { code: "CALENDAR_WRITE_REQUIRED", error: "Calendar write access required" },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit("scheduling.update", ctx.userId);
  if (!rateLimit.success) {
    return rateLimitedResponse(
      "RATE_LIMIT_SCHEDULING",
      rateLimit.retryAfterSeconds ?? 60,
    );
  }

  const resolved = await resolveLeaderOutlookEvent(
    ctx.admin,
    occurrenceId,
    ctx.userId,
    ctx.teamId,
  );
  if (!resolved) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!resolved.canEdit || !resolved.outlookEventId) {
    return NextResponse.json(
      { code: resolved.editBlockedCode ?? "NOT_ORGANIZER", error: "Cannot edit this meeting" },
      { status: 403 },
    );
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attendeeEmails = Array.isArray(body.attendeeEmails)
    ? [...new Set(body.attendeeEmails.map((e) => e.trim().toLowerCase()))].filter(
        Boolean,
      )
    : undefined;

  if (body.start && body.end) {
    const startMs = new Date(body.start).getTime();
    const endMs = new Date(body.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      return NextResponse.json({ error: "Invalid start or end time" }, { status: 400 });
    }
  }

  try {
    const scope = parseRecurrenceEditScope(body.scope, resolved.isRecurring);

    if (
      scope !== "occurrence" &&
      resolved.isRecurring &&
      !resolved.seriesMasterOutlookId
    ) {
      return NextResponse.json(
        { code: "SERIES_SCOPE_UNAVAILABLE", error: "Series scope unavailable" },
        { status: 400 },
      );
    }

    await applyRecurringUpdate(ctx.accessToken, scope, {
      outlookEventId: resolved.outlookEventId,
      seriesMasterOutlookId: resolved.seriesMasterOutlookId,
      occurrenceStartIso: resolved.start,
      occurrenceEndIso: resolved.end,
      update: {
        title: body.title,
        startIso: body.start ? new Date(body.start).toISOString() : undefined,
        endIso: body.end ? new Date(body.end).toISOString() : undefined,
        attendeeEmails,
      },
    });

    const syncResult = await syncAfterSchedulingMutation(
      ctx.admin,
      ctx.userId,
      ctx.teamId,
      ctx.microsoftRefreshToken,
    );

    revalidatePath("/", "layout");

    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "update",
      occurrenceId,
      outlookEventId: resolved.outlookEventId,
      scope,
      payload: {
        title: body.title,
        start: body.start,
        end: body.end,
        attendeeCount: attendeeEmails?.length,
      },
    });

    return NextResponse.json({ ok: true, sync: syncResult });
  } catch (err) {
    const status = graphHttpErrorStatus(err);
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { code: "CALENDAR_WRITE_REQUIRED", error: "Calendar write access required" },
        { status: 403 },
      );
    }
    console.error("meetings PATCH:", err);
    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "update",
      occurrenceId,
      outlookEventId: resolved.outlookEventId,
      scope: parseRecurrenceEditScope(body.scope, resolved.isRecurring),
      result: "error",
      errorMessage: err instanceof Error ? err.message : "update failed",
    });
    return NextResponse.json(
      { code: "SCHEDULING_UPDATE_FAILED", error: "Could not update meeting" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { occurrenceId } = await params;
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  if (!ctx.calendarWriteEnabled) {
    return NextResponse.json(
      { code: "CALENDAR_WRITE_REQUIRED", error: "Calendar write access required" },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit("scheduling.cancel", ctx.userId);
  if (!rateLimit.success) {
    return rateLimitedResponse(
      "RATE_LIMIT_SCHEDULING",
      rateLimit.retryAfterSeconds ?? 60,
    );
  }

  const resolved = await resolveLeaderOutlookEvent(
    ctx.admin,
    occurrenceId,
    ctx.userId,
    ctx.teamId,
  );
  if (!resolved) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!resolved.canEdit || !resolved.outlookEventId) {
    return NextResponse.json(
      { code: resolved.editBlockedCode ?? "NOT_ORGANIZER", error: "Cannot cancel this meeting" },
      { status: 403 },
    );
  }

  let deleteBody: DeleteBody = {};
  try {
    const text = await req.text();
    if (text) deleteBody = JSON.parse(text) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scope = parseRecurrenceEditScope(deleteBody.scope, resolved.isRecurring);

  if (
    scope !== "occurrence" &&
    resolved.isRecurring &&
    !resolved.seriesMasterOutlookId
  ) {
    return NextResponse.json(
      { code: "SERIES_SCOPE_UNAVAILABLE", error: "Series scope unavailable" },
      { status: 400 },
    );
  }

  try {
    await applyRecurringCancel(ctx.accessToken, scope, {
      outlookEventId: resolved.outlookEventId,
      seriesMasterOutlookId: resolved.seriesMasterOutlookId,
      occurrenceStartIso: resolved.start,
    });
    const syncResult = await syncAfterSchedulingMutation(
      ctx.admin,
      ctx.userId,
      ctx.teamId,
      ctx.microsoftRefreshToken,
    );

    revalidatePath("/", "layout");

    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "cancel",
      occurrenceId,
      outlookEventId: resolved.outlookEventId,
      scope,
    });

    return NextResponse.json({ ok: true, sync: syncResult });
  } catch (err) {
    const status = graphHttpErrorStatus(err);
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { code: "CALENDAR_WRITE_REQUIRED", error: "Calendar write access required" },
        { status: 403 },
      );
    }
    console.error("meetings DELETE:", err);
    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "cancel",
      occurrenceId,
      outlookEventId: resolved.outlookEventId,
      scope,
      result: "error",
      errorMessage: err instanceof Error ? err.message : "cancel failed",
    });
    return NextResponse.json(
      { code: "SCHEDULING_CANCEL_FAILED", error: "Could not cancel meeting" },
      { status: 502 },
    );
  }
}
