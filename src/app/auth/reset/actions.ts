"use server";

import {createSupabaseServerClient} from "@/app/lib/supabase-server";

export type ResetState = {
  error?: string;
  message?: string;
};

export async function resetPassword(
  _prevState: ResetState,
  formData: FormData,
): Promise<ResetState> {
  try {
    const password = String(formData.get("password") ?? "");
    const code = String(formData.get("code") ?? "");

    if (!password) {
      return {error: "Password is required."};
    }
    if (!code) {
      return {
        error:
          "Reset link is invalid or has expired. Please request a new password reset email.",
      };
    }

    const supabase = await createSupabaseServerClient();
    // Exchange the recovery code from the URL for a session
    const {error: exchangeError} = await supabase.auth.exchangeCodeForSession(
      code,
    );
    if (exchangeError) {
      return {
        error:
          "Reset link is invalid or has expired. Please request a new password reset email.",
      };
    }

    const {error} = await supabase.auth.updateUser({password});

    if (error) {
      return {error: error.message};
    }

    return {message: "Your password has been updated. You can now sign in."};
  } catch (err) {
    console.error("Reset password error", err);
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred while updating your password.";
    return {error: message};
  }
}

