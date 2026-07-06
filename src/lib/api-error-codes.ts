import {RATE_LIMIT_ERROR_CODES} from "@/lib/rate-limit/codes";

/** API `code` values with entries under `errors.*` in messages */
export const API_ERROR_CODES = [
  ...RATE_LIMIT_ERROR_CODES,
  "OUTLOOK_TOKEN_FAILED",
  "OUTLOOK_RECONNECT_REQUIRED",
  "OUTLOOK_NOT_CONNECTED",
  "CALENDAR_WRITE_REQUIRED",
  "LEADER_ONLY",
  "NO_TEAM",
  "SCHEDULING_FIND_FAILED",
  "SCHEDULING_CREATE_FAILED",
  "SCHEDULING_UPDATE_FAILED",
  "SCHEDULING_CANCEL_FAILED",
  "SYNC_FAILED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(code: string): code is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(code);
}
