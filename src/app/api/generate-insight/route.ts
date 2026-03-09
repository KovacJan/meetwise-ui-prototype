import {NextRequest, NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {generateMeetingInsight} from "@/lib/openai";

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

  const {data: meeting, error: meetingError} = await supabase
    .from("meetings")
    .select("id,title,duration_minutes,participant_count,cost")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json(
      {error: "Meeting not found"},
      {status: 404},
    );
  }

  const {data: pollResponses, error: responsesError} = await supabase
    .from("poll_responses")
    .select("was_useful,actual_duration_minutes")
    .eq("meeting_id", meetingId);

  if (responsesError) {
    return NextResponse.json(
      {error: "Failed to load poll responses"},
      {status: 500},
    );
  }

  try {
    const {insight, efficiencyScore} = await generateMeetingInsight(
      meeting,
      pollResponses ?? [],
    );

    const {error: updateError} = await supabase
      .from("meetings")
      .update({
        ai_insight: insight,
        efficiency_score: efficiencyScore,
      })
      .eq("id", meetingId);

    if (updateError) {
      return NextResponse.json(
        {error: "Failed to persist meeting insight"},
        {status: 500},
      );
    }

    return NextResponse.json({insight, efficiencyScore});
  } catch (e) {
    console.error("Failed to generate meeting insight", e);
    return NextResponse.json(
      {error: "AI insight generation failed"},
      {status: 500},
    );
  }
}

