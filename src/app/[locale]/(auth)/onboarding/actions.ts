"use server";

import type {SupabaseClient} from "@supabase/supabase-js";
import {redirect} from "next/navigation";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";

export type OnboardingState = {
  error?: string;
};

/**
 * Verifies the current session and returns (or creates) the user's profile.
 *
 * Auth check uses the session-aware server client.
 * DB reads/writes use the admin (service-role) client so that Row Level Security
 * never blocks trusted server-action code.
 */
export async function ensureProfile(supabase: SupabaseClient) {
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const admin = createSupabaseAdminClient();

  const {data: existing} = await admin
    .from("profiles")
    .select("id, email, team_id, is_manager, locale, outlook_connected")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return existing;

  const {data, error} = await admin
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? "",
      team_id: null,
      is_manager: false,
      locale: "en",
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("ensureProfile insert error", error);
    throw new Error(`Failed to create profile: ${error?.message ?? "unknown error"}`);
  }

  return data;
}

export async function createTeam(
  locale: string,
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("teamName") ?? "").trim();

  if (!name) {
    return {error: "Please enter a team name."};
  }

  try {
    const supabase = await createSupabaseServerClient();
    const profile = await ensureProfile(supabase);

    const admin = createSupabaseAdminClient();
    const teamCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const {data: team, error: teamError} = await admin
      .from("teams")
      .insert({
        name,
        manager_id: profile.id,
        hourly_rate: 60,
        team_code: teamCode,
        plan: "free",
      })
      .select("id")
      .single();

    if (teamError || !team) {
      console.error("createTeam insert error", teamError);
      return {error: teamError?.message ?? "Failed to create team. Please try again."};
    }

    const {error: updateError} = await admin
      .from("profiles")
      .update({team_id: team.id, is_manager: true})
      .eq("id", profile.id);

    if (updateError) {
      console.error("createTeam profile update error", updateError);
      return {error: updateError.message ?? "Failed to link profile to team."};
    }

    // Auto-add manager as the first team_member (active, no pending invite)
    if (profile.email) {
      await admin.from("team_members").upsert(
        {
          team_id: team.id,
          profile_id: profile.id,
          email: profile.email.toLowerCase().trim(),
          display_name: profile.email.split("@")[0],
          hourly_rate: 0,
          status: "active",
          joined_at: new Date().toISOString(),
        },
        {onConflict: "team_id,email"},
      );
    }
  } catch (err) {
    console.error("Onboarding createTeam error", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while creating your team.",
    };
  }

  // After creating a team, send manager to the calendar sync step
  redirect(`/${locale}/sync`);
}

export async function joinTeam(
  locale: string,
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const teamCode = String(formData.get("teamCode") ?? "").trim().toUpperCase();

  if (!teamCode) {
    return {error: "Please enter a team code."};
  }

  try {
    const supabase = await createSupabaseServerClient();
    const profile = await ensureProfile(supabase);

    const admin = createSupabaseAdminClient();

    const {data: team, error: teamError} = await admin
      .from("teams")
      .select("id")
      .eq("team_code", teamCode)
      .single();

    if (teamError || !team) {
      return {error: "We couldn't find a team with that code."};
    }

    const {error: updateError} = await admin
      .from("profiles")
      .update({team_id: team.id, is_manager: false})
      .eq("id", profile.id);

    if (updateError) {
      console.error("joinTeam profile update error", updateError);
      return {
        error: updateError.message ?? "Failed to join the team. Please check the code or try again later.",
      };
    }

    // Auto-link profile in team_members if manager pre-added this email
    if (profile.email) {
      const now = new Date().toISOString();
      await admin
        .from("team_members")
        .update({profile_id: profile.id, status: "active", joined_at: now})
        .eq("team_id", team.id)
        .eq("email", profile.email.toLowerCase().trim())
        .is("profile_id", null);
    }
  } catch (err) {
    console.error("Onboarding joinTeam error", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while joining the team.",
    };
  }

  // After joining a team, send member to the calendar sync step
  redirect(`/${locale}/sync`);
}

export async function skipOnboarding(
  locale: string,
  _prev: OnboardingState,
  _formData: FormData,
): Promise<OnboardingState> {
  try {
    const supabase = await createSupabaseServerClient();
    await ensureProfile(supabase);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not proceed. Please try signing in again.",
    };
  }
  redirect(`/${locale}/dashboard`);
}
