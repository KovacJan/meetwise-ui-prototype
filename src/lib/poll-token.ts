import {createHmac} from "crypto";

const POLL_LINK_SECRET = process.env.POLL_LINK_SECRET;
const TOKEN_EXPIRY_DAYS = 30;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const pad = remainder ? "=".repeat(4 - remainder) : "";
  return Buffer.from(padded + pad, "base64");
}

export type PollTokenPayload = {
  userId: string;
  meetingId: string;
  exp: number;
};

/** True if POLL_LINK_SECRET is set and we can create/verify tokens. */
export function canCreatePollToken(): boolean {
  return Boolean(POLL_LINK_SECRET);
}

/**
 * Creates a signed token for poll email links so we can identify the user
 * when they open the link without being logged in (e.g. from email client).
 * Token is valid for TOKEN_EXPIRY_DAYS.
 * Returns null if POLL_LINK_SECRET is not set (callers can build URL without token).
 */
export function createPollToken(userId: string, meetingId: string): string | null {
  const secret = POLL_LINK_SECRET;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
  const payload: PollTokenPayload = {userId, meetingId, exp};
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies the token and returns the userId if valid for the given meetingId.
 * Returns null if secret missing, token invalid, expired, or meetingId mismatch.
 */
export function verifyPollToken(token: string, meetingId: string): string | null {
  const secret = POLL_LINK_SECRET;
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  const expectedSigB64 = base64UrlEncode(sig);
  if (sigB64 !== expectedSigB64) return null;
  let payload: PollTokenPayload;
  try {
    const decoded = base64UrlDecode(payloadB64).toString("utf8");
    payload = JSON.parse(decoded) as PollTokenPayload;
  } catch {
    return null;
  }
  if (payload.meetingId !== meetingId) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.userId || typeof payload.userId !== "string") return null;
  return payload.userId;
}
