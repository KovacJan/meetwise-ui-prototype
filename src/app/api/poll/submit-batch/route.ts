import {NextRequest, NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";

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
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400});
  }

  const responses = Array.isArray(body.responses) ? body.responses : [];
  if (responses.length === 0) {
    return NextResponse.json(
      {error: "No responses to submit"},
      {status: 400},
    );
  }

  // Validate each item
  const valid: Array<{
    meetingId: string;
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
        {error: "Missing or invalid poll data in one or more responses"},
        {status: 400},
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
      data: {user},
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // No session
  }

  const now = new Date().toISOString();

  // Check existing responses for this user (one query for all meeting ids)
  if (userId) {
    const meetingIds = valid.map((v) => v.meetingId);
    const {data: existing} = await admin
      .from("poll_responses")
      .select("meeting_id")
      .eq("user_id", userId)
      .in("meeting_id", meetingIds);
    const alreadyResponded = new Set(
      (existing ?? []).map((r: {meeting_id: string}) => r.meeting_id),
    );
    const duplicate = valid.find((v) => alreadyResponded.has(v.meetingId));
    if (duplicate) {
      return NextResponse.json(
        {error: "You have already responded to one or more of these surveys"},
        {status: 409},
      );
    }
  }

  // Verify all meetings exist (one query)
  const meetingIds = valid.map((v) => v.meetingId);
  const {data: meetings} = await admin
    .from("meetings")
    .select("id")
    .in("id", meetingIds);
  const foundIds = new Set((meetings ?? []).map((m: {id: string}) => m.id));
  const missing = valid.find((v) => !foundIds.has(v.meetingId));
  if (missing) {
    return NextResponse.json(
      {error: "Meeting not found"},
      {status: 404},
    );
  }

  // Single insert with all rows — one DB round-trip
  const rows = valid.map((v) => ({
    meeting_id: v.meetingId,
    user_id: userId,
    was_useful: v.useful,
    actual_duration_minutes: v.duration,
    focus_level: v.focus,
    submitted_at: now,
  }));

  const {error: insertError} = await admin.from("poll_responses").insert(rows);

  if (insertError) {
    return NextResponse.json(
      {error: "Failed to save poll responses"},
      {status: 500},
    );
  }

  return NextResponse.json({ok: true, count: rows.length});
}
