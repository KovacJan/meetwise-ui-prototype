import {describe, it, expect} from "vitest";

import {
  MICROSOFT_AUTH_SCOPE,
  MICROSOFT_CALENDAR_WRITE_SCOPE,
  MICROSOFT_READONLY_AUTH_SCOPE,
  getMicrosoftAuthorizeUrl,
  hasCalendarWriteScope,
  isOutlookReconnectRequiredError,
} from "@/lib/microsoft-graph";

describe("Microsoft OAuth scopes", () => {
  it("requests Calendars.ReadWrite for meeting scheduling", () => {
    expect(MICROSOFT_AUTH_SCOPE).toContain("Calendars.Read");
    expect(MICROSOFT_AUTH_SCOPE).toContain(MICROSOFT_CALENDAR_WRITE_SCOPE);
  });

  it("detects write scope in granted scope string", () => {
    expect(
      hasCalendarWriteScope(
        "openid profile email offline_access Calendars.Read Calendars.ReadWrite",
      ),
    ).toBe(true);
    expect(hasCalendarWriteScope("openid Calendars.Read")).toBe(false);
    expect(hasCalendarWriteScope("")).toBe(false);
    expect(hasCalendarWriteScope(null)).toBe(false);
  });

  it("is case-insensitive for scope tokens", () => {
    expect(hasCalendarWriteScope("calendars.readwrite")).toBe(true);
  });

  it("defaults authorize URL to read-only calendar scope", () => {
    const url = getMicrosoftAuthorizeUrl("client-id", "http://localhost/cb", "state");
    expect(url).toContain("Calendars.Read");
    expect(url).toContain("Calendars.Read.Shared");
    expect(url).not.toContain("Calendars.ReadWrite");
  });

  it("includes write scope when explicitly requested", () => {
    const url = getMicrosoftAuthorizeUrl(
      "client-id",
      "http://localhost/cb",
      "state",
      { scope: MICROSOFT_AUTH_SCOPE },
    );
    expect(decodeURIComponent(url)).toContain(MICROSOFT_CALENDAR_WRITE_SCOPE);
  });

  it("detects reconnect-required OAuth errors", () => {
    expect(
      isOutlookReconnectRequiredError(
        'Failed to refresh access token: {"error":"invalid_grant","error_description":"AADSTS65001: consent_required"}',
      ),
    ).toBe(true);
    expect(isOutlookReconnectRequiredError("network timeout")).toBe(false);
  });
});
