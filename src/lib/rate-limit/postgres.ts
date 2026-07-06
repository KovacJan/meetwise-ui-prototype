import {createSupabaseAdminClient} from "@/app/lib/supabase-server";

import {getPolicyConfig, type RateLimitPolicyId} from "./policies";
import type {RateLimitCheckResult} from "./client";

type RpcResult = {
  success: boolean;
  retry_after_seconds?: number;
  remaining?: number;
};

export async function checkRateLimitPostgres(
  policyId: RateLimitPolicyId,
  identifier: string,
  cost: number,
): Promise<RateLimitCheckResult> {
  const config = getPolicyConfig(policyId);
  const admin = createSupabaseAdminClient();

  const {data, error} = await admin.rpc("check_rate_limit", {
    p_policy_id: policyId,
    p_identifier: identifier,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
    p_cost: cost,
  });

  if (error) {
    console.error("rate-limit: postgres check failed", error.message);
    return {success: true};
  }

  const result = data as RpcResult;
  if (!result.success) {
    return {
      success: false,
      retryAfterSeconds: result.retry_after_seconds ?? 60,
      remaining: 0,
    };
  }

  return {success: true, remaining: result.remaining};
}
