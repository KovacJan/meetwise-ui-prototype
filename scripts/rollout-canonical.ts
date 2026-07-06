/**
 * One-off canonical rollout: sync calendars → merge occurrences → recalc costs → validate.
 * Usage: npx tsx scripts/rollout-canonical.ts
 */
import {readFileSync} from "fs";
import {resolve} from "path";
import {createClient} from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn("No .env.local found — using existing process.env");
  }
}

async function main() {
  loadEnvLocal();
  const {syncCalendarForProfile} = await import("../src/lib/calendar-sync");
  const {mergeOccurrencesForTeam} = await import("../src/lib/meeting-occurrences");
  const {recalculateMeetingCosts} = await import("../src/lib/cost-engine");
  const skipSync = process.argv.includes("--backfill-only");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  if (skipSync) {
    console.log("\n=== Step 1: Sync skipped (--backfill-only) ===\n");
  } else {
  console.log("\n=== Step 1: Sync calendars for connected profiles ===\n");
  const {data: profiles, error: profilesError} = await admin
    .from("profiles")
    .select("id, team_id, microsoft_refresh_token")
    .eq("outlook_connected", true)
    .not("microsoft_refresh_token", "is", null)
    .not("team_id", "is", null);

  if (profilesError) throw profilesError;

  let syncedProfiles = 0;
  for (const p of profiles ?? []) {
    try {
      const result = await syncCalendarForProfile(admin, {
        id: p.id,
        team_id: p.team_id,
        microsoft_refresh_token: p.microsoft_refresh_token,
      });
      console.log(`  profile ${p.id}: synced=${result.synced}/${result.total}, costs=${result.costsRecalculated}`);
      syncedProfiles++;
    } catch (err) {
      console.error(`  profile ${p.id}: FAILED`, err);
    }
  }
  console.log(`Synced ${syncedProfiles}/${profiles?.length ?? 0} profiles\n`);
  }

  console.log("=== Step 2: Merge + recalc per team ===\n");
  const {data: teamRows, error: teamError} = await admin
    .from("meetings")
    .select("team_id")
    .not("team_id", "is", null);

  if (teamError) throw teamError;

  const teamIds = [...new Set((teamRows ?? []).map((r) => r.team_id).filter(Boolean))] as string[];
  let totalGroups = 0;
  let totalLinked = 0;
  let totalRecalc = 0;

  for (const teamId of teamIds) {
    const merge = await mergeOccurrencesForTeam(teamId, admin);
    const recalc = await recalculateMeetingCosts(teamId, admin);
    totalGroups += merge.groups;
    totalLinked += merge.linkedRows;
    totalRecalc += recalc.updated;
    console.log(
      `  team ${teamId}: groups=${merge.groups}, linked=${merge.linkedRows}, fallback=${merge.fallbackGroups}, recalc=${recalc.updated}, errors=${recalc.errors}`,
    );
  }

  console.log("\n=== Step 3: Validation ===\n");
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
  const {count: missingIcal} = await admin
    .from("meeting_occurrences")
    .select("id", {count: "exact", head: true})
    .is("ical_uid", null);

  const summary = {
    meetingsCount: meetingsCount ?? 0,
    occurrencesCount: occurrencesCount ?? 0,
    unlinkedMeetingsCount: unlinkedCount ?? 0,
    occurrencesMissingIcalUid: missingIcal ?? 0,
    teamsProcessed: teamIds.length,
    totalMergeGroups: totalGroups,
    totalLinkedRows: totalLinked,
    totalRecalculated: totalRecalc,
  };

  console.log(JSON.stringify(summary, null, 2));

  const {data: standupDupes} = await admin
    .from("meeting_occurrences")
    .select("start_time, title")
    .ilike("title", "%standup%");

  const byStart = new Map<string, number>();
  for (const row of standupDupes ?? []) {
    const k = row.start_time as string;
    byStart.set(k, (byStart.get(k) ?? 0) + 1);
  }
  const dupeTimes = [...byStart.entries()].filter(([, c]) => c > 1);
  if (dupeTimes.length > 0) {
    console.log("\nWarning: duplicate standup occurrences at same start_time:");
    console.log(dupeTimes);
  } else {
    console.log("\nStandup sanity: no duplicate canonical rows at same start_time.");
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
