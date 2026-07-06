import {NextRequest, NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {verifyPollToken} from "@/lib/poll-token";
import {
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "@/lib/rate-limit";

type Body = {
  meetingId?: string;
  useful?: "yes" | "partially" | "no";
  duration?: number;
  focus?: "high" | "medium" | "low";
  /** Signed token from email link (t param); used when user is not logged in */
  t?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400});
  }

  const {meetingId, useful, duration, focus, t: token} = body;

  if (!meetingId || !useful || !["yes", "partially", "no"].includes(useful)) {
    return NextResponse.json(
      {error: "Missing or invalid poll data"},
      {status: 400},
    );
  }
  if (!duration || duration <= 0) {
    return NextResponse.json(
      {error: "Duration must be a positive number"},
      {status: 400},
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

  const admin = createSupabaseAdminClient();

  const focusLevel =
    focus && ["high", "medium", "low"].includes(focus) ? focus : null;

  // Resolve canonical occurrence + legacy source meeting id.
  let occurrenceId: string | null = null;
  let sourceMeetingId: string | null = null;
  const {data: occurrenceRow} = await admin
    .from("meeting_occurrences")
    .select("id")
    .eq("id", meetingId)
    .maybeSingle();
  if (occurrenceRow?.id) {
    occurrenceId = occurrenceRow.id;
    const {data: sourceRow} = await admin
      .from("meetings")
      .select("id")
      .eq("occurrence_id", occurrenceId)
      .order("created_at", {ascending: true})
      .limit(1)
      .maybeSingle();
    sourceMeetingId = sourceRow?.id ?? null;
  } else {
    const {data: sourceRow} = await admin
      .from("meetings")
      .select("id, occurrence_id")
      .eq("id", meetingId)
      .maybeSingle();
    sourceMeetingId = sourceRow?.id ?? null;
    occurrenceId = sourceRow?.occurrence_id ?? null;
  }

  if (!sourceMeetingId) {
    return NextResponse.json({error: "Meeting not found"}, {status: 404});
  }

  // Resolve user: session first, then valid email-link token (so response is tied to user when opened from email)
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
  if (!userId && token) {
    userId = verifyPollToken(token, meetingId);
  }

  // Prevent duplicate in-app responses for the same authenticated user
  if (userId) {
    const {count} = await admin
      .from("poll_responses")
      .select("id", {count: "exact", head: true})
      .eq("user_id", userId)
      .eq(
        occurrenceId ? "occurrence_id" : "meeting_id",
        occurrenceId ?? sourceMeetingId,
      );

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {error: "You have already responded to this survey"},
        {status: 409},
      );
    }
  }

  const {error: insertError} = await admin.from("poll_responses").insert({
    meeting_id: sourceMeetingId,
    occurrence_id: occurrenceId,
    user_id: userId,
    was_useful: useful,
    actual_duration_minutes: duration,
    focus_level: focusLevel,
    submitted_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json(
      {error: "Failed to save poll response"},
      {status: 500},
    );
  }

  return NextResponse.json({ok: true});
}
