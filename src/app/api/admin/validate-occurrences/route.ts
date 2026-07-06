import {NextRequest, NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/validate-occurrences
 * Auth: Authorization: Bearer <SYNC_ALL_SECRET> (fallback: CRON_SECRET)
 */
export async function GET(req: NextRequest) {
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

  const {count: meetingsCount} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true});
  const {count: occurrencesCount} = await admin
    .from("meeting_occurrences")
    .select("id", {count: "exact", head: true});
  const {count: unlinkedCount} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true})
    .is("occurrence_id", null);
  const {count: missingIcalCount} = await admin
    .from("meeting_occurrences")
    .select("id", {count: "exact", head: true})
    .is("ical_uid", null);

  return NextResponse.json({
    meetingsCount: meetingsCount ?? 0,
    occurrencesCount: occurrencesCount ?? 0,
    unlinkedMeetingsCount: unlinkedCount ?? 0,
    occurrencesMissingIcalUid: missingIcalCount ?? 0,
  });
}
