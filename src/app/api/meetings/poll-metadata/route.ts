import {NextRequest, NextResponse} from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";
import {verifyPollToken} from "@/lib/poll-token";
import {resolvePollMetadata} from "@/lib/poll-occurrences";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  const token = req.nextUrl.searchParams.get("t") ?? undefined;

  if (!meetingId) {
    return NextResponse.json({error: "meetingId is required"}, {status: 400});
  }

  const admin = createSupabaseAdminClient();
  const meta = await resolvePollMetadata(admin, meetingId);

  if (!meta) {
    return NextResponse.json({error: "Meeting not found"}, {status: 404});
  }

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
    const pollKey = meta.occurrenceId ?? meetingId;
    const field = meta.occurrenceId ? "occurrence_id" : "meeting_id";

    const {data: resp} = await admin
      .from("poll_responses")
      .select("was_useful, actual_duration_minutes, focus_level, submitted_at")
      .eq(field, pollKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (resp) {
      responded = true;
      response = {
        wasUseful: resp.was_useful as "yes" | "partially" | "no",
        actualDurationMinutes: resp.actual_duration_minutes,
        focusLevel: (resp.focus_level as "high" | "medium" | "low" | null) ?? null,
        submittedAt: resp.submitted_at,
      };
    }
  }

  return NextResponse.json({
    title: meta.title,
    durationMinutes: meta.durationMinutes,
    startTime: meta.startTime,
    endTime: meta.endTime,
    responded,
    response,
  });
}
