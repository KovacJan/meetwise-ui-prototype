import {NextRequest, NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {
  exchangeCodeForTokens,
  getAccessToken,
} from "@/lib/microsoft-graph";
import {encryptToken} from "@/lib/token-encryption";

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

  // Validate CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("ms_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    console.error("Microsoft OAuth state mismatch", {storedState, state});
    return NextResponse.redirect(new URL("/en/dashboard", req.url));
  }

  // Clear the state cookie
  cookieStore.delete("ms_oauth_state");

  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!redirectUri) {
    console.error("MICROSOFT_REDIRECT_URI is not set");
    return NextResponse.redirect(new URL("/en/dashboard", req.url));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: {session},
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/en/login", req.url));
  }

  let encryptedRefreshToken: string;

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForTokens(code, redirectUri);

    const refreshToken = tokenResponse.refresh_token;
    if (!refreshToken) {
      console.error("Microsoft did not return a refresh_token — ensure offline_access scope is requested");
      return NextResponse.redirect(new URL("/en/dashboard", req.url));
    }

    // Verify the refresh token works before storing it
    await getAccessToken(refreshToken);

    encryptedRefreshToken = encryptToken(refreshToken);
  } catch (err) {
    console.error("Microsoft token exchange failed:", err);
    // Redirect to sync page with error notice rather than a blank 500
    return NextResponse.redirect(
      new URL(
        `/en/sync?error=${encodeURIComponent("Failed to connect Microsoft account. Please try again.")}`,
        req.url,
      ),
    );
  }

  // Store on the profile
  const {error: updateError} = await supabase
    .from("profiles")
    .update({
      microsoft_refresh_token: encryptedRefreshToken,
      outlook_connected: true,
    })
    .eq("id", session.user.id);

  if (updateError) {
    console.error("Failed to update profile with Microsoft token", updateError);
  }

  // Trigger initial calendar sync in the background (fire-and-forget)
  try {
    void fetch(new URL("/api/sync-calendar", req.url), {method: "POST"});
  } catch (e) {
    console.error("Failed to start initial calendar sync", e);
  }

  return NextResponse.redirect(new URL("/en/dashboard", req.url));
}
