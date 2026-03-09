import {NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {sendPollDigestEmail} from "@/lib/resend";
import {SURVEY_WINDOW_DAYS} from "@/config/surveys";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/check-polls-for-user
 *
 * Manual helper endpoint: behaves like the cron job, but only sends a
 * digest email to the **currently authenticated user** instead of the
 * whole team. It does NOT mark meetings as poll_sent. We record each
 * (user, meeting) in poll_digest_sent so the same meeting is never sent
 * to the same user more than once (cron or manual).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn("check-polls-for-user: no authenticated user");
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const admin = createSupabaseAdminClient();

  // Look up the user's profile to get team, email, locale
  const {data: profile, error: profileErr} = await admin
    .from("profiles")
    .select("id, team_id, email, locale")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.team_id) {
    console.warn("check-polls-for-user: missing team/profile", {
      userId: user.id,
      profileErr,
      hasProfile: !!profile,
      teamId: profile?.team_id ?? null,
    });
    return NextResponse.json({error: "No team"}, {status: 400});
  }

  // Use the same window as the Polls page and only include meetings
  // that the current user actually attended (by email).
  const now = new Date();
  const earliestEndTime = new Date(
    now.getTime() - SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const userEmail = (profile.email ?? user.email ?? "")
    .toLowerCase()
    .trim();

  if (!userEmail) {
    console.warn("check-polls-for-user: no email on user/profile", {
      userId: user.id,
      profileEmail: profile.email,
      authEmail: user.email,
    });
    return NextResponse.json({error: "No user email"}, {status: 400});
  }

  // Fetch this team’s meetings that are eligible for surveys
  const {data: meetings, error: meetingsErr} = await admin
    .from("meetings")
    .select(
      "id, title, end_time, duration_minutes, team_id, attendees, is_cancelled, is_all_day, is_excluded",
    )
    .eq("team_id", profile.team_id)
    .neq("is_cancelled", true)
    .neq("is_all_day", true)
    .neq("is_excluded", true)
    .lte("end_time", now.toISOString())
    .gte("end_time", earliestEndTime.toISOString());

  if (meetingsErr) {
    console.error("check-polls-for-user: failed to load meetings", {
      userId: user.id,
      teamId: profile.team_id,
      error: meetingsErr,
    });
    return NextResponse.json({error: meetingsErr.message}, {status: 500});
  }

  if (!meetings || meetings.length === 0) {
    console.log("check-polls-for-user: no meetings in window", {
      userId: user.id,
      teamId: profile.team_id,
    });
    return NextResponse.json({meetings: 0, sent: false});
  }

  // Only include meetings where the current user was an attendee (by email)
  const involved = meetings.filter((m) => {
    const attendees = Array.isArray(m.attendees) ? (m.attendees as any[]) : [];
    return attendees.some((a) => {
      const addr =
        a?.emailAddress?.address &&
        String(a.emailAddress.address).toLowerCase().trim();
      return addr === userEmail;
    });
  });

  if (involved.length === 0) {
    console.log("check-polls-for-user: no meetings where user was attendee", {
      userId: user.id,
      teamId: profile.team_id,
      totalMeetings: meetings.length,
      email: userEmail,
    });
    return NextResponse.json({meetings: 0, sent: false});
  }

  const meetingIds = involved.map((m) => m.id);

  // Which of these meetings has the current user already answered?
  const {data: responses} = await admin
    .from("poll_responses")
    .select("meeting_id")
    .in("meeting_id", meetingIds)
    .eq("user_id", user.id);

  const respondedIds = new Set((responses ?? []).map((r) => r.meeting_id));

  // Which have we already sent a digest for (no duplicate emails)?
  const {data: digestSentRows} = await admin
    .from("poll_digest_sent")
    .select("meeting_id")
    .in("meeting_id", meetingIds)
    .eq("user_id", user.id);

  const digestSentIds = new Set(
    (digestSentRows ?? []).map((r) => r.meeting_id),
  );

  const unanswered = involved.filter(
    (m) => !respondedIds.has(m.id) && !digestSentIds.has(m.id),
  );

  if (unanswered.length === 0) {
    console.log("check-polls-for-user: all meetings already answered", {
      userId: user.id,
      teamId: profile.team_id,
      totalMeetings: involved.length,
    });
    return NextResponse.json({meetings: involved.length, sent: false});
  }

  try {
    await sendPollDigestEmail({
      to: profile.email ?? user.email!,
      meetings: unanswered.map((m) => ({
        id: m.id,
        title: m.title,
        endTime: m.end_time,
        durationMinutes: m.duration_minutes ?? 0,
      })),
      locale: (profile.locale ?? "en") as "en" | "de",
      teamName: null,
      userId: user.id,
    });
    // Record so we never send these meetings to this user again
    if (unanswered.length > 0) {
      await admin.from("poll_digest_sent").insert(
        unanswered.map((m) => ({
          user_id: user.id,
          meeting_id: m.id,
        })),
      );
    }
    console.log("check-polls-for-user: digest email sent", {
      to: profile.email ?? user.email,
      meetings: unanswered.length,
      teamId: profile.team_id,
      userId: user.id,
    });
  } catch (err) {
    console.error("check-polls-for-user: failed to send digest email", {
      to: profile.email ?? user.email,
      error: err,
    });
    return NextResponse.json({error: "Failed to send email"}, {status: 500});
  }

  return NextResponse.json({
    meetings: unanswered.length,
    sent: true,
  });
}

