import {RATE_LIMIT_POLICIES} from "./policies";

export function syncCooldownRetrySeconds(
  lastCalendarSyncAt: string | null | undefined,
): number | null {
  if (!lastCalendarSyncAt) return null;

  const lastSyncMs = new Date(lastCalendarSyncAt).getTime();
  if (Number.isNaN(lastSyncMs)) return null;

  const cooldownMs = RATE_LIMIT_POLICIES.sync.cooldown.windowSeconds * 1000;
  const elapsed = Date.now() - lastSyncMs;
  if (elapsed >= cooldownMs) return null;

  return Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
}
