"use server";

import {revalidatePath} from "next/cache";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";

export type ProfileActionState = {
  error?: string;
  success?: boolean;
};

export type PasswordActionState = {
  error?: string;
  success?: boolean;
};

export type ClearCalendarState = {
  error?: string;
  success?: boolean;
  deletedCount?: number;
};

export type PlanActionState = {
  error?: string;
  success?: boolean;
};

export type DisconnectCalendarState = {
  error?: string;
  success?: boolean;
};

export async function changePassword(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const current = String(formData.get("currentPassword") ?? "").trim();
  const next = String(formData.get("newPassword") ?? "").trim();
  const confirm = String(formData.get("confirmPassword") ?? "").trim();

  if (!current) return {error: "Current password is required."};
  if (!next) return {error: "New password is required."};
  if (next.length < 8) return {error: "New password must be at least 8 characters."};
  if (next !== confirm) return {error: "Passwords do not match."};
  if (current === next) return {error: "New password must differ from the current one."};

  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}, error: userErr} = await supabase.auth.getUser();
    if (userErr || !user?.email) return {error: "Not authenticated."};

    // Re-authenticate with current password first
    const {error: signInErr} = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInErr) return {error: "Current password is incorrect."};

    const {error: updateErr} = await supabase.auth.updateUser({password: next});
    if (updateErr) return {error: updateErr.message};

    revalidatePath("/", "layout");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to update password."};
  }
}

export async function updateDisplayName(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return {error: "Name cannot be empty."};

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) return {error: "Not authenticated."};

    const admin = createSupabaseAdminClient();
    const {error} = await admin
      .from("profiles")
      .update({display_name: displayName})
      .eq("id", user.id);

    if (error) return {error: error.message};

    revalidatePath("/", "layout");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to update name."};
  }
}

export async function clearTeamCalendar(
  _prev: ClearCalendarState,
  _formData: FormData,
): Promise<ClearCalendarState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) return {error: "Not authenticated."};

    const admin = createSupabaseAdminClient();
    const {data: profile, error: profileError} = await admin
      .from("profiles")
      .select("team_id, is_manager")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.team_id) {
      return {error: "No team found for user."};
    }

    if (!profile.is_manager) {
      return {error: "Only team managers can clear calendar items."};
    }

    const {error: deleteError, count} = await admin
      .from("meetings")
      .delete({count: "exact"})
      .eq("team_id", profile.team_id);

    if (deleteError) {
      return {error: deleteError.message};
    }

    revalidatePath("/", "layout");
    return {success: true, deletedCount: count ?? 0};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to clear calendar items.",
    };
  }
}

export async function disconnectMicrosoftCalendar(
  _prev: DisconnectCalendarState,
  _formData: FormData,
): Promise<DisconnectCalendarState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) return {error: "Not authenticated."};

    const admin = createSupabaseAdminClient();
    const {error} = await admin
      .from("profiles")
      .update({
        microsoft_refresh_token: null,
        outlook_connected: false,
      })
      .eq("id", user.id);

    if (error) return {error: error.message};

    revalidatePath("/", "layout");
    return {success: true};
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to disconnect Microsoft calendar.",
    };
  }
}

export async function downgradePlanToFree(
  _prev: PlanActionState,
  _formData: FormData,
): Promise<PlanActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) return {error: "Not authenticated."};

    const admin = createSupabaseAdminClient();
    const {data: profile, error: profileError} = await admin
      .from("profiles")
      .select("team_id, is_manager")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.team_id) {
      return {error: "No team found for user."};
    }

    if (!profile.is_manager) {
      return {error: "Only team managers can change the plan."};
    }

    const {data: team, error: teamError} = await admin
      .from("teams")
      .select("plan")
      .eq("id", profile.team_id)
      .maybeSingle();

    if (teamError || !team) {
      return {error: "Team not found."};
    }

    if (team.plan !== "pro") {
      return {success: true};
    }

    const {error: updateError} = await admin
      .from("teams")
      .update({plan: "free"})
      .eq("id", profile.team_id);

    if (updateError) {
      return {error: updateError.message};
    }

    revalidatePath("/", "layout");
    return {success: true};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to change plan.",
    };
  }
}
