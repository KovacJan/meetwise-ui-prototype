import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {mergeOccurrencesForTeam} from "@/lib/meeting-occurrences";
import {recalculateMeetingCosts} from "@/lib/cost-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backfill-occurrences
 * Auth: Authorization: Bearer <SYNC_ALL_SECRET> (fallback: CRON_SECRET)
 *
 * Query params:
 * - limit: number of teams per run (default 25, max 100)
 * - cursor: last processed team_id (exclusive)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_ALL_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {error: "SYNC_ALL_SECRET (or CRON_SECRET) is not configured"},
      {status: 500},
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const admin = createSupabaseAdminClient();
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, Math.floor(limitRaw)))
    : 25;
  const cursor = url.searchParams.get("cursor");

  let teamsQuery = admin
    .from("meetings")
    .select("team_id")
    .not("team_id", "is", null)
    .order("team_id", {ascending: true})
    .limit(limit);
  if (cursor) teamsQuery = teamsQuery.gt("team_id", cursor);

  const {data: teamRows, error: teamsError} = await teamsQuery;
  if (teamsError) {
    return NextResponse.json({error: teamsError.message}, {status: 500});
  }

  const teamIds = [...new Set((teamRows ?? []).map((r) => r.team_id).filter(Boolean))] as string[];
  if (teamIds.length === 0) {
    return NextResponse.json({
      processedTeams: 0,
      mergedGroups: 0,
      linkedRows: 0,
      fallbackGroups: 0,
      recalculatedOccurrences: 0,
      errors: 0,
      hasMore: false,
      nextCursor: null,
    });
  }

  let mergedGroups = 0;
  let linkedRows = 0;
  let fallbackGroups = 0;
  let recalculatedOccurrences = 0;
  let errors = 0;

  for (const teamId of teamIds) {
    try {
      const mergeResult = await mergeOccurrencesForTeam(teamId, admin);
      mergedGroups += mergeResult.groups;
      linkedRows += mergeResult.linkedRows;
      fallbackGroups += mergeResult.fallbackGroups;

      const recalcResult = await recalculateMeetingCosts(teamId, admin);
      recalculatedOccurrences += recalcResult.updated;
      errors += recalcResult.errors;
    } catch (err) {
      errors++;
      console.error("backfill-occurrences: team failed", teamId, err);
    }
  }

  const nextCursor = teamIds[teamIds.length - 1] ?? null;
  const hasMore = (teamRows?.length ?? 0) === limit;

  return NextResponse.json({
    processedTeams: teamIds.length,
    mergedGroups,
    linkedRows,
    fallbackGroups,
    recalculatedOccurrences,
    errors,
    hasMore,
    nextCursor,
  });
}
