import {describe, it, expect, beforeEach} from "vitest";

import {resolveApiErrorMessage} from "@/lib/rate-limit-ui";
import {
  checkRateLimit,
  getPolicyConfig,
  rateLimitedResponse,
  RATE_LIMIT_POLICIES,
  resetMemoryRateLimiters,
  syncCooldownRetrySeconds,
} from "@/lib/rate-limit";

describe("rate limit policies", () => {
  it("defines agreed poll IP limit", () => {
    expect(getPolicyConfig("poll.ip")).toEqual({
      limit: 30,
      window: "10 m",
      windowSeconds: 600,
    });
  });

  it("defines agreed invite limits", () => {
    expect(getPolicyConfig("invite.userBurst").limit).toBe(10);
    expect(getPolicyConfig("invite.teamDaily").limit).toBe(1000);
    expect(RATE_LIMIT_POLICIES.invite.maxEmailsPerRequest).toBe(100);
  });
});

describe("rateLimitedResponse", () => {
  it("returns 429 with code, retryAfterSeconds, and Retry-After header", async () => {
    const res = rateLimitedResponse("RATE_LIMIT_POLL", 125);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("125");

    const body = await res.json();
    expect(body).toEqual({
      code: "RATE_LIMIT_POLL",
      retryAfterSeconds: 125,
    });
  });

  it("rounds retryAfterSeconds up to at least 1", async () => {
    const res = rateLimitedResponse("RATE_LIMIT_SYNC", 0.2);
    expect(res.headers.get("Retry-After")).toBe("1");
    const body = await res.json();
    expect(body.retryAfterSeconds).toBe(1);
  });
});

describe("checkRateLimit (memory backend in test)", () => {
  beforeEach(() => {
    resetMemoryRateLimiters();
  });

  it("allows requests under the limit", async () => {
    for (let i = 0; i < 30; i++) {
      const result = await checkRateLimit("poll.ip", "test-ip");
      expect(result.success).toBe(true);
    }
  });

  it("blocks when limit exceeded and provides retryAfterSeconds", async () => {
    for (let i = 0; i < 30; i++) {
      await checkRateLimit("poll.ip", "blocked-ip");
    }
    const blocked = await checkRateLimit("poll.ip", "blocked-ip");
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("supports multi-unit cost for team daily invite quota", async () => {
    const teamId = "team-cost-test";
    const dailyLimit = RATE_LIMIT_POLICIES.invite.teamDaily.limit;
    const batchSize = 30;

    const first = await checkRateLimit("invite.teamDaily", teamId, {
      cost: batchSize,
    });
    expect(first.success).toBe(true);

    const second = await checkRateLimit("invite.teamDaily", teamId, {
      cost: dailyLimit,
    });
    expect(second.success).toBe(false);
  });
});

describe("syncCooldownRetrySeconds", () => {
  it("returns remaining cooldown seconds from last sync timestamp", () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const retry = syncCooldownRetrySeconds(twoMinutesAgo);
    expect(retry).not.toBeNull();
    expect(retry!).toBeGreaterThan(0);
    expect(retry!).toBeLessThanOrEqual(180);
  });

  it("returns null when cooldown has elapsed", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(syncCooldownRetrySeconds(tenMinutesAgo)).toBeNull();
  });
});

describe("resolveApiErrorMessage", () => {
  const tErrors = (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      RATE_LIMIT_POLL: "Wait {minutes} min",
      OUTLOOK_TOKEN_FAILED: "Reconnect Outlook",
      generic: "Generic error",
    };
    const template = messages[key] ?? key;
    return template.replace("{minutes}", String(values?.minutes ?? ""));
  };

  it("maps rate limit codes with retry minutes", () => {
    expect(
      resolveApiErrorMessage(
        {code: "RATE_LIMIT_POLL", retryAfterSeconds: 125},
        tErrors,
        "fallback",
      ),
    ).toBe("Wait 3 min");
  });

  it("maps known API error codes", () => {
    expect(
      resolveApiErrorMessage(
        {code: "OUTLOOK_TOKEN_FAILED", error: "token expired"},
        tErrors,
        "fallback",
      ),
    ).toBe("Reconnect Outlook");
  });

  it("falls back to payload.error then default", () => {
    expect(resolveApiErrorMessage({error: "Legacy"}, tErrors, "fallback")).toBe(
      "Legacy",
    );
    expect(resolveApiErrorMessage({}, tErrors, "fallback")).toBe("fallback");
  });
});
