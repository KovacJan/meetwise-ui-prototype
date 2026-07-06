"use server";

import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";

export type JoinTeamResult =
  | {success: true}
  | {success: false; error: string};

/**
 * Joins the authenticated user to the team identified by `teamCode`.
 * Also links their profile_id in team_members if the manager pre-added them by email.
 */
export async function joinTeamByCode(teamCode: string): Promise<JoinTeamResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) return {success: false, error: "Not authenticated."};

    const admin = createSupabaseAdminClient();

    const {data: team, error: teamError} = await admin
      .from("teams")
      .select("id")
      .eq("team_code", teamCode.trim().toUpperCase())
      .single();

    if (teamError || !team) {
      return {success: false, error: "Team not found. Check the team code and try again."};
    }

    // Fetch the current profile before modifying it
    const {data: existingProfile} = await admin
      .from("profiles")
      .select("email, team_id, is_manager, outlook_connected")
      .eq("id", user.id)
      .single();

    // If the user is already the manager of this exact team, don't overwrite their role
    const alreadyManager =
      existingProfile?.team_id === team.id && existingProfile?.is_manager === true;

    const {error: updateError} = await admin
      .from("profiles")
      .update({
        team_id: team.id,
        is_manager: alreadyManager ? true : false,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("joinTeamByCode update error", updateError);
      return {success: false, error: updateError.message};
    }

    // Link profile_id in team_members if the manager pre-added this email
    if (existingProfile?.email) {
      const now = new Date().toISOString();
      await admin
        .from("team_members")
        .update({profile_id: user.id, status: "active", joined_at: now})
        .eq("team_id", team.id)
        .eq("email", existingProfile.email.toLowerCase().trim())
        .is("profile_id", null); // Only update un-linked rows
    }

    return {success: true};
  } catch (err) {
    console.error("joinTeamByCode error", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}

export type TeamPreview = {
  name: string;
  teamCode: string;
} | null;

/** Fetches basic team info from the team code for display on the join landing. */
export async function getTeamPreview(teamCode: string): Promise<TeamPreview> {
  try {
    const admin = createSupabaseAdminClient();
    const {data} = await admin
      .from("teams")
      .select("name, team_code")
      .eq("team_code", teamCode.trim().toUpperCase())
      .single();

    if (!data) return null;
    return {name: data.name, teamCode: data.team_code};
  } catch {
    return null;
  }
}

export type ConfirmJoinResult =
  | {success: true; redirectTo: string}
  | {success: false; error: string};

/**
 * Server action that handles the confirmed join from the UI form.
 * Returns the destination URL so the client can show a toast before navigating.
 */
export async function confirmJoinTeam(
  locale: string,
  teamCode: string,
): Promise<ConfirmJoinResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) return {success: false, error: "Not authenticated."};

    const admin = createSupabaseAdminClient();

    const {data: team, error: teamError} = await admin
      .from("teams")
      .select("id")
      .eq("team_code", teamCode.trim().toUpperCase())
      .single();

    if (teamError || !team) {
      return {success: false, error: "Team not found. Check the team code and try again."};
    }

    const {data: existingProfile} = await admin
      .from("profiles")
      .select("email, team_id, is_manager, outlook_connected")
      .eq("id", user.id)
      .single();

    const alreadyManager =
      existingProfile?.team_id === team.id && existingProfile?.is_manager === true;

    const {error: updateError} = await admin
      .from("profiles")
      .update({
        team_id: team.id,
        is_manager: alreadyManager ? true : false,
      })
      .eq("id", user.id);

    if (updateError) {
      return {success: false, error: updateError.message};
    }

    if (existingProfile?.email) {
      const now = new Date().toISOString();
      await admin
        .from("team_members")
        .update({profile_id: user.id, status: "active", joined_at: now})
        .eq("team_id", team.id)
        .eq("email", existingProfile.email.toLowerCase().trim())
        .is("profile_id", null);
    }

    // Smart redirect: skip sync if calendar is already connected
    const calendarConnected = existingProfile?.outlook_connected === true;
    const redirectTo = calendarConnected ? `/${locale}/dashboard` : `/${locale}/sync`;

    return {success: true, redirectTo};
  } catch (err) {
    console.error("confirmJoinTeam error", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}
