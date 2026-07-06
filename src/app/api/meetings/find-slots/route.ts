import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";
import { findMeetingTimeSlots } from "@/lib/meeting-scheduling/find-slots";import {
  isSchedulingLeaderError,
  requireSchedulingLeader,
} from "@/lib/meeting-scheduling/leader-auth";
import { logSchedulingAudit } from "@/lib/meeting-scheduling/scheduling-audit";
import { loadTeamSchedulingSettings } from "@/lib/meeting-scheduling/team-scheduling-settings";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

type Body = {
  attendeeEmails?: string[];
  durationMinutes?: number;
  searchWindowDays?: number;
};

export async function POST(req: NextRequest) {
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  const rateLimit = await checkRateLimit(
    "scheduling.findSlots",
    ctx.userId,
  );
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

  const attendeeEmails = Array.isArray(body.attendeeEmails)
    ? [...new Set(body.attendeeEmails.map((e) => e.trim().toLowerCase()))].filter(
        Boolean,
      )
    : [];

  const durationMinutes = Math.min(
    240,
    Math.max(15, Math.round(body.durationMinutes ?? 30)),
  );
  const searchWindowDays =
    Math.round(body.searchWindowDays ?? 7) <= 7 ? 7 : 14;

  if (attendeeEmails.length === 0) {
    return NextResponse.json(
      { error: "Select at least one attendee" },
      { status: 400 },
    );
  }

  if (attendeeEmails.length > 50) {
    return NextResponse.json(
      { error: "Too many attendees (max 50)" },
      { status: 400 },
    );
  }

  try {
    const workingHours = await loadTeamSchedulingSettings(ctx.admin, ctx.teamId);
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const organizerEmail = user?.email?.trim().toLowerCase();

    const result = await findMeetingTimeSlots(ctx.accessToken, {
      attendeeEmails,
      organizerEmail,
      durationMinutes,
      searchWindowDays,
      workingHours,
      maxCandidates: searchWindowDays <= 7 ? 12 : 24,
    });
    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "find_slots",
      payload: {
        attendeeCount: attendeeEmails.length,
        durationMinutes,
        searchWindowDays,
        slotCount: result.slots.length,
      },
    });

    return NextResponse.json({
      slots: result.slots,
      emptyReason: result.emptyReason ?? null,
      durationMinutes,
      searchWindowDays,
      workingHours,
    });
  } catch (err) {
    console.error("find-slots:", err);
    await logSchedulingAudit(ctx.admin, {
      teamId: ctx.teamId,
      actorId: ctx.userId,
      action: "find_slots",
      result: "error",
      errorMessage: err instanceof Error ? err.message : "find-slots failed",
      payload: { attendeeCount: attendeeEmails.length, durationMinutes },
    });
    return NextResponse.json(
      {
        code: "SCHEDULING_FIND_FAILED",
        error: "Could not find meeting times. Try again later.",
      },
      { status: 502 },
    );
  }
}
