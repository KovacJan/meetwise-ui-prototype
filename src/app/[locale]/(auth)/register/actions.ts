"use server";

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {
  MEETWISE_PRIVACY_VERSION,
  MEETWISE_TERMS_VERSION,
} from "@/lib/legal/versions";

export type RegisterState = {
  error?: string;
  awaitingConfirmation?: boolean;
  email?: string;
  /** Only set in development when both Supabase and Resend email sending fail. */
  devConfirmUrl?: string;
};

/**
 * Attempt to generate a hashed_token via the admin API and send a custom confirmation
 * email via Resend. Returns the confirmUrl so the caller can use it as a dev fallback.
 *
 * The optional `password` is used on the initial sign-up fallback so that
 * the user can later sign in with email/password even if Supabase's built-in
 * email sending failed. For pure "resend confirmation" flows we omit it to
 * avoid overwriting an existing password.
 */
async function tryAdminEmailFlow(
  email: string,
  fullName: string,
  appUrl: string,
  password?: string,
): Promise<{ confirmUrl: string; userId: string | null }> {
  const admin = createSupabaseAdminClient();

  // Ensure the user exists (may already exist from a previous attempt)
  const { data: createdUserData, error: createError } = await (
    admin.auth.admin as any
  ).createUser({
    email,
    ...(password ? { password } : {}),
    user_metadata: { full_name: fullName || undefined },
    email_confirm: false,
  });

  // Ignore "already exists" errors — we just need the user to exist
  const alreadyExists =
    createError &&
    (createError.message.toLowerCase().includes("already") ||
      createError.message.toLowerCase().includes("duplicate") ||
      createError.message.toLowerCase().includes("exists"));

  if (createError && !alreadyExists) {
    throw new Error(createError.message);
  }

  // Generate a one-time confirmation link using the hashed_token
  const { data, error: linkError } = await (
    admin.auth.admin as any
  ).generateLink({
    type: "signup",
    email,
    options: { redirectTo: `${appUrl}/auth/confirm` },
  });

  if (linkError || !data?.properties?.hashed_token) {
    throw new Error(
      linkError?.message ?? "Could not generate confirmation link",
    );
  }

  const tokenHash = data.properties.hashed_token as string;
  const confirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`;

  // Try sending via Resend
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.RESEND_FROM_EMAIL ?? "MeetWise <onboarding@resend.dev>";
  const firstName = fullName?.split(" ")[0] || "there";

  const { error: sendError } = await resend.emails.send({
    from,
    to: email,
    subject: "Confirm your MeetWise account",
    html: `<!DOCTYPE html><html><body style="background:#0f1127;font-family:sans-serif;padding:40px 16px;color:#fff">
<div style="max-width:520px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:40px;text-align:center">
  <div style="font-size:24px;font-weight:700;margin-bottom:8px">MeetWise</div>
  <h2 style="margin:0 0 12px">Hi ${firstName}! 👋</h2>
  <p style="color:rgba(255,255,255,0.6);margin:0 0 28px">Click the button below to confirm your email and activate your account.</p>
  <a href="${confirmUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#00a4ef,#0078d4);color:#fff;text-decoration:none;border-radius:12px;font-weight:600">Confirm email →</a>
  <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.25)">Or copy: ${confirmUrl}</p>
