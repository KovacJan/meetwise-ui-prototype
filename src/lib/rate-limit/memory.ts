export type MemoryRateLimitResult = {
  success: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
};

type HitEntry = {
  at: number;
  cost: number;
};

export class MemorySlidingWindowLimiter {
  private readonly hits = new Map<string, HitEntry[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  limitKey(key: string, cost = 1): MemoryRateLimitResult {
    const normalizedCost = Math.max(1, Math.floor(cost));
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const entries = (this.hits.get(key) ?? []).filter((e) => e.at > windowStart);
    const used = entries.reduce((sum, e) => sum + e.cost, 0);

    if (used + normalizedCost > this.limit) {
      const oldest = entries[0];
      const retryAfterSeconds = oldest
        ? Math.max(1, Math.ceil((oldest.at + this.windowMs - now) / 1000))
        : 1;
      return {success: false, retryAfterSeconds, remaining: 0};
    }

    entries.push({at: now, cost: normalizedCost});
    this.hits.set(key, entries);
    return {
      success: true,
      remaining: Math.max(0, this.limit - used - normalizedCost),
    };
  }

  reset(): void {
    this.hits.clear();
  }
}
