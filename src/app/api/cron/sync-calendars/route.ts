import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {syncCalendarForProfile} from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-calendars
 *
 * Manually triggers a full calendar sync for all connected profiles.
 * Requires Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({error: "Unauthorized"}, {status: 401});
    }
  }

  const admin = createSupabaseAdminClient();

  const {data: profiles, error: profilesError} = await admin
    .from("profiles")
    .select("id, team_id, microsoft_refresh_token")
    .eq("outlook_connected", true)
    .not("microsoft_refresh_token", "is", null)
    .not("team_id", "is", null);

  if (profilesError) {
    console.error("sync-calendars: profiles query failed", profilesError);
    return NextResponse.json({error: profilesError.message}, {status: 500});
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({
      profiles: 0,
      syncedMeetings: 0,
      totalMeetingsFetched: 0,
      deletedMeetings: 0,
      costsRecalculated: 0,
      failedProfiles: 0,
    });
  }

  let syncedMeetings = 0;
  let totalMeetingsFetched = 0;
  let deletedMeetings = 0;
  let costsRecalculated = 0;
  let failedProfiles = 0;

  for (const profile of profiles) {
    try {
      const result = await syncCalendarForProfile(admin, {
        id: profile.id,
        team_id: profile.team_id,
        microsoft_refresh_token: profile.microsoft_refresh_token,
      });
      syncedMeetings += result.synced;
      totalMeetingsFetched += result.total;
      deletedMeetings += result.deleted;
      costsRecalculated += result.costsRecalculated;
    } catch (err) {
      failedProfiles++;
      console.error("sync-calendars: failed profile", profile.id, err);
    }
  }

  return NextResponse.json({
    profiles: profiles.length,
    syncedMeetings,
    totalMeetingsFetched,
    deletedMeetings,
    costsRecalculated,
    failedProfiles,
  });
}
