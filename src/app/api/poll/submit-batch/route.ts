import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
  RATE_LIMIT_POLICIES,
} from "@/lib/rate-limit";

type ResponseItem = {
  meetingId?: string;
  useful?: "yes" | "partially" | "no";
  duration?: number;
  focus?: "high" | "medium" | "low";
};

type Body = {
  responses?: ResponseItem[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const responses = Array.isArray(body.responses) ? body.responses : [];
  if (responses.length === 0) {
    return NextResponse.json(
      { error: "No responses to submit" },
      { status: 400 },
    );
  }
  if (responses.length > RATE_LIMIT_POLICIES.pollBatch.maxSize) {
    return NextResponse.json(
      { code: "RATE_LIMIT_POLL", error: "Batch size exceeds limit" },
      { status: 400 },
    );
  }

  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit("poll.ip", ip);
  if (!rateLimit.success) {
    return rateLimitedResponse(
      "RATE_LIMIT_POLL",
      rateLimit.retryAfterSeconds ?? 60,
    );
  }

  // Validate each item
  const valid: Array<{
    meetingId: string;
    sourceMeetingId?: string;
    occurrenceId?: string | null;
    useful: "yes" | "partially" | "no";
    duration: number;
    focus: "high" | "medium" | "low" | null;
  }> = [];
  for (const r of responses) {
    if (
      !r.meetingId ||
      !r.useful ||
      !["yes", "partially", "no"].includes(r.useful) ||
      !r.duration ||
      r.duration <= 0
    ) {
      return NextResponse.json(
        { error: "Missing or invalid poll data in one or more responses" },
        { status: 400 },
      );
    }
    const focusLevel =
      r.focus && ["high", "medium", "low"].includes(r.focus) ? r.focus : null;
    valid.push({
      meetingId: r.meetingId,
      useful: r.useful,
      duration: r.duration,
      focus: focusLevel,
    });
  }

  const admin = createSupabaseAdminClient();

  // Resolve user once for the whole batch
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // No session
  }

  const now = new Date().toISOString();

  // Resolve canonical occurrence + source meeting ids in bulk.
  const requestedIds = valid.map((v) => v.meetingId);
  const { data: occurrenceRows } = await admin
    .from("meeting_occurrences")
    .select("id")
    .in("id", requestedIds);
  const occurrenceIdsSet = new Set((occurrenceRows ?? []).map((r) => r.id));

  const directOccurrenceIds = [...occurrenceIdsSet];
  const sourceByOccurrence = new Map<string, string>();
  if (directOccurrenceIds.length > 0) {
    const { data: sourceRows } = await admin
      .from("meetings")
      .select("id, occurrence_id, created_at")
      .in("occurrence_id", directOccurrenceIds)
      .order("created_at", { ascending: true });
    for (const row of sourceRows ?? []) {
      if (!row.occurrence_id) continue;
      if (!sourceByOccurrence.has(row.occurrence_id)) {
        sourceByOccurrence.set(row.occurrence_id, row.id);
      }
    }
  }

  const directMeetingIds = requestedIds.filter(
    (id) => !occurrenceIdsSet.has(id),
  );
  const { data: directMeetingRows } = await admin
    .from("meetings")
    .select("id, occurrence_id")
    .in(
      "id",
      directMeetingIds.length > 0
        ? directMeetingIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  const meetingById = new Map((directMeetingRows ?? []).map((r) => [r.id, r]));

  for (const item of valid) {
    if (occurrenceIdsSet.has(item.meetingId)) {
      item.occurrenceId = item.meetingId;
      item.sourceMeetingId = sourceByOccurrence.get(item.meetingId);
    } else {
      const row = meetingById.get(item.meetingId);
      item.sourceMeetingId = row?.id;
      item.occurrenceId = row?.occurrence_id ?? null;
    }
  }

  if (valid.some((v) => !v.sourceMeetingId)) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Check existing responses for this user (one query for all occurrence/source ids)
  if (userId) {
    const sourceMeetingIds = valid.map((v) => v.sourceMeetingId!) as string[];
    const occurrenceIds = valid
      .map((v) => v.occurrenceId)
      .filter((id): id is string => Boolean(id));
    const { data: existing } = await admin
      .from("poll_responses")
      .select("meeting_id, occurrence_id")
      .eq("user_id", userId)
      .or(
        [
          `meeting_id.in.(${sourceMeetingIds.join(",")})`,
          occurrenceIds.length > 0
            ? `occurrence_id.in.(${occurrenceIds.join(",")})`
            : "",
        ]
          .filter(Boolean)
          .join(","),
      );
    const alreadyByMeeting = new Set(
      (existing ?? []).map((r: { meeting_id: string }) => r.meeting_id),
    );
    const alreadyByOccurrence = new Set(
      (existing ?? [])
        .map((r: { occurrence_id?: string | null }) => r.occurrence_id)
        .filter(Boolean),
    );
    const duplicate = valid.find(
      (v) =>
        alreadyByMeeting.has(v.sourceMeetingId!) ||
        (!!v.occurrenceId && alreadyByOccurrence.has(v.occurrenceId)),
    );
    if (duplicate) {
      return NextResponse.json(
        { error: "You have already responded to one or more of these surveys" },
        { status: 409 },
      );
    }
  }

  // Single insert with all rows — one DB round-trip
  const rows = valid.map((v) => ({
    meeting_id: v.sourceMeetingId!,
    occurrence_id: v.occurrenceId ?? null,
    user_id: userId,
    was_useful: v.useful,
    actual_duration_minutes: v.duration,
    focus_level: v.focus,
    submitted_at: now,
  }));

  const { error: insertError } = await admin
    .from("poll_responses")
    .insert(rows);

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to save poll responses" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
