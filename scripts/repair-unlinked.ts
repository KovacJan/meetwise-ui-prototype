/**
 * Repair meetings missing occurrence_id.
 * Usage: npx tsx scripts/repair-unlinked.ts
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
  const {repairUnlinkedMeetings} = await import("../src/lib/repair-unlinked-meetings");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {persistSession: false}},
  );

  const {count} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true})
    .is("occurrence_id", null);
  console.log(`Repairing ${count ?? 0} unlinked meetings...\n`);

  const result = await repairUnlinkedMeetings(admin);
  console.log(`Linked: ${result.linked}, errors: ${result.errors}`);

  const {count: remaining} = await admin
    .from("meetings")
    .select("id", {count: "exact", head: true})
    .is("occurrence_id", null);
  const {count: occCount} = await admin
    .from("meeting_occurrences")
    .select("id", {count: "exact", head: true});
  console.log(`\nRemaining unlinked: ${remaining}, occurrences: ${occCount}\n`);
}

main().catch(console.error);
