export const RATE_LIMIT_POLICIES = {
  poll: {
    ip: {limit: 30, window: "10 m" as const, windowSeconds: 600},
  },
  sync: {
    cooldown: {limit: 1, window: "5 m" as const, windowSeconds: 300},
    hourly: {limit: 12, window: "1 h" as const, windowSeconds: 3600},
  },
  invite: {
    userBurst: {limit: 10, window: "1 m" as const, windowSeconds: 60},
    teamDaily: {limit: 1000, window: "1 d" as const, windowSeconds: 86400},
    maxEmailsPerRequest: 100,
  },
  pollBatch: {
    maxSize: 50,
  },
  scheduling: {
    findSlots: {limit: 60, window: "10 m" as const, windowSeconds: 600},
    create: {limit: 30, window: "1 h" as const, windowSeconds: 3600},
    update: {limit: 30, window: "1 h" as const, windowSeconds: 3600},
    cancel: {limit: 20, window: "1 h" as const, windowSeconds: 3600},
  },
} as const;

export type RateLimitPolicyId =
  | "poll.ip"
  | "sync.cooldown"
  | "sync.hourly"
  | "invite.userBurst"
  | "invite.teamDaily"
  | "scheduling.findSlots"
  | "scheduling.create"
  | "scheduling.update"
  | "scheduling.cancel";

type PolicyConfig = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  windowSeconds: number;
};

const POLICY_MAP: Record<RateLimitPolicyId, PolicyConfig> = {
  "poll.ip": RATE_LIMIT_POLICIES.poll.ip,
  "sync.cooldown": RATE_LIMIT_POLICIES.sync.cooldown,
  "sync.hourly": RATE_LIMIT_POLICIES.sync.hourly,
  "invite.userBurst": RATE_LIMIT_POLICIES.invite.userBurst,
  "invite.teamDaily": RATE_LIMIT_POLICIES.invite.teamDaily,
  "scheduling.findSlots": RATE_LIMIT_POLICIES.scheduling.findSlots,
  "scheduling.create": RATE_LIMIT_POLICIES.scheduling.create,
  "scheduling.update": RATE_LIMIT_POLICIES.scheduling.update,
  "scheduling.cancel": RATE_LIMIT_POLICIES.scheduling.cancel,
};

export function getPolicyConfig(policyId: RateLimitPolicyId): PolicyConfig {
  return POLICY_MAP[policyId];
}
