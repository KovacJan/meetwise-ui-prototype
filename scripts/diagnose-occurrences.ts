/**
 * Diagnose unlinked meetings and duplicate standup occurrences.
 * Usage: npx tsx scripts/diagnose-occurrences.ts
 */
import {readFileSync} from "fs";
import {resolve} from "path";
import {createClient} from "@supabase/supabase-js";
import {canonicalMeetingKey} from "../src/lib/canonical-meeting";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
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
}

async function main() {
  loadEnvLocal();
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {persistSession: false, autoRefreshToken: false}},
  );

  console.log("\n=== 1. Unlinked meetings (106 expected) ===\n");

  const unlinked: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const {data, error} = await admin
      .from("meetings")
      .select(
        "id, title, team_id, user_id, ical_uid, start_time, duration_minutes, series_master_id, event_type, outlook_event_id, created_at",
      )
      .is("occurrence_id", null)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    unlinked.push(...data);
    if (data.length < 1000) break;
  }

  console.log(`Total unlinked: ${unlinked.length}`);

  const byReason = {
    missingStartTime: 0,
    missingTeamId: 0,
    fallbackKey: 0,
    hasIcalUid: 0,
    hasSeriesMaster: 0,
    duplicateKeyWouldMerge: 0,
  };

  const keyCounts = new Map<string, number>();
  for (const row of unlinked) {
    if (!row.start_time) byReason.missingStartTime++;
    if (!row.team_id) byReason.missingTeamId++;
    const key = canonicalMeetingKey(row as Parameters<typeof canonicalMeetingKey>[0]);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    if (key.startsWith("fallback:")) byReason.fallbackKey++;
    if (row.ical_uid) byReason.hasIcalUid++;
    if (row.series_master_id) byReason.hasSeriesMaster++;
  }

  const sharedKeys = [...keyCounts.entries()].filter(([, c]) => c > 1);
  byReason.duplicateKeyWouldMerge = sharedKeys.reduce((s, [, c]) => s + c, 0);

  console.log("Breakdown:");
  console.log(JSON.stringify(byReason, null, 2));
  console.log(`Unlinked rows sharing same canonical key (should have linked): ${sharedKeys.length} keys, ${byReason.duplicateKeyWouldMerge} rows`);

  if (sharedKeys.length > 0) {
    console.log("\nSample shared keys among unlinked:");
    for (const [key, count] of sharedKeys.slice(0, 5)) {
      const samples = unlinked.filter(
        (r) => canonicalMeetingKey(r as Parameters<typeof canonicalMeetingKey>[0]) === key,
      );
      console.log(`  key=${key} count=${count}`);
      for (const s of samples.slice(0, 3)) {
        console.log(`    - ${s.id} | ${s.title} | ical=${s.ical_uid ?? "null"} | outlook=${s.outlook_event_id ?? "null"}`);
      }
    }
  }

  console.log("\nSample unlinked (first 15):");
  for (const row of unlinked.slice(0, 15)) {
    const key = canonicalMeetingKey(row as Parameters<typeof canonicalMeetingKey>[0]);
    console.log(
      `  ${row.title} | start=${row.start_time} | ical=${row.ical_uid ?? "null"} | series=${row.series_master_id ?? "null"} | key=${key}`,
    );
  }

  // Check if linked meetings exist for same canonical keys
  console.log("\n=== 2. Unlinked vs linked — same canonical key? ===\n");
  let orphanKeys = 0;
  let hasLinkedSibling = 0;
  const orphanSamples: string[] = [];

  for (const row of unlinked.slice(0, 50)) {
    const key = canonicalMeetingKey(row as Parameters<typeof canonicalMeetingKey>[0]);
    const {count} = await admin
      .from("meeting_occurrences")
      .select("id", {count: "exact", head: true})
      .eq("canonical_key", key);
    if ((count ?? 0) > 0) {
      hasLinkedSibling++;
      if (orphanSamples.length < 5) {
        orphanSamples.push(`${row.title} | key=${key} | occurrence exists but meeting unlinked`);
      }
    } else {
      orphanKeys++;
    }
  }

  console.log(`Checked first 50 unlinked: ${hasLinkedSibling} have matching occurrence row, ${orphanKeys} have no occurrence`);
  if (orphanSamples.length) {
    console.log("Orphan samples (occurrence exists, meeting not linked):");
    orphanSamples.forEach((s) => console.log(`  ${s}`));
  }

  console.log("\n=== 3. Standup duplicates at 2026-02-13T08:00:00+00:00 ===\n");

  const {data: standupDupes} = await admin
    .from("meeting_occurrences")
    .select("id, title, canonical_key, ical_uid, start_time, source_count, participant_count, duration_minutes")
    .eq("start_time", "2026-02-13T08:00:00+00:00")
    .ilike("title", "%standup%");

  console.log(`Count: ${standupDupes?.length ?? 0}`);
  for (const occ of standupDupes ?? []) {
    const {data: sources} = await admin
      .from("meetings")
      .select("id, user_id, title, ical_uid, outlook_event_id, series_master_id")
      .eq("occurrence_id", occ.id);
    console.log(`\nOccurrence ${occ.id}:`);
    console.log(`  title="${occ.title}" key=${occ.canonical_key}`);
    console.log(`  ical_uid=${occ.ical_uid ?? "null"} sources=${occ.source_count} participants=${occ.participant_count}`);
    console.log(`  linked meetings (${sources?.length ?? 0}):`);
    for (const s of sources ?? []) {
      console.log(`    user=${s.user_id?.slice(0, 8)}… ical=${s.ical_uid ?? "null"} outlook=${s.outlook_event_id ?? "null"}`);
    }
  }

  console.log("\n=== 4. All standup occurrences — duplicate start_times ===\n");

  const {data: allStandups} = await admin
    .from("meeting_occurrences")
    .select("id, title, canonical_key, ical_uid, start_time, source_count")
    .ilike("title", "%standup%");

  const byStart = new Map<string, typeof allStandups>();
  for (const row of allStandups ?? []) {
    const k = row.start_time as string;
    const list = byStart.get(k) ?? [];
    list.push(row);
    byStart.set(k, list);
  }

  const dupedStarts = [...byStart.entries()].filter(([, rows]) => (rows?.length ?? 0) > 1);
  console.log(`Standup start_times with >1 occurrence: ${dupedStarts.length}`);
  for (const [start, rows] of dupedStarts.slice(0, 10)) {
    console.log(`\n  ${start} → ${rows?.length} occurrences:`);
    for (const r of rows ?? []) {
      console.log(`    key=${r.canonical_key} ical=${r.ical_uid ?? "null"} sources=${r.source_count}`);
    }
  }

  console.log("\n=== 5. ical_uid coverage ===\n");

  const {data: linkedSample} = await admin
    .from("meetings")
    .select("ical_uid")
    .not("occurrence_id", "is", null);
  const linkedTotal = linkedSample?.length ?? 0;
  const linkedWithIcal = (linkedSample ?? []).filter((r) => r.ical_uid).length;

  const userIds = [...new Set(unlinked.map((r) => r.user_id as string).filter(Boolean))];
  console.log(`Linked meetings: ${linkedTotal}, with ical_uid: ${linkedWithIcal} (${Math.round((linkedWithIcal / Math.max(linkedTotal, 1)) * 100)}%)`);
  console.log(`Unlinked: ${unlinked.length} rows from ${userIds.length} user(s): ${userIds.join(", ")}`);

  const {data: standupAtTime} = await admin
    .from("meetings")
    .select("id, user_id, ical_uid, occurrence_id, series_master_id, title")
    .eq("start_time", "2026-02-13T08:00:00+00:00")
    .ilike("title", "%standup%");

  console.log(`\nAll standup meetings at 2026-02-13 08:00: ${standupAtTime?.length ?? 0}`);
  for (const m of standupAtTime ?? []) {
    console.log(
      `  user=${(m.user_id as string)?.slice(0, 8)}… ical=${m.ical_uid ? "yes" : "null"} occ=${m.occurrence_id ? "linked" : "UNLINKED"}`,
    );
  }

  // Why unlinked weren't merged: try upsert first unlinked key
  if (unlinked.length > 0) {
    console.log("\n=== 6. Test upsert for first unlinked meeting ===\n");
    const test = unlinked[0];
    const key = canonicalMeetingKey(test as Parameters<typeof canonicalMeetingKey>[0]);
    const {error: upsertErr} = await admin.from("meeting_occurrences").upsert(
      {
        team_id: test.team_id,
        canonical_key: key,
        title: test.title ?? "test",
        start_time: test.start_time,
        duration_minutes: test.duration_minutes ?? 0,
        source_count: 1,
        last_merged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {onConflict: "team_id,canonical_key"},
    );
    console.log(`Upsert test key length=${key.length}:`, upsertErr ?? "OK");
  }

  console.log("\n=== 7. Standup ical_uid coverage (all dates) ===\n");

  const {data: standupMeetings} = await admin
    .from("meetings")
    .select("ical_uid, title, start_time, user_id")
    .ilike("title", "%standup%");

  const standupTotal = standupMeetings?.length ?? 0;
  const standupWithIcal = (standupMeetings ?? []).filter((m) => m.ical_uid).length;
  console.log(`Standup meetings: ${standupTotal}, with ical_uid: ${standupWithIcal}`);

  if (standupWithIcal > 0) {
    const sample = (standupMeetings ?? []).find((m) => m.ical_uid);
    console.log(`Sample ical_uid: ${sample?.ical_uid?.slice(0, 40)}… at ${sample?.start_time}`);
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
