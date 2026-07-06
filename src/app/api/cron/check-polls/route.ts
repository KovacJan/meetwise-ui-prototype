import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {sendPollDigestEmail} from "@/lib/resend";
import {SURVEY_WINDOW_DAYS, POLL_MIN_AGE_MINUTES} from "@/config/surveys";
import {syncCalendarForProfile} from "@/lib/calendar-sync";
import {
  occurrenceHasAttendee,
  getRepresentativeMeetingId,
  USE_CANONICAL_MEETINGS,
  hasOccurrencePollColumns,
  hasPollDigestOccurrenceColumn,
} from "@/lib/poll-occurrences";

export const dynamic = "force-dynamic";

type OccurrenceRow = {
  id: string;
  title: string;
  team_id: string;
  end_time: string | null;
  start_time: string;
  duration_minutes: number;
  attendees?: unknown;
};

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({error: "Unauthorized"}, {status: 401});
    }
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();

  const latestEndTime = new Date(
    now.getTime() - POLL_MIN_AGE_MINUTES * 60 * 1000,
  );
  const earliestEndTime = new Date(
    now.getTime() - SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  let occurrences: OccurrenceRow[] = [];

  if (USE_CANONICAL_MEETINGS) {
    let q = supabase
      .from("meeting_occurrences")
      .select("id, title, team_id, end_time, start_time, duration_minutes, attendees")
      .not("end_time", "is", null)
      .lte("end_time", latestEndTime.toISOString())
      .gte("end_time", earliestEndTime.toISOString())
      .neq("is_cancelled", true)
      .neq("is_excluded", true);

    if (await hasOccurrencePollColumns(supabase)) {
      q = q.or("poll_sent.eq.false,poll_sent.is.null");
    }

    const {data, error} = await q;

    if (error) {
      console.error("check-polls: occurrences query failed", error);
      return NextResponse.json({error: error.message}, {status: 500});
    }
    occurrences = (data ?? []) as OccurrenceRow[];
  } else {
    const {data: meetings, error} = await supabase
      .from("meetings")
      .select("id, title, team_id, end_time, start_time, duration_minutes, attendees")
      .lte("end_time", latestEndTime.toISOString())
      .gte("end_time", earliestEndTime.toISOString())
      .neq("is_cancelled", true)
      .or("poll_sent.eq.false,poll_sent.is.null");

    if (error) {
      return NextResponse.json({error: error.message}, {status: 500});
    }
    occurrences = (meetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      team_id: m.team_id,
      end_time: m.end_time,
      start_time: m.start_time,
      duration_minutes: m.duration_minutes ?? 0,
      attendees: m.attendees,
    }));
  }

  if (occurrences.length === 0) {
    return NextResponse.json({triggered: 0, emailsSent: 0});
  }

  const byTeam = new Map<string, OccurrenceRow[]>();
  for (const o of occurrences) {
    if (!o.team_id) continue;
    if (!byTeam.has(o.team_id)) byTeam.set(o.team_id, []);
    byTeam.get(o.team_id)!.push(o);
  }

  let emailsSent = 0;

  for (const [teamId, teamOccurrences] of byTeam) {
    const occurrenceIds = teamOccurrences.map((o) => o.id);

    const {data: teamRow} = await supabase
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .maybeSingle();
    const teamName =
      teamRow?.name && typeof teamRow.name === "string" ? teamRow.name : null;

    const {data: profiles, error: profilesErr} = await supabase
      .from("profiles")
      .select("id, email, locale")
      .eq("team_id", teamId)
      .not("email", "is", null);

    if (profilesErr || !profiles?.length) continue;

    const {data: responses} = await supabase
      .from("poll_responses")
      .select("occurrence_id, meeting_id, user_id")
      .or(
        [
          occurrenceIds.length > 0
            ? `occurrence_id.in.(${occurrenceIds.join(",")})`
            : "",
          occurrenceIds.length > 0
            ? `meeting_id.in.(${occurrenceIds.join(",")})`
            : "",
        ]
          .filter(Boolean)
          .join(","),
      )
      .not("user_id", "is", null);

    const respondedSet = new Set(
      (responses ?? []).map((r) => {
        const keyId = r.occurrence_id ?? r.meeting_id;
        return `${keyId}:${r.user_id}`;
      }),
    );

    const profileIds = profiles.map((p) => p.id);
    const {data: digestSentRows} = await supabase
      .from("poll_digest_sent")
      .select("occurrence_id, meeting_id, user_id")
      .in("user_id", profileIds)
      .or(
        [
          occurrenceIds.length > 0
            ? `occurrence_id.in.(${occurrenceIds.join(",")})`
            : "",
          occurrenceIds.length > 0
            ? `meeting_id.in.(${occurrenceIds.join(",")})`
            : "",
        ]
          .filter(Boolean)
          .join(","),
      );

    const digestSentSet = new Set(
      (digestSentRows ?? []).map((r) => {
        const keyId = r.occurrence_id ?? r.meeting_id;
        return `${keyId}:${r.user_id}`;
      }),
    );

    for (const profile of profiles) {
      if (!profile.email) continue;
      const userEmail = profile.email.toLowerCase().trim();

      const unanswered = teamOccurrences.filter(
        (o) =>
          occurrenceHasAttendee(o, userEmail) &&
          !respondedSet.has(`${o.id}:${profile.id}`) &&
          !digestSentSet.has(`${o.id}:${profile.id}`),
      );

      if (unanswered.length === 0) continue;

      try {
        await sendPollDigestEmail({
          to: profile.email,
          meetings: unanswered.map((o) => ({
            id: o.id,
            title: o.title,
            endTime: o.end_time ?? o.start_time,
            durationMinutes: o.duration_minutes ?? 0,
          })),
          locale: (profile.locale ?? "en") as "en" | "de",
          teamName,
          userId: profile.id,
        });

        const digestRows = [];
        const trackOccurrence = await hasPollDigestOccurrenceColumn(supabase);
        for (const o of unanswered) {
          const meetingId = USE_CANONICAL_MEETINGS
            ? await getRepresentativeMeetingId(supabase, o.id)
            : o.id;
          if (!meetingId) continue;
          digestRows.push({
            user_id: profile.id,
            meeting_id: meetingId,
            ...(trackOccurrence && USE_CANONICAL_MEETINGS ? {occurrence_id: o.id} : {}),
          });
        }
        if (digestRows.length > 0) {
          await supabase.from("poll_digest_sent").insert(digestRows);
        }
        emailsSent++;
      } catch (err) {
        console.error(`check-polls: failed to send digest to ${profile.email}`, err);
      }
    }
  }

  const allIds = occurrences.map((o) => o.id);
  if (USE_CANONICAL_MEETINGS) {
    if (await hasOccurrencePollColumns(supabase)) {
      const {error: updateErr} = await supabase
        .from("meeting_occurrences")
        .update({poll_sent: true, poll_sent_at: now.toISOString()})
        .in("id", allIds);
      if (updateErr) console.error("check-polls: failed to mark occurrence poll_sent", updateErr);
    }
  } else {
    await supabase
      .from("meetings")
      .update({poll_sent: true, poll_sent_at: now.toISOString()})
      .in("id", allIds);
  }

  try {
    const currentUtcHour = new Date().getUTCHours();
    if (currentUtcHour % 2 === 0) {
      const {data: profiles} = await supabase
        .from("profiles")
        .select("id, team_id, microsoft_refresh_token")
        .eq("outlook_connected", true)
        .not("microsoft_refresh_token", "is", null)
        .not("team_id", "is", null);

      for (const profile of profiles ?? []) {
        try {
          await syncCalendarForProfile(supabase, {
            id: profile.id,
            team_id: profile.team_id,
            microsoft_refresh_token: profile.microsoft_refresh_token,
          });
        } catch (err) {
          console.error("check-polls: calendar sync failed", profile.id, err);
        }
      }
    }
  } catch (err) {
    console.error("check-polls: calendar sync wrapper failed", err);
  }

  return NextResponse.json({
    triggered: occurrences.length,
    emailsSent,
  });
}
