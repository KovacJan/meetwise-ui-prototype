import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {sendPollEmail} from "@/lib/resend";
import {
  getRepresentativeMeetingId,
  USE_CANONICAL_MEETINGS,
  hasOccurrencePollColumns,
} from "@/lib/poll-occurrences";

type Body = {
  meetingId?: string;
};

export async function POST(req: NextRequest) {
  const admin = createSupabaseAdminClient();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400});
  }

  const meetingId = body.meetingId;
  if (!meetingId) {
    return NextResponse.json({error: "meetingId is required"}, {status: 400});
  }

  let occurrenceId: string | null = null;
  let title: string;
  let teamId: string;
  let legacyMeetingId: string;

  const {data: occurrence} = await admin
    .from("meeting_occurrences")
    .select("id, title, team_id")
    .eq("id", meetingId)
    .maybeSingle();

  if (occurrence) {
    occurrenceId = occurrence.id;
    title = occurrence.title;
    teamId = occurrence.team_id;
    const rep = await getRepresentativeMeetingId(admin, occurrence.id);
    if (!rep) {
      return NextResponse.json({error: "No source meeting for occurrence"}, {status: 404});
    }
    legacyMeetingId = rep;
  } else {
    const {data: meeting, error: meetingError} = await admin
      .from("meetings")
      .select("id, title, team_id, occurrence_id")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({error: "Meeting not found"}, {status: 404});
    }
    legacyMeetingId = meeting.id;
    occurrenceId = meeting.occurrence_id ?? null;
    title = meeting.title;
    teamId = meeting.team_id;
  }

  const pollLinkId = USE_CANONICAL_MEETINGS && occurrenceId ? occurrenceId : legacyMeetingId;

  const {data: profiles, error: profilesError} = await admin
    .from("profiles")
    .select("id, email, outlook_connected, locale")
    .eq("team_id", teamId);

  if (profilesError || !profiles) {
    return NextResponse.json({error: "Could not load team members"}, {status: 500});
  }

  let sent = 0;

  for (const profile of profiles) {
    if (!profile.outlook_connected || !profile.email) continue;

    const {count, error: countError} = await admin
      .from("poll_responses")
      .select("id", {count: "exact", head: true})
      .eq("user_id", profile.id)
      .or(
        occurrenceId
          ? `occurrence_id.eq.${occurrenceId},meeting_id.eq.${legacyMeetingId}`
          : `meeting_id.eq.${legacyMeetingId}`,
      );

    if (countError || (count ?? 0) > 0) continue;

    const locale = (profile.locale as "en" | "de" | null) ?? "en";

    try {
      await sendPollEmail(profile.email, title, pollLinkId, locale);
      sent += 1;
    } catch (e) {
      console.error("Failed to send poll email", e);
    }
  }

  const now = new Date().toISOString();
  if (USE_CANONICAL_MEETINGS && occurrenceId && (await hasOccurrencePollColumns(admin))) {
    await admin
      .from("meeting_occurrences")
      .update({poll_sent: true, poll_sent_at: now})
      .eq("id", occurrenceId);
    await admin
      .from("meetings")
      .update({poll_sent: true, poll_sent_at: now})
      .eq("occurrence_id", occurrenceId);
  } else {
    await admin
      .from("meetings")
      .update({poll_sent: true, poll_sent_at: now})
      .eq("id", legacyMeetingId);
  }

  return NextResponse.json({sent});
}
