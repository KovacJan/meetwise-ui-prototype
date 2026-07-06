/**
 * Re-merge, recalc costs, remove orphan/stale occurrences.
 * Usage: npx tsx scripts/cleanup-canonical.ts
 */
import {readFileSync} from "fs";
import {resolve} from "path";
import {createClient} from "@supabase/supabase-js";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const {mergeOccurrencesForTeam} = await import("../src/lib/meeting-occurrences");
  const {recalculateMeetingCosts} = await import("../src/lib/cost-engine");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {persistSession: false}},
  );

  const teamIdSet = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const {data} = await admin.from("meetings").select("team_id").not("team_id", "is", null).range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) {
      if (r.team_id) teamIdSet.add(r.team_id as string);
    }
    if (data.length < 1000) break;
  }
  const teamIds = [...teamIdSet];

  console.log("\n=== Re-merge + recalc ===\n");
  for (const teamId of teamIds) {
    const merge = await mergeOccurrencesForTeam(teamId, admin);
    const recalc = await recalculateMeetingCosts(teamId, admin);
    console.log(`  team ${teamId}: groups=${merge.groups}, linked=${merge.linkedRows}, recalc=${recalc.updated}`);
  }

  const {count: unlinkedBeforeRepair} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true})
    .is("occurrence_id", null);

  if ((unlinkedBeforeRepair ?? 0) > 0) {
    console.log(`\n=== Repair ${unlinkedBeforeRepair} unlinked meetings ===\n`);
    const {repairUnlinkedMeetings} = await import("../src/lib/repair-unlinked-meetings");
    const repaired = await repairUnlinkedMeetings(admin);
    console.log(`  Repaired: ${repaired.linked}, errors: ${repaired.errors}`);
    for (const teamId of teamIds) {
      await recalculateMeetingCosts(teamId, admin);
    }
  }

  console.log("\n=== Delete orphan occurrences (no linked meetings) ===\n");
  const linkedSet = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const {data} = await admin
      .from("meetings")
      .select("occurrence_id")
      .not("occurrence_id", "is", null)
      .range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) {
      if (r.occurrence_id) linkedSet.add(r.occurrence_id as string);
    }
    if (data.length < 1000) break;
  }

  const allOcc: Array<{id: string; canonical_key: string}> = [];
  for (let from = 0; ; from += 1000) {
    const {data} = await admin
      .from("meeting_occurrences")
      .select("id, canonical_key")
      .range(from, from + 999);
    if (!data?.length) break;
    allOcc.push(...(data as Array<{id: string; canonical_key: string}>));
    if (data.length < 1000) break;
  }

  const orphanIds = allOcc.map((o) => o.id).filter((id) => !linkedSet.has(id));

  if (orphanIds.length > 0) {
    for (let i = 0; i < orphanIds.length; i += 100) {
      const batch = orphanIds.slice(i, i + 100);
      const {error} = await admin.from("meeting_occurrences").delete().in("id", batch);
      if (error) throw error;
    }
  }
  console.log(`  Deleted ${orphanIds.length} orphan occurrences`);

  const staleIds = (allOcc ?? [])
    .filter((o) => (o.canonical_key as string)?.startsWith("series:"))
    .map((o) => o.id as string)
    .filter((id) => !linkedSet.has(id));

  if (staleIds.length > 0) {
    for (let i = 0; i < staleIds.length; i += 100) {
      const batch = staleIds.slice(i, i + 100);
      await admin.from("meeting_occurrences").delete().in("id", batch);
    }
  }
  console.log(`  Deleted ${staleIds.length} stale series: occurrences`);

  const {count: unlinkedAfter} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true})
    .is("occurrence_id", null);
  if ((unlinkedAfter ?? 0) > 0) {
    console.log(`\n=== Post-cleanup repair (${unlinkedAfter} unlinked) ===\n`);
    const {repairUnlinkedMeetings} = await import("../src/lib/repair-unlinked-meetings");
    const repaired = await repairUnlinkedMeetings(admin);
    console.log(`  Repaired: ${repaired.linked}, errors: ${repaired.errors}`);
    for (const teamId of teamIds) {
      await recalculateMeetingCosts(teamId, admin);
    }
  }

  const {count: unlinkedFinal} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true})
    .is("occurrence_id", null);
  const {count: occCount} = await admin
    .from("meeting_occurrences")
    .select("id", {count: "exact", head: true});

  console.log(`\nDone. meetings unlinked=${unlinkedFinal}, occurrences=${occCount}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
