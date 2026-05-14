import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {type NextRequest, NextResponse} from "next/server";

/**
 * Handles Supabase email confirmation callbacks.
 * Supabase redirects here with ?code=... after the user clicks the confirmation link.
 * We exchange the code for a session, then redirect to the appropriate page.
 *
 * You must add http://localhost:3000/auth/callback (and your production URL) to
 * the "Redirect URLs" allowlist in Supabase Dashboard → Authentication → URL Configuration.
 */
export async function GET(request: NextRequest) {
  const {searchParams, origin} = new URL(request.url);

  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle error redirects from Supabase (e.g. expired OTP)
  if (error) {
    const msg = errorDescription ?? error;
    return NextResponse.redirect(
      `${origin}/en/login?notice=${encodeURIComponent(
        msg.includes("expired")
          ? "Your confirmation link has expired. Please sign in and we'll resend it."
          : msg,
      )}`,
    );
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const {error: exchangeError} = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Session is now established via cookies — send the user straight into the app.
      // /en/onboarding will redirect to /dashboard if they already have a team.
      return NextResponse.redirect(`${origin}/en/onboarding`);
    }

    // Code exchange failed (e.g. expired or PKCE mismatch)
    return NextResponse.redirect(
      `${origin}/en/login?notice=${encodeURIComponent(
        "Your confirmation link has expired or is invalid. Please sign in and request a new one.",
      )}`,
    );
  }

  // Fallback: redirect to login with a generic notice
  return NextResponse.redirect(
    `${origin}/en/login?notice=${encodeURIComponent(
      "Something went wrong with the confirmation link. Please try signing in.",
    )}`,
  );
}
