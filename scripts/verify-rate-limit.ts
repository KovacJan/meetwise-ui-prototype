/**
 * Live Supabase check for rate_limit_hits + check_rate_limit RPC.
 * Usage: npx tsx scripts/verify-rate-limit.ts
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

type RpcResult = {
  success: boolean;
  retry_after_seconds?: number;
  remaining?: number;
};

async function callLimit(
  admin: ReturnType<typeof createClient>,
  identifier: string,
  limit: number,
  cost = 1,
): Promise<RpcResult> {
  const {data, error} = await admin.rpc("check_rate_limit", {
    p_policy_id: "verify.test",
    p_identifier: identifier,
    p_limit: limit,
    p_window_seconds: 60,
    p_cost: cost,
  });
  if (error) throw new Error(`RPC failed: ${error.message}`);
  return data as RpcResult;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const admin = createClient(url, key, {auth: {persistSession: false}});
  const testId = `verify-${Date.now()}`;

  console.log("1. Table rate_limit_hits …");
  const {error: tableError} = await admin.from("rate_limit_hits").select("id").limit(1);
  if (tableError) {
    console.error("   FAIL:", tableError.message);
    process.exit(1);
  }
  console.log("   OK");

  console.log("2. RPC allow (limit=3) …");
  for (let i = 0; i < 3; i++) {
    const r = await callLimit(admin, testId, 3);
    if (!r.success) {
      console.error(`   FAIL: request ${i + 1} blocked unexpectedly`, r);
      process.exit(1);
    }
  }
  console.log("   OK (3/3 allowed)");

  console.log("3. RPC block on 4th request …");
  const blocked = await callLimit(admin, testId, 3);
  if (blocked.success || !blocked.retry_after_seconds) {
    console.error("   FAIL: expected block with retry_after_seconds", blocked);
    process.exit(1);
  }
  console.log(`   OK (retry_after_seconds=${blocked.retry_after_seconds})`);

  console.log("4. Multi-cost (invite-style, cost=2 on limit=5) …");
  const costId = `verify-cost-${Date.now()}`;
  const a = await callLimit(admin, costId, 5, 2);
  const b = await callLimit(admin, costId, 5, 2);
  const c = await callLimit(admin, costId, 5, 2);
  if (!a.success || !b.success || c.success) {
    console.error("   FAIL: expected 2×cost=2 ok, 3rd blocked", {a, b, c});
    process.exit(1);
  }
  console.log("   OK");

  console.log("5. Cleanup test rows …");
  await admin
    .from("rate_limit_hits")
    .delete()
    .like("identifier", "verify-%");

  console.log("\nAll rate-limit Supabase checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
