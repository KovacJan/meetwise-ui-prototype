import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {
  exchangeCodeForTokens,
  hasCalendarWriteScope,
} from "@/lib/microsoft-graph";
import { encryptToken } from "@/lib/token-encryption";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/en/dashboard", req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/en/dashboard", req.url));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("ms_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    console.error("Microsoft OAuth state mismatch", { storedState, state });
    return NextResponse.redirect(new URL("/en/dashboard", req.url));
  }

  cookieStore.delete("ms_oauth_state");

  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) {
    console.error("MICROSOFT_REDIRECT_URI is not set");
    return NextResponse.redirect(new URL("/en/dashboard", req.url));
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/en/login", req.url));
  }

  let encryptedRefreshToken: string;
  let calendarWriteEnabled = false;

  try {
    const tokenResponse = await exchangeCodeForTokens(code, redirectUri);

    const refreshToken = tokenResponse.refresh_token;
    if (!refreshToken) {
      console.error(
        "Microsoft did not return a refresh_token — ensure offline_access scope is requested",
      );
      return NextResponse.redirect(new URL("/en/dashboard", req.url));
    }

    // Code exchange already succeeded — do not re-refresh here (scope mismatch can fail).
    calendarWriteEnabled = hasCalendarWriteScope(tokenResponse.scope);
    encryptedRefreshToken = encryptToken(refreshToken);
  } catch (err) {
    console.error("Microsoft token exchange failed:", err);
    return NextResponse.redirect(
      new URL(
        `/en/sync?error=${encodeURIComponent("Failed to connect Microsoft account. Please try again.")}`,
        req.url,
      ),
    );
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      microsoft_refresh_token: encryptedRefreshToken,
      outlook_connected: true,
      calendar_write_enabled: calendarWriteEnabled,
      last_calendar_sync_status: null,
      last_calendar_sync_error: null,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Failed to update profile with Microsoft token", updateError);
  }

  try {
    await fetch(new URL("/api/sync-calendar", req.url), {
      method: "POST",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
    });
  } catch (e) {
    console.error("Failed to start initial calendar sync", e);
  }

  const dashboardUrl = new URL("/en/dashboard", req.url);
  dashboardUrl.searchParams.set("outlook_reconnected", "1");
  if (calendarWriteEnabled) {
    dashboardUrl.searchParams.set("calendar_write", "1");
  }

  return NextResponse.redirect(dashboardUrl);
}
