"use server";

import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {ensureProfile} from "@/app/[locale]/(auth)/onboarding/actions";

export type LoginState = {
  error?: string;
  /** The email the user attempted to sign in with (used for resend flow) */
  unconfirmedEmail?: string;
  /** Set when we detect the email is not yet confirmed */
  needsConfirmation?: boolean;
  /** Set when resend succeeded */
  resentConfirmation?: boolean;
};

export async function signIn(
  locale: string,
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // Optional relative URL to redirect to after successful sign-in
  const next = String(formData.get("next") ?? "").trim();

  if (!email || !password) {
    return {error: "Email and password are required."};
  }

  let redirectTo: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();

    const {error} = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Detect email-not-confirmed variants returned by Supabase
      const msg = error.message.toLowerCase();
      if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
        return {
          needsConfirmation: true,
          unconfirmedEmail: email,
          error:
            "Your email address hasn't been confirmed yet. Please check your inbox for the confirmation link.",
        };
      }
      if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
        return {
          error: "Incorrect email or password. Please check your credentials and try again.",
        };
      }
      return {error: error.message};
    }

    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      redirectTo = `/${locale}/dashboard`;
    } else {
      const profile = await ensureProfile(supabase);

      // Fire-and-forget calendar sync only if user has a team and Outlook is connected
      try {
        if (profile.team_id && profile.outlook_connected) {
          void fetch(
            `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/sync-calendar`,
            {method: "POST"},
          );
        }
      } catch {
        // Best-effort only; ignore failures
      }

      // Honour explicit ?next= redirect (relative URLs only, for safety)
      if (next && next.startsWith("/")) {
        redirectTo = next;
      } else {
        redirectTo = profile.team_id
          ? `/${locale}/dashboard`
          : `/${locale}/onboarding`;
      }
    }
  } catch (err) {
    console.error("Login error", err);
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred while signing in.";
    return {error: message};
  }

  if (redirectTo) redirect(redirectTo);
  return {};
}

export async function resendLoginConfirmation(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");

  if (!email) return {error: "Email is required.", needsConfirmation: true};

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    // Use admin generateLink so we can build a custom /auth/confirm URL
    // and avoid the PKCE/implicit-flow ambiguity of Supabase's built-in resend.
    const {createSupabaseAdminClient} = await import("@/app/lib/supabase-server");
    const admin = createSupabaseAdminClient();
    const {data, error} = await (admin.auth.admin as any).generateLink({
      type: "signup",
      email,
      options: {redirectTo: `${appUrl}/auth/confirm`},
    });

    if (error || !data?.properties?.hashed_token) {
      return {
        needsConfirmation: true,
        unconfirmedEmail: email,
        error: error?.message ?? "Could not generate confirmation link.",
      };
    }

    const tokenHash = data.properties.hashed_token as string;
    const confirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`;

    // Send via Resend using the same helper from register/actions
    const {Resend} = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL ?? "MeetWise <onboarding@resend.dev>";
    const {error: sendError} = await resend.emails.send({
      from,
      to: email,
      subject: "Confirm your MeetWise account",
      html: `<p>Click <a href="${confirmUrl}">here</a> to confirm your email address.</p><p>Or copy this link: ${confirmUrl}</p>`,
    });

    if (sendError) {
      console.error("login: failed to resend confirmation email via Resend", {
        to: email,
        error: sendError,
      });
      throw new Error(sendError.message);
    }

    return {resentConfirmation: true, unconfirmedEmail: email};
  } catch (err) {
    return {
      needsConfirmation: true,
      unconfirmedEmail: email,
      error: err instanceof Error ? err.message : "Failed to resend email.",
    };
  }
}
