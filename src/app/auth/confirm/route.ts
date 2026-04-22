import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {type NextRequest, NextResponse} from "next/server";

/**
 * Handles our custom email confirmation flow.
 *
 * Instead of relying on Supabase's hosted redirect (which uses an implicit/hash-based
 * token flow the server can't read), we embed the hashed_token directly in the link
 * we send via Resend and handle verification here with verifyOtp({ token_hash }).
 *
 * URL format:  /auth/confirm?token_hash=<hash>&type=signup
 */
export async function GET(request: NextRequest) {
  const {searchParams, origin} = new URL(request.url);

  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "signup") as
    | "signup"
    | "magiclink"
    | "recovery"
    | "email_change";

  if (!token_hash) {
    return NextResponse.redirect(
      `${origin}/en/login?notice=${encodeURIComponent(
        "Invalid confirmation link. Please request a new one.",
      )}`,
    );
  }

  const supabase = await createSupabaseServerClient();

  const {error} = await supabase.auth.verifyOtp({token_hash, type});

  if (error) {
    const isExpired =
      error.message.toLowerCase().includes("expired") ||
      error.message.toLowerCase().includes("invalid");
    return NextResponse.redirect(
      `${origin}/en/login?notice=${encodeURIComponent(
        isExpired
          ? "Your confirmation link has expired or is invalid. Please sign in and request a new one."
          : error.message,
      )}`,
    );
  }

  // Success — email is confirmed and a session is now set in cookies.
  // Redirect to login with a success notice so the user knows to sign in.
  return NextResponse.redirect(
    `${origin}/en/login?notice=${encodeURIComponent(
      "Your email has been confirmed! Please sign in to continue.",
    )}`,
  );
}
