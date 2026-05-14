import {NextRequest, NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {sendPollEmail} from "@/lib/resend";

type Body = {
  meetingId?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400});
  }

  const meetingId = body.meetingId;
  if (!meetingId) {
    return NextResponse.json(
      {error: "meetingId is required"},
      {status: 400},
    );
  }

  // Load meeting with team + basic info
  const {data: meeting, error: meetingError} = await supabase
    .from("meetings")
    .select("id,title,team_id,poll_sent,poll_sent_at,end_time")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json(
      {error: "Meeting not found"},
      {status: 404},
    );
  }

  // Load all team members; in a real app you'd filter to actual attendees
  const {data: profiles, error: profilesError} = await supabase
    .from("profiles")
    .select("id,email,outlook_connected,locale")
    .eq("team_id", meeting.team_id);

  if (profilesError || !profiles) {
    return NextResponse.json(
      {error: "Could not load team members"},
      {status: 500},
    );
  }

  let sent = 0;

  for (const profile of profiles) {
    if (!profile.outlook_connected || !profile.email) continue;

    // Check if this user already answered the poll for this meeting
    const {count, error: countError} = await supabase
      .from("poll_responses")
      .select("id", {count: "exact", head: true})
      .eq("meeting_id", meeting.id)
      .eq("user_id", profile.id);

    if (countError || (count ?? 0) > 0) continue;

    const locale =
      (profile.locale as "en" | "de" | null) ?? ("en" as const);

    try {
      await sendPollEmail(
        profile.email,
        meeting.title,
        meeting.id,
        locale,
      );
      sent += 1;
    } catch (e) {
      console.error("Failed to send poll email", e);
    }
  }

  const {error: updateError} = await supabase
    .from("meetings")
    .update({
      poll_sent: true,
      poll_sent_at: new Date().toISOString(),
    })
    .eq("id", meeting.id);

  if (updateError) {
    console.error("Failed to update meeting poll_sent flags", updateError);
  }

  return NextResponse.json({sent});
}

