export const RATE_LIMIT_ERROR_CODES = [
  "RATE_LIMIT_SYNC",
  "RATE_LIMIT_INVITE_BURST",
  "RATE_LIMIT_INVITE_DAILY",
  "RATE_LIMIT_INVITE_BATCH",
  "RATE_LIMIT_POLL",
  "RATE_LIMIT_SCHEDULING",
] as const;

export type RateLimitErrorCode = (typeof RATE_LIMIT_ERROR_CODES)[number];

export function isRateLimitErrorCode(code: string): code is RateLimitErrorCode {
  return (RATE_LIMIT_ERROR_CODES as readonly string[]).includes(code);
}

export type RateLimitErrorBody = {
  code: RateLimitErrorCode;
  retryAfterSeconds?: number;
};
