const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? "common";

export const MICROSOFT_AUTH_TENANT = MICROSOFT_TENANT_ID;
// Include basic OpenID scopes plus calendar access
export const MICROSOFT_AUTH_SCOPE =
  "openid profile email offline_access Calendars.Read";

export function getMicrosoftAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_AUTH_SCOPE,
    state,
  });

  return `https://login.microsoftonline.com/${MICROSOFT_AUTH_TENANT}/oauth2/v2.0/authorize?${params.toString()}`;
}

const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${MICROSOFT_AUTH_TENANT}/oauth2/v2.0/token`;

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

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
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
): Promise<TokenResponse> {
  const clientId = assertEnv(
    "MICROSOFT_CLIENT_ID",
    process.env.MICROSOFT_CLIENT_ID,
  );
  const clientSecret = assertEnv(
    "MICROSOFT_CLIENT_SECRET",
    process.env.MICROSOFT_CLIENT_SECRET,
  );

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_AUTH_SCOPE,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
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
 * Fetch calendar events from Microsoft Graph for a given time range.
 */
export async function getCalendarEvents(
  accessToken: string,
  from: Date,
  to: Date,
): Promise<NormalizedMeeting[]> {
  const startDateTime = from.toISOString();
  const endDateTime = to.toISOString();

  const url = new URL(
    "https://graph.microsoft.com/v1.0/me/calendarView",
  );
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set(
    "$select",
    [
      "id",
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
      "Prefer": 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch calendar events: ${text}`);
  }

  const json = (await res.json()) as {
    value: Array<{
      id: string;
      subject?: string;
      start?: {dateTime?: string; timeZone?: string};
      end?: {dateTime?: string; timeZone?: string};
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
  for (const event of json.value) {
    // Never sync private events into the app.
    if (event.sensitivity?.toLowerCase() === "private") continue;

    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (!start || !end) continue;

    // Ensure the datetime string is treated as UTC.
    const toUtcString = (dt: string) =>
      dt.endsWith("Z") || dt.includes("+") ? dt : dt + "Z";

    const startDate = new Date(toUtcString(start));
    const endDate = new Date(toUtcString(end));
    const durationMinutes = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / 60000),
    );

    const participantCount = (event.attendees ?? []).length || 1;

    items.push({
      id: event.id,
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

