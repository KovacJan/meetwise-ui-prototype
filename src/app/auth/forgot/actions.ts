"use server";

import {createSupabaseServerClient} from "@/app/lib/supabase-server";

export type ForgotState = {
  error?: string;
  message?: string;
};

export async function requestPasswordReset(
  _prevState: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  try {
    const email = String(formData.get("email") ?? "");

    if (!email) {
      return {error: "Email is required."};
    }

    const supabase = await createSupabaseServerClient();

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/reset`;

    const {error} = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return {error: error.message};
    }

    return {
      message: "We have sent you an email with a link to reset your password.",
    };
  } catch (err) {
    console.error("Forgot password error", err);
    const message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred while requesting a reset link.";
    return {error: message};
  }
}

