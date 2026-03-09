/**
 * GET /api/cron/check-polls
 *
 * Runs on the schedule defined in vercel.json (e.g. every 15 minutes for testing).
 * Locally, Vercel Cron does not run; trigger manually (e.g. GET with CRON_SECRET)
 * or use "Send email now" on the Polls page (calls check-polls-for-user).
 *
 * Algorithm:
 *  1. Find all meetings that ended between POLL_MIN_AGE_MINUTES ago and
 *     SURVEY_WINDOW_DAYS ago, where poll_sent is still false.
 *  2. For each team, load team name and members with email; only include
 *     meetings where the member was an attendee (by email).
 *  3. Exclude meetings the member has already answered (poll_responses) and
 *     meetings we already sent a digest for (poll_digest_sent).
 *  4. If a member has ≥1 unanswered meeting they attended, send ONE digest email
 *     and record each (user, meeting) in poll_digest_sent so we never send twice.
 *  5. Mark every processed meeting as poll_sent = true.
 *
 * Batch interval: POLL_BATCH_INTERVAL_MINUTES in src/config/surveys.ts.
 * Keep vercel.json schedule in sync (e.g. every 15 min).
 */

import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {sendPollDigestEmail} from "@/lib/resend";
import {SURVEY_WINDOW_DAYS, POLL_MIN_AGE_MINUTES} from "@/config/surveys";
import {syncCalendarForProfile} from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Basic auth check – Vercel passes CRON_SECRET automatically on Pro plans.
  // On hobby / local dev the header may be absent, which is fine.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({error: "Unauthorized"}, {status: 401});
    }
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();

  // Meetings must have ended at least POLL_MIN_AGE_MINUTES ago
  const latestEndTime = new Date(
    now.getTime() - POLL_MIN_AGE_MINUTES * 60 * 1000,
  );

  // Don't send for meetings older than the survey window
  const earliestEndTime = new Date(
    now.getTime() - SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // ── Step 1: fetch all meetings not yet poll_sent ────────────────────────────
  const {data: meetings, error: meetingsErr} = await supabase
    .from("meetings")
    .select("id, title, team_id, end_time, duration_minutes, attendees")
    .lte("end_time", latestEndTime.toISOString())
    .gte("end_time", earliestEndTime.toISOString())
    .neq("is_cancelled", true)
    .or("poll_sent.eq.false,poll_sent.is.null");

  if (meetingsErr) {
    console.error("check-polls: meetings query failed", meetingsErr);
    return NextResponse.json({error: meetingsErr.message}, {status: 500});
  }

  if (!meetings || meetings.length === 0) {
    return NextResponse.json({triggered: 0, emailsSent: 0});
  }

  console.log("check-polls: eligible meetings", {
    count: meetings.length,
    latestEnd: latestEndTime.toISOString(),
    earliestEnd: earliestEndTime.toISOString(),
  });

  /** True if the given email is in the meeting's attendees list (case-insensitive). */
  function meetingHasAttendee(m: {attendees?: unknown}, email: string): boolean {
    const attendees = Array.isArray(m.attendees) ? (m.attendees as {emailAddress?: {address?: string}}[]) : [];
    const normalized = email.toLowerCase().trim();
    return attendees.some(
      (a) =>
        a?.emailAddress?.address &&
        String(a.emailAddress.address).toLowerCase().trim() === normalized,
    );
  }

  // ── Step 2: group meetings by team ─────────────────────────────────────────
  const byTeam = new Map<
    string,
    {
      id: string;
      title: string;
      team_id: string;
      end_time: string;
      duration_minutes: number;
      attendees?: unknown;
    }[]
  >();

  for (const m of meetings) {
    if (!m.team_id) continue;
    if (!byTeam.has(m.team_id)) byTeam.set(m.team_id, []);
    byTeam.get(m.team_id)!.push(m);
  }

  let emailsSent = 0;

  // ── Step 3: for each team, send per-user digest ─────────────────────────────
  for (const [teamId, teamMeetings] of byTeam) {
    const teamMeetingIds = teamMeetings.map((m) => m.id);

    // Load team name (separate query to avoid PGRST201 ambiguous relationship)
    const {data: teamRow} = await supabase
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .maybeSingle();
    const teamName =
      teamRow?.name && typeof teamRow.name === "string" ? teamRow.name : null;

    // Load all team members that have an email address (no teams() embed)
    const {data: profiles, error: profilesErr} = await supabase
      .from("profiles")
      .select("id, email, locale")
      .eq("team_id", teamId)
      .not("email", "is", null);

    if (profilesErr || !profiles || profiles.length === 0) continue;

    // Load all existing responses for these meetings in a single query
    const {data: responses} = await supabase
      .from("poll_responses")
      .select("meeting_id, user_id")
      .in("meeting_id", teamMeetingIds)
      .not("user_id", "is", null);

    // Build a quick-lookup set: "meetingId:userId" (already answered)
    const respondedSet = new Set(
      (responses ?? []).map((r) => `${r.meeting_id}:${r.user_id}`),
    );

    // Load (user_id, meeting_id) we already sent a digest for (no duplicate emails)
    const profileIds = profiles.map((p) => p.id);
    const {data: digestSentRows} = await supabase
      .from("poll_digest_sent")
      .select("meeting_id, user_id")
      .in("meeting_id", teamMeetingIds)
      .in("user_id", profileIds);
    const digestSentSet = new Set(
      (digestSentRows ?? []).map((r) => `${r.meeting_id}:${r.user_id}`),
    );

    const profileEmailNorm = (email: string) =>
      (email ?? "").toLowerCase().trim();

    // For each member, only include meetings they attended, haven't answered, and haven't been emailed
    for (const profile of profiles) {
      if (!profile.email) continue;
      const userEmail = profileEmailNorm(profile.email);

      const unanswered = teamMeetings.filter(
        (m) =>
          meetingHasAttendee(m, userEmail) &&
          !respondedSet.has(`${m.id}:${profile.id}`) &&
          !digestSentSet.has(`${m.id}:${profile.id}`),
      );

      if (unanswered.length === 0) continue;

      try {
        await sendPollDigestEmail({
          to: profile.email,
          meetings: unanswered.map((m) => ({
            id: m.id,
            title: m.title,
            endTime: m.end_time,
            durationMinutes: m.duration_minutes ?? 0,
          })),
          locale: (profile.locale ?? "en") as "en" | "de",
          teamName,
          userId: profile.id,
        });
        // Record so we never send this meeting to this user again
        await supabase.from("poll_digest_sent").insert(
          unanswered.map((m) => ({
            user_id: profile.id,
            meeting_id: m.id,
          })),
        );
        emailsSent++;
      } catch (err) {
        console.error(
          `check-polls: failed to send digest to ${profile.email}`,
          err,
        );
      }
    }
  }

  // ── Step 4: mark every processed meeting as poll_sent ─────────────────────
  const allIds = meetings.map((m) => m.id);
  const {error: updateErr} = await supabase
    .from("meetings")
    .update({poll_sent: true, poll_sent_at: now.toISOString()})
    .in("id", allIds);

  if (updateErr) {
    console.error("check-polls: failed to mark poll_sent", updateErr);
  }

  console.log("check-polls: done", {triggered: meetings.length, emailsSent});
  // ── Step 5: periodically sync Outlook calendars for all connected profiles ──
  try {
    const currentUtcHour = new Date().getUTCHours();

    // Run calendar sync every 2 hours (00:00, 02:00, 04:00, ...)
    if (currentUtcHour % 2 === 0) {
      const {data: profiles, error: profilesError} = await supabase
        .from("profiles")
        .select("id, team_id, microsoft_refresh_token, outlook_connected")
        .eq("outlook_connected", true)
        .not("microsoft_refresh_token", "is", null)
        .not("team_id", "is", null);

      if (profilesError) {
        console.error(
          "check-polls: calendar profiles query failed",
          profilesError,
        );
      } else if (profiles && profiles.length > 0) {
        console.log(
          "check-polls: starting calendar sync for connected profiles",
          {count: profiles.length},
        );
        for (const profile of profiles) {
          try {
            await syncCalendarForProfile(supabase, {
              id: profile.id,
              team_id: profile.team_id,
              microsoft_refresh_token: profile.microsoft_refresh_token,
            });
          } catch (err) {
            console.error(
              "check-polls: calendar sync failed for profile",
              profile.id,
              err,
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("check-polls: calendar sync wrapper failed", err);
  }

  return NextResponse.json({
    triggered: meetings.length,
    emailsSent,
  });
}
