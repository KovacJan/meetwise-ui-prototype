import { isWeekendMeetingStart } from "@/lib/meeting-filters";
import { createHash } from "crypto";

function getMicrosoftTenant(): string {
  return process.env.MICROSOFT_TENANT_ID ?? "common";
}

export function getMicrosoftAuthTenant(): string {
  return getMicrosoftTenant();
}
// Calendar read (sync) + shared free/busy (findMeetingTimes) + write (scheduling)
export const MICROSOFT_CALENDAR_READ_SCOPE = "Calendars.Read";
export const MICROSOFT_CALENDAR_READ_SHARED_SCOPE = "Calendars.Read.Shared";
export const MICROSOFT_CALENDAR_WRITE_SCOPE = "Calendars.ReadWrite";
export const MICROSOFT_CALENDAR_WRITE_SHARED_SCOPE = "Calendars.ReadWrite.Shared";

export const MICROSOFT_AUTH_SCOPE =
  "openid profile email offline_access Calendars.Read Calendars.Read.Shared Calendars.ReadWrite Calendars.ReadWrite.Shared";
export const MICROSOFT_READONLY_AUTH_SCOPE =
  "openid profile email offline_access Calendars.Read Calendars.Read.Shared";

export function hasCalendarWriteScope(scope: string | undefined | null): boolean {
  if (!scope) return false;
  return scope
    .toLowerCase()
    .split(/\s+/)
    .includes(MICROSOFT_CALENDAR_WRITE_SCOPE.toLowerCase());
}

export function isOutlookReconnectRequiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("consent_required") ||
    lower.includes("aadsts65001") ||
    lower.includes("invalid_grant") ||
    lower.includes("interaction_required")
  );
}

export function getMicrosoftAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  options?: { promptConsent?: boolean; scope?: string },
) {
  const scope = options?.scope ?? MICROSOFT_READONLY_AUTH_SCOPE;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope,
    state,
  });

  if (options?.promptConsent) {
    params.set("prompt", "consent");
  }

  return `https://login.microsoftonline.com/${getMicrosoftTenant()}/oauth2/v2.0/authorize?${params.toString()}`;
}

function getTokenEndpoint(): string {
  return `https://login.microsoftonline.com/${getMicrosoftTenant()}/oauth2/v2.0/token`;
}

type TokenResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
};

export type NormalizedMeeting = {
  id: string;
  icalUid?: string | null;
  subject: string;
  start: string;
  end: string;
  durationMinutes: number;
  participantCount: number;
  // Extra metadata requested for analytics
  isAllDay?: boolean;
  originalStartTimeZone?: string;
  originalEndTimeZone?: string;
  type?: string;
  seriesMasterId?: string | null;
  recurrence?: unknown;
  isCancelled?: boolean;
  attendees?: unknown[];
};

function assertEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function secretFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function logOAuthDebug(
  context: "code_exchange" | "refresh_token",
  clientId: string,
  clientSecret: string,
) {
  if (process.env.MICROSOFT_OAUTH_DEBUG !== "true") return;

  console.info("microsoft-oauth debug", {
    context,
    tenant: getMicrosoftTenant(),
    clientId,
    secretLength: clientSecret.length,
    secretMasked: maskSecret(clientSecret),
    secretFingerprint: secretFingerprint(clientSecret),
  });
}

/**
 * Exchange an authorization code for tokens (used in OAuth callback).
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = assertEnv(
    "MICROSOFT_CLIENT_ID",
    process.env.MICROSOFT_CLIENT_ID,
  );
  const clientSecret = assertEnv(
    "MICROSOFT_CLIENT_SECRET",
    process.env.MICROSOFT_CLIENT_SECRET,
  );

  logOAuthDebug("code_exchange", clientId, clientSecret);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to exchange code for tokens: ${text}`);
  }

  const json = (await res.json()) as TokenResponse;
  return json;
}

/**
 * Refresh an access token using a stored refresh token.
 */
