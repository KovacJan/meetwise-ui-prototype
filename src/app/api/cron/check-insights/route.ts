import {NextRequest, NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {generateMeetingInsight} from "@/lib/openai";

const USE_CANONICAL_MEETINGS = process.env.USE_CANONICAL_MEETINGS !== "0";

export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const meetingTable = USE_CANONICAL_MEETINGS ? "meeting_occurrences" : "meetings";
  const pollField = USE_CANONICAL_MEETINGS ? "occurrence_id" : "meeting_id";

  // Load meetings that don't have an AI insight yet
  const {data: meetings, error} = await supabase
    .from(meetingTable)
    .select("id,title,duration_minutes,participant_count,team_cost,ai_insight")
    .is("ai_insight", null);

  if (error || !meetings || meetings.length === 0) {
    return NextResponse.json({processed: 0});
  }

  let processed = 0;

  for (const meeting of meetings) {
    // Load poll responses for this meeting (may be empty – we still generate using defaults)
    const {data: responses, error: responsesError} = await supabase
      .from("poll_responses")
      .select("was_useful,actual_duration_minutes,focus_level")
      .eq(pollField, meeting.id);

    if (responsesError) continue;

    try {
      const {insight, efficiencyScore} = await generateMeetingInsight(
        {
          title: meeting.title,
          duration_minutes: meeting.duration_minutes,
          participant_count: meeting.participant_count,
          cost: meeting.team_cost ?? 0,
        },
        responses ?? [],
      );

      const {error: updateError} = await supabase
        .from(meetingTable)
        .update({
          ai_insight: insight,
          efficiency_score: efficiencyScore,
        })
        .eq("id", meeting.id);

      if (!updateError) {
        processed += 1;
      } else {
        console.error("Failed to update meeting insight", meeting.id, updateError);
      }
    } catch (e) {
      console.error("Failed to generate meeting insight", meeting.id, e);
    }
  }

  return NextResponse.json({processed});
}

