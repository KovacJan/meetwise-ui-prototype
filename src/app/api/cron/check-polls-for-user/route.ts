import {NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {sendPollDigestEmail} from "@/lib/resend";
import {SURVEY_WINDOW_DAYS} from "@/config/surveys";
import {
  occurrenceHasAttendee,
  getRepresentativeMeetingId,
  USE_CANONICAL_MEETINGS,
  hasPollDigestOccurrenceColumn,
} from "@/lib/poll-occurrences";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const admin = createSupabaseAdminClient();

  const {data: profile, error: profileErr} = await admin
    .from("profiles")
    .select("id, team_id, email, locale")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.team_id) {
    return NextResponse.json({error: "No team"}, {status: 400});
  }

  const now = new Date();
  const earliestEndTime = new Date(
    now.getTime() - SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const userEmail = (profile.email ?? user.email ?? "").toLowerCase().trim();
  if (!userEmail) {
    return NextResponse.json({error: "No user email"}, {status: 400});
  }

  type Row = {
    id: string;
    title: string;
    end_time: string | null;
    start_time: string;
    duration_minutes: number;
    attendees?: unknown;
  };

  let involved: Row[] = [];

  if (USE_CANONICAL_MEETINGS) {
    const {data: occurrences, error: occErr} = await admin
      .from("meeting_occurrences")
      .select(
        "id, title, end_time, start_time, duration_minutes, attendees, is_cancelled, is_all_day, is_excluded",
      )
      .eq("team_id", profile.team_id)
      .neq("is_cancelled", true)
      .neq("is_all_day", true)
      .neq("is_excluded", true)
      .not("end_time", "is", null)
      .lte("end_time", now.toISOString())
      .gte("end_time", earliestEndTime.toISOString());

    if (occErr) {
      return NextResponse.json({error: occErr.message}, {status: 500});
    }

    involved = (occurrences ?? []).filter((o) =>
      occurrenceHasAttendee(o, userEmail),
    );
  } else {
    const {data: meetings, error: meetingsErr} = await admin
      .from("meetings")
      .select(
        "id, title, end_time, start_time, duration_minutes, team_id, attendees, is_cancelled, is_all_day, is_excluded",
      )
      .eq("team_id", profile.team_id)
      .neq("is_cancelled", true)
      .neq("is_all_day", true)
      .neq("is_excluded", true)
      .lte("end_time", now.toISOString())
      .gte("end_time", earliestEndTime.toISOString());

    if (meetingsErr) {
      return NextResponse.json({error: meetingsErr.message}, {status: 500});
    }

    involved = (meetings ?? []).filter((m) => occurrenceHasAttendee(m, userEmail));
  }

  if (involved.length === 0) {
    return NextResponse.json({meetings: 0, sent: false});
  }

  const ids = involved.map((o) => o.id);

  const {data: responses} = await admin
    .from("poll_responses")
    .select("occurrence_id, meeting_id")
    .eq("user_id", user.id)
    .or(
      [
        ids.length > 0 ? `occurrence_id.in.(${ids.join(",")})` : "",
        ids.length > 0 ? `meeting_id.in.(${ids.join(",")})` : "",
      ]
        .filter(Boolean)
        .join(","),
    );

  const respondedIds = new Set(
    (responses ?? []).map((r) => r.occurrence_id ?? r.meeting_id),
  );

  const {data: digestSentRows} = await admin
    .from("poll_digest_sent")
    .select("occurrence_id, meeting_id")
    .eq("user_id", user.id)
    .or(
      [
        ids.length > 0 ? `occurrence_id.in.(${ids.join(",")})` : "",
        ids.length > 0 ? `meeting_id.in.(${ids.join(",")})` : "",
      ]
        .filter(Boolean)
        .join(","),
    );

  const digestSentIds = new Set(
    (digestSentRows ?? []).map((r) => r.occurrence_id ?? r.meeting_id),
  );

  const unanswered = involved.filter(
    (o) => !respondedIds.has(o.id) && !digestSentIds.has(o.id),
  );

  if (unanswered.length === 0) {
    return NextResponse.json({meetings: involved.length, sent: false});
  }

  try {
    await sendPollDigestEmail({
      to: profile.email ?? user.email!,
      meetings: unanswered.map((o) => ({
        id: o.id,
        title: o.title,
        endTime: o.end_time ?? o.start_time,
        durationMinutes: o.duration_minutes ?? 0,
      })),
      locale: (profile.locale ?? "en") as "en" | "de",
      teamName: null,
      userId: user.id,
    });

    const digestRows = [];
    const trackOccurrence = await hasPollDigestOccurrenceColumn(admin);
    for (const o of unanswered) {
      const meetingId = USE_CANONICAL_MEETINGS
        ? await getRepresentativeMeetingId(admin, o.id)
        : o.id;
      if (!meetingId) continue;
      digestRows.push({
        user_id: user.id,
        meeting_id: meetingId,
        ...(trackOccurrence && USE_CANONICAL_MEETINGS ? {occurrence_id: o.id} : {}),
      });
    }
    if (digestRows.length > 0) {
      await admin.from("poll_digest_sent").insert(digestRows);
    }
  } catch (err) {
    console.error("check-polls-for-user: failed to send digest email", err);
    return NextResponse.json({error: "Failed to send email"}, {status: 500});
  }

  return NextResponse.json({
    meetings: unanswered.length,
    sent: true,
  });
}
