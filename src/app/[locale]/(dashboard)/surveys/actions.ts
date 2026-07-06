"use server";

import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {SURVEY_WINDOW_DAYS} from "@/config/surveys";
import {occurrenceHasAttendee, USE_CANONICAL_MEETINGS} from "@/lib/poll-occurrences";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type SurveyMeeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  participantCount: number;
  teamCost: number | null;
  responded: boolean;
  /** Populated only when responded === true */
  response?: {
    wasUseful: "yes" | "partially" | "no";
    actualDurationMinutes: number;
    submittedAt: string;
  };
};

export type SurveysData = {
  pending: SurveyMeeting[];
  completed: SurveyMeeting[];
  windowDays: number;
};

// ─────────────────────────────────────────────────────────────────
// Fetch surveys for the signed-in user
// ─────────────────────────────────────────────────────────────────

export async function getSurveysForUser(): Promise<SurveysData> {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) return {pending: [], completed: [], windowDays: SURVEY_WINDOW_DAYS};

  const {data: profile} = await admin
    .from("profiles")
    .select("team_id, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) {
    return {pending: [], completed: [], windowDays: SURVEY_WINDOW_DAYS};
  }

  const now = new Date();
  const windowStart = new Date(
    now.getTime() - SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const userEmail = (profile.email ?? user.email ?? "").toLowerCase().trim();
  if (!userEmail) {
    return {pending: [], completed: [], windowDays: SURVEY_WINDOW_DAYS};
  }

  type InvolvedRow = {
    id: string;
    title: string;
    start_time: string;
    end_time: string | null;
    duration_minutes: number;
    participant_count: number;
    team_cost: number | null;
    attendees?: unknown;
  };

  let involved: InvolvedRow[] = [];

  if (USE_CANONICAL_MEETINGS) {
    const {data: occurrences} = await admin
      .from("meeting_occurrences")
      .select(
        "id, title, start_time, end_time, duration_minutes, participant_count, team_cost, attendees",
      )
      .eq("team_id", profile.team_id)
      .neq("is_cancelled", true)
      .neq("is_all_day", true)
      .neq("is_excluded", true)
      .not("end_time", "is", null)
      .lte("end_time", now.toISOString())
      .gte("end_time", windowStart.toISOString())
      .order("end_time", {ascending: false});

    involved = (occurrences ?? []).filter((o) => occurrenceHasAttendee(o, userEmail));
  } else {
    const {data: meetings} = await admin
      .from("meetings")
      .select(
        "id, title, start_time, end_time, duration_minutes, participant_count, team_cost, attendees, user_id",
      )
      .eq("team_id", profile.team_id)
      .neq("is_cancelled", true)
      .neq("is_all_day", true)
      .neq("is_excluded", true)
      .lte("end_time", now.toISOString())
      .gte("end_time", windowStart.toISOString())
      .order("end_time", {ascending: false});

    involved = (meetings ?? []).filter((m) => occurrenceHasAttendee(m, userEmail));
  }

  if (involved.length === 0) {
    return {pending: [], completed: [], windowDays: SURVEY_WINDOW_DAYS};
  }

  const ids = involved.map((m) => m.id);

  const {data: responses} = await admin
    .from("poll_responses")
    .select(
      "meeting_id, occurrence_id, was_useful, actual_duration_minutes, submitted_at",
    )
    .eq("user_id", user.id)
    .or(
      [
        ids.length > 0 ? `occurrence_id.in.(${ids.join(",")})` : "",
        ids.length > 0 ? `meeting_id.in.(${ids.join(",")})` : "",
      ]
        .filter(Boolean)
        .join(","),
    );

  const responseMap = new Map(
    (responses ?? []).map((r) => [r.occurrence_id ?? r.meeting_id, r]),
  );

  const pending: SurveyMeeting[] = [];
  const completed: SurveyMeeting[] = [];

  for (const m of involved) {
    const response = responseMap.get(m.id);
    const survey: SurveyMeeting = {
      id: m.id,
      title: m.title,
      startTime: m.start_time,
      endTime: m.end_time ?? m.start_time,
      durationMinutes: m.duration_minutes,
      participantCount: m.participant_count,
      teamCost: m.team_cost ?? null,
      responded: !!response,
      ...(response
        ? {
            response: {
              wasUseful: response.was_useful as "yes" | "partially" | "no",
              actualDurationMinutes: response.actual_duration_minutes,
              submittedAt: response.submitted_at,
            },
          }
        : {}),
    };

    if (response) completed.push(survey);
    else pending.push(survey);
  }

  return {pending, completed, windowDays: SURVEY_WINDOW_DAYS};
}

// ─────────────────────────────────────────────────────────────────
// Get count of pending surveys (used by sidebar badge)
// ─────────────────────────────────────────────────────────────────

export async function getPendingSurveyCount(): Promise<number> {
  const data = await getSurveysForUser();
  return data.pending.length;
}
