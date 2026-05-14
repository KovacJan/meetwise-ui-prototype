import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {syncCalendarForProfile} from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sync-calendars
 *
 * One-off manual sync for connected profiles (no cron needed).
 * Auth: Authorization: Bearer <SYNC_ALL_SECRET> (fallback: CRON_SECRET)
 *
 * Query params:
 * - limit: number of profiles per run (default 10, max 50)
 * - cursor: last processed profile.id (exclusive)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_ALL_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {error: "SYNC_ALL_SECRET (or CRON_SECRET) is not configured"},
      {status: 500},
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const admin = createSupabaseAdminClient();
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(50, Math.floor(limitRaw)))
    : 10;
  const cursor = url.searchParams.get("cursor");

  let profilesQuery = admin
    .from("profiles")
    .select("id, team_id, microsoft_refresh_token")
    .eq("outlook_connected", true)
    .not("microsoft_refresh_token", "is", null)
    .not("team_id", "is", null)
    .order("id", {ascending: true})
    .limit(limit);

  if (cursor) {
    profilesQuery = profilesQuery.gt("id", cursor);
  }

  const {data: profiles, error: profilesError} = await profilesQuery;

  if (profilesError) {
    console.error("admin sync-calendars: profiles query failed", profilesError);
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
      processedProfiles: 0,
      hasMore: false,
      nextCursor: null,
    });
  }

  let syncedMeetings = 0;
  let totalMeetingsFetched = 0;
  let deletedMeetings = 0;
  let costsRecalculated = 0;
  let failedProfiles = 0;
  let processedProfiles = 0;

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
      processedProfiles++;
    } catch (err) {
      failedProfiles++;
      console.error("admin sync-calendars: failed profile", profile.id, err);
    }
  }

  const nextCursor = profiles[profiles.length - 1]?.id ?? null;
  const hasMore = profiles.length === limit;

  return NextResponse.json({
    profiles: profiles.length,
    processedProfiles,
    limit,
    cursor: cursor ?? null,
    nextCursor,
    hasMore,
    syncedMeetings,
    totalMeetingsFetched,
    deletedMeetings,
    costsRecalculated,
    failedProfiles,
  });
}
