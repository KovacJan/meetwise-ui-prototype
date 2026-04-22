import {NextRequest, NextResponse} from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";
import {verifyPollToken} from "@/lib/poll-token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  const token = req.nextUrl.searchParams.get("t") ?? undefined;

  if (!meetingId) {
    return NextResponse.json(
      {error: "meetingId is required"},
      {status: 400},
    );
  }

  const admin = createSupabaseAdminClient();

  const {data: meeting, error} = await admin
    .from("meetings")
    .select("id, title, duration_minutes, start_time, end_time")
    .eq("id", meetingId)
    .maybeSingle();

  if (error || !meeting) {
    return NextResponse.json({error: "Meeting not found"}, {status: 404});
  }

  // Resolve user: session first, then valid email-link token (so we know "already answered" when not logged in)
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    // No session
  }
  if (!userId && token) {
    userId = verifyPollToken(token, meetingId);
  }

  let responded = false;
  let response:
    | {
        wasUseful: "yes" | "partially" | "no";
        actualDurationMinutes: number;
        focusLevel: "high" | "medium" | "low" | null;
        submittedAt: string;
      }
    | null = null;

  if (userId) {
    const {data: resp} = await admin
      .from("poll_responses")
      .select(
        "was_useful, actual_duration_minutes, focus_level, submitted_at",
      )
      .eq("meeting_id", meetingId)
      .eq("user_id", userId)
      .maybeSingle();

    if (resp) {
      responded = true;
      response = {
        wasUseful: resp.was_useful as "yes" | "partially" | "no",
        actualDurationMinutes: resp.actual_duration_minutes,
        focusLevel: (resp.focus_level as any) ?? null,
        submittedAt: resp.submitted_at,
      };
    }
  }

  return NextResponse.json({
    title: meeting.title,
    durationMinutes: meeting.duration_minutes,
    startTime: meeting.start_time,
    endTime: meeting.end_time,
    responded,
    response,
  });
}

