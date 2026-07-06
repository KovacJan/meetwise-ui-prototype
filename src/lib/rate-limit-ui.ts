import {isApiErrorCode} from "@/lib/api-error-codes";
import {isRateLimitErrorCode} from "@/lib/rate-limit/codes";

export type ApiErrorPayload = {
  code?: string;
  error?: string;
  retryAfterSeconds?: number;
};

type ErrorTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function retryMinutes(retryAfterSeconds?: number): number {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) return 1;
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}

/**
 * Maps structured API error payloads to localized user-facing messages.
 * Falls back to `payload.error`, then `fallback`.
 */
export function resolveApiErrorMessage(
  payload: ApiErrorPayload | null | undefined,
  tErrors: ErrorTranslator,
  fallback: string,
): string {
  if (!payload) return fallback;

  if (payload.code) {
    const values = {minutes: retryMinutes(payload.retryAfterSeconds)};
    if (isRateLimitErrorCode(payload.code) || isApiErrorCode(payload.code)) {
      try {
        return tErrors(payload.code, values);
      } catch {
        // fall through to payload.error / fallback
      }
    }
  }

  if (typeof payload.error === "string" && payload.error.length > 0) {
    return payload.error;
  }

  if (payload.code && isApiErrorCode(payload.code)) {
    return tErrors("generic");
  }

  return fallback;
}