export async function getAccessToken(
  refreshToken: string,
  scope?: string,
): Promise<TokenResponse> {
  const clientId = assertEnv(
    "MICROSOFT_CLIENT_ID",
    process.env.MICROSOFT_CLIENT_ID,
  );
  const clientSecret = assertEnv(
    "MICROSOFT_CLIENT_SECRET",
    process.env.MICROSOFT_CLIENT_SECRET,
  );

  logOAuthDebug("refresh_token", clientId, clientSecret);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (scope) {
    body.set("scope", scope);
  }

  const res = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh access token: ${text}`);
  }

  const json = (await res.json()) as TokenResponse;
  return json;
}

/**
 * Refresh calendar access. Sync uses read-only; scheduling may prefer write with fallback.
 */
export async function refreshCalendarAccessToken(
  refreshToken: string,
  options?: { preferWrite?: boolean },
): Promise<TokenResponse> {
  const scopes: (string | undefined)[] = options?.preferWrite
    ? [MICROSOFT_AUTH_SCOPE, MICROSOFT_READONLY_AUTH_SCOPE, undefined]
    : [MICROSOFT_READONLY_AUTH_SCOPE, undefined];

  let lastError: unknown;
  for (const scope of scopes) {
    try {
      return await getAccessToken(refreshToken, scope);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to refresh access token");
}

/**
 * Fetch calendar events from Microsoft Graph for a given time range.
 */
export async function getCalendarEvents(
  accessToken: string,
  from: Date,
  to: Date,
): Promise<NormalizedMeeting[]> {
  const startDateTime = from.toISOString();
  const endDateTime = to.toISOString();

  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set(
    "$select",
    [
      "id",
      "iCalUId",
      "subject",
      "start",
      "end",
      "attendees",
      "isAllDay",
      "originalStartTimeZone",
      "originalEndTimeZone",
      "type",
      "seriesMasterId",
      "recurrence",
      "isCancelled",
      "sensitivity",
    ].join(","),
  );
  url.searchParams.set("$top", "1000");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Request all date/time values in UTC so we never have to convert
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch calendar events: ${text}`);
  }

  const json = (await res.json()) as {
    value: Array<{
      id: string;
      iCalUId?: string;
      subject?: string;
      start?: { dateTime?: string; timeZone?: string };
      end?: { dateTime?: string; timeZone?: string };
      attendees?: Array<unknown>;
      isAllDay?: boolean;
      originalStartTimeZone?: string;
      originalEndTimeZone?: string;
      type?: string;
      seriesMasterId?: string | null;
      recurrence?: unknown;
      isCancelled?: boolean;
      sensitivity?: string;
    }>;
  };

  const items: NormalizedMeeting[] = [];
  const isPrivateSensitivity = (value?: string) => {
    const v = value?.toLowerCase();
    // Different tenants/calendars can mark hidden meetings with
    // private/personal/confidential sensitivity variants.
    return v === "private" || v === "personal" || v === "confidential";
  };
  const isObfuscatedPrivateSubject = (subject?: string) => {
    const s = (subject ?? "").trim();
    // Some private meetings arrive with opaque auto-generated subjects
    // (example: S030A3673) and without attendee details.
    return /^[A-Z]\d{3,}[A-Z]\d+$/.test(s);
  };

  for (const event of json.value) {
    // Never sync private/sensitive events into the app.
    if (isPrivateSensitivity(event.sensitivity)) continue;

    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (!start || !end) continue;

    // Ensure the datetime string is treated as UTC.
    const toUtcString = (dt: string) =>
      dt.endsWith("Z") || dt.includes("+") ? dt : dt + "Z";

    const startDate = new Date(toUtcString(start));
    const endDate = new Date(toUtcString(end));
    if (isWeekendMeetingStart(startDate.toISOString())) continue;
    const durationMinutes = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / 60000),
    );

    const participantCount = (event.attendees ?? []).length || 1;
    const hasNoAttendeeDetails = (event.attendees ?? []).length === 0;
    if (hasNoAttendeeDetails && isObfuscatedPrivateSubject(event.subject)) {
      continue;
    }

    items.push({
      id: event.id,
      icalUid: event.iCalUId ?? null,
      subject: event.subject ?? "Meeting",
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      durationMinutes,
      participantCount,
      isAllDay: event.isAllDay,
      originalStartTimeZone: event.originalStartTimeZone,
      originalEndTimeZone: event.originalEndTimeZone,
      type: event.type,
      seriesMasterId: event.seriesMasterId ?? null,
      recurrence: event.recurrence,
      isCancelled: event.isCancelled,
      attendees: event.attendees,
    });
  }
  return items;
}
