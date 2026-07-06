/**
 * Prints migration 015 SQL for manual run in Supabase SQL Editor.
 * Usage: npx tsx scripts/apply-migration-015.ts
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
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth: {persistSession: false}},
  );

  const {error} = await admin.from("meeting_occurrences").select("poll_sent").limit(1);
  if (!error) {
    console.log("Migration 015 already applied (poll_sent column exists).\n");
    return;
  }

  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/015_occurrence_polls.sql"),
    "utf8",
  );
  console.log("Migration 015 NOT applied. Run this in Supabase SQL Editor:\n");
  console.log(sql);
  process.exit(1);
}

main();
