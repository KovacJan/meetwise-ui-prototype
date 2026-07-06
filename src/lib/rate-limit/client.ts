import {MemorySlidingWindowLimiter} from "./memory";
import {checkRateLimitPostgres} from "./postgres";
import {getPolicyConfig, type RateLimitPolicyId} from "./policies";

export type RateLimitBackend = "postgres" | "memory" | "disabled";

export type RateLimitCheckResult = {
  success: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
};

export function getRateLimitBackend(): RateLimitBackend {
  if (process.env.RATE_LIMIT_BACKEND === "memory") {
    return "memory";
  }
  if (process.env.NODE_ENV === "test") {
    return "memory";
  }
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return "disabled";
  }
  return "postgres";
}

const memoryLimiters = new Map<RateLimitPolicyId, MemorySlidingWindowLimiter>();

function getMemoryLimiter(policyId: RateLimitPolicyId): MemorySlidingWindowLimiter {
  const existing = memoryLimiters.get(policyId);
  if (existing) return existing;

  const config = getPolicyConfig(policyId);
  const limiter = new MemorySlidingWindowLimiter(
    config.limit,
    config.windowSeconds * 1000,
  );
  memoryLimiters.set(policyId, limiter);
  return limiter;
}

export async function checkRateLimit(
  policyId: RateLimitPolicyId,
  identifier: string,
  options?: {cost?: number},
): Promise<RateLimitCheckResult> {
  const cost = Math.max(1, Math.floor(options?.cost ?? 1));
  const backend = getRateLimitBackend();

  if (backend === "disabled") {
    return {success: true};
  }

  if (backend === "memory") {
    return getMemoryLimiter(policyId).limitKey(identifier, cost);
  }

  return checkRateLimitPostgres(policyId, identifier, cost);
}

/** Test helper — clears in-memory counters between tests. */
export function resetMemoryRateLimiters(): void {
  for (const limiter of memoryLimiters.values()) {
    limiter.reset();
  }
}
