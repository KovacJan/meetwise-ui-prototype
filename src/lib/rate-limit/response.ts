import {NextResponse} from "next/server";

import type {RateLimitErrorCode} from "./codes";

export function rateLimitedResponse(
  code: RateLimitErrorCode,
  retryAfterSeconds: number,
): NextResponse {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  return NextResponse.json(
    {code, retryAfterSeconds: retryAfter},
    {
      status: 429,
      headers: {"Retry-After": String(retryAfter)},
    },
  );
}

export function rateLimitValidationResponse(
  code: RateLimitErrorCode,
): NextResponse {
  return NextResponse.json({code}, {status: 400});
}