</div></body></html>`,
  });

  if (sendError) {
    console.error("register: failed to send confirmation email via Resend", {
      to: email,
      error: sendError,
    });
    throw new Error(sendError.message);
  }

  return {
    confirmUrl,
    userId: createdUserData?.user?.id ?? data?.user?.id ?? null,
  };
}

async function persistLegalConsentAudit(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const acceptedAt = new Date().toISOString();

  const { error } = await admin.from("legal_consent_audit").upsert(
    [
      {
        user_id: userId,
        policy_type: "terms_of_use",
        policy_version: MEETWISE_TERMS_VERSION,
        accepted_at: acceptedAt,
        acceptance_source: "register_form",
      },
      {
        user_id: userId,
        policy_type: "privacy_policy",
        policy_version: MEETWISE_PRIVACY_VERSION,
        accepted_at: acceptedAt,
        acceptance_source: "register_form",
      },
    ],
    {
      onConflict: "user_id,policy_type,policy_version,acceptance_source",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`Failed to record legal consent audit: ${error.message}`);
  }
}

function toRegisterAuditErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  if (
    lowered.includes("legal_consent_audit") &&
    (lowered.includes("does not exist") || lowered.includes("relation"))
  ) {
    return "Registration is temporarily unavailable because a required database migration is missing. Please apply migration 016_legal_consent_audit.sql and try again.";
  }

  if (lowered.includes("failed to record legal consent audit")) {
    return "We could not record your legal consent confirmation. Please try again in a moment.";
  }

  return "Registration could not be completed due to a legal consent audit error. Please try again.";
}

export async function signUp(
  locale: string,
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  const acceptedLegal = String(formData.get("acceptLegal") ?? "") === "on";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (!acceptedLegal) {
    return { error: "You must agree to the Privacy Policy and Terms of Use." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── Primary path: standard signUp (Supabase's own email service) ────────────
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || undefined },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (!error) {
    if (data.user?.id) {
      try {
        await persistLegalConsentAudit(data.user.id);
      } catch (auditError) {
        return {
          error: toRegisterAuditErrorMessage(auditError),
        };
      }
    } else {
      return {
        error: "Could not create legal consent audit entry. Please try again.",
      };
    }

    // Auto-confirm enabled → session returned immediately
    if (data.session) {
      const dest =
        next && next.startsWith("/") ? next : `/${locale}/onboarding`;
      redirect(dest);
    }
    return { awaitingConfirmation: true, email };
  }

  // ── Fallback: admin generateLink + Resend ────────────────────────────────────
  // Supabase's own email failed (rate limit, SMTP issue, etc.). Try the admin
  // approach which bypasses Supabase's email service entirely.
  try {
    const fallback = await tryAdminEmailFlow(email, fullName, appUrl, password);

    if (fallback.userId) {
      await persistLegalConsentAudit(fallback.userId);
    } else {
      return {
        error: "Could not create legal consent audit entry. Please try again.",
      };
    }

    return { awaitingConfirmation: true, email };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("failed to record legal consent audit")
    ) {
      return { error: toRegisterAuditErrorMessage(err) };
    }

    // Both paths failed. In development, surface the confirmation URL directly in
    // the UI so testing isn't blocked.
    if (process.env.NODE_ENV === "development") {
      try {
        const admin = createSupabaseAdminClient();
        const { data: linkData } = await (admin.auth.admin as any).generateLink(
          {
            type: "signup",
            email,
            options: { redirectTo: `${appUrl}/auth/confirm` },
          },
        );
        if (linkData?.properties?.hashed_token) {
          const tokenHash = linkData.properties.hashed_token as string;
          const devConfirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`;
          return { awaitingConfirmation: true, email, devConfirmUrl };
        }
      } catch {
        // ignore
      }
    }
  }

  // All paths failed — surface the original Supabase error
  const msg = error.message.toLowerCase();
  return {
    error:
      msg.includes("rate limit") || msg.includes("too many")
        ? "Too many sign-up attempts. Please wait a moment and try again."
        : msg.includes("sending") || msg.includes("email")
          ? "Could not send a confirmation email right now. Please try again in a few minutes."
          : error.message,
  };
}

export async function resendConfirmation(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Email is required." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Try Supabase's built-in resend first
  const supabase = await createSupabaseServerClient();
  const { error: resendError } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${appUrl}/auth/callback` },
  });

  if (!resendError) return { awaitingConfirmation: true, email };

  // Fall back to admin generateLink + Resend
  try {
    await tryAdminEmailFlow(email, "", appUrl);
    return { awaitingConfirmation: true, email };
  } catch (err) {
    // Dev fallback: provide direct confirm link
    if (process.env.NODE_ENV === "development") {
      try {
        const admin = createSupabaseAdminClient();
        const { data } = await (admin.auth.admin as any).generateLink({
          type: "signup",
          email,
          options: { redirectTo: `${appUrl}/auth/confirm` },
        });
        if (data?.properties?.hashed_token) {
          const tokenHash = data.properties.hashed_token as string;
          const devConfirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`;
          return { awaitingConfirmation: true, email, devConfirmUrl };
        }
      } catch {
        // ignore
      }
    }
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to resend confirmation email.",
    };
  }
}
