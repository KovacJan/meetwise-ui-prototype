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
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {persistSession: false}},
  );

  const {data} = await admin
    .from("meetings")
    .select("user_id, ical_uid, series_master_id, start_time, title")
    .eq("start_time", "2026-02-13T08:00:00+00:00")
    .ilike("title", "%standup%");

  for (const m of data ?? []) {
    const series = m.series_master_id as string;
    const {data: siblings} = await admin
      .from("meetings")
      .select("ical_uid, start_time")
      .eq("user_id", m.user_id)
      .eq("series_master_id", series)
      .not("ical_uid", "is", null)
      .limit(3);
    console.log(`user ${(m.user_id as string).slice(0, 8)}… feb13 ical=null`);
    console.log(`  siblings with ical: ${siblings?.length ?? 0}`);
    if (siblings?.[0]) console.log(`  sample ical from ${siblings[0].start_time}: ${siblings[0].ical_uid?.slice(0, 50)}`);
  }

  const {data: june} = await admin
    .from("meeting_occurrences")
    .select("id, canonical_key, ical_uid, source_count, title")
    .eq("start_time", "2026-06-24T06:30:00+00:00")
    .ilike("title", "%standup%");
  console.log("\nJune 24 standup occurrences:", june?.length);
  for (const o of june ?? []) {
    console.log(`  sources=${o.source_count} ical=…${o.ical_uid?.slice(-12)}`);
  }

  const {data: icals} = await admin
    .from("meetings")
    .select("ical_uid, user_id")
    .eq("start_time", "2026-06-24T06:30:00+00:00")
    .ilike("title", "%standup%")
    .not("ical_uid", "is", null);
  const uniqueIcal = new Set((icals ?? []).map((r) => r.ical_uid));
  console.log(`June 24 meetings with ical: ${icals?.length}, unique ical_uids: ${uniqueIcal.size}`);
}

main();
