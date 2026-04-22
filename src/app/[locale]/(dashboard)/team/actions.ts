"use server";

import {revalidatePath} from "next/cache";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {recalculateMeetingCosts} from "@/lib/cost-engine";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type TeamMember = {
  id: string;
  teamId: string;
  profileId: string | null;
  email: string;
  displayName: string;
  hourlyRate: number;
  status: "active" | "pending" | "invited";
  isExcluded: boolean;
  invitedAt: string | null;
  joinedAt: string | null;
  createdAt: string;
};

export type TeamData = {
  id: string;
  name: string;
  teamCode: string;
  managerName: string | null;
  managerEmail: string | null;
  isCurrentUserManager: boolean;
};

export type TeamActionState = {
  error?: string;
  success?: boolean;
  added?: number;
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function requireManager() {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) throw new Error("No team assigned");
  if (!profile.is_manager) throw new Error("Only managers can perform this action");

  return {user, profile, admin};
}

// ─────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────

export async function getTeamData(): Promise<TeamData | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return null;

  const {data: team} = await admin
    .from("teams")
    .select("id, name, team_code, manager_id")
    .eq("id", profile.team_id)
    .single();

  if (!team) return null;
  let managerName: string | null = null;
  let managerEmail: string | null = null;

  // Prefer explicit manager_id on the team if set
  if (team.manager_id) {
    const {data: managerProfile} = await admin
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", team.manager_id)
      .maybeSingle();
    if (managerProfile) {
      managerName =
        (managerProfile as any).display_name ??
        managerProfile.email ??
        null;
      managerEmail = managerProfile.email ?? null;
    }
  }

  // Fallback: any profile in the team marked as is_manager
  if (!managerName || !managerEmail) {
    const {data: managerProfile} = await admin
      .from("profiles")
      .select("id, display_name, email")
      .eq("team_id", profile.team_id)
      .eq("is_manager", true)
      .maybeSingle();
    if (managerProfile) {
      managerName =
        (managerProfile as any).display_name ??
        managerProfile.email ??
        managerName;
      managerEmail = managerProfile.email ?? managerEmail;
    }
  }

  const isCurrentUserManager = !!profile.is_manager;

  return {
    id: team.id,
    name: team.name,
    teamCode: team.team_code,
    managerName,
    managerEmail,
    isCurrentUserManager,
  };
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return [];

  const {data, error} = await admin
    .from("team_members")
    .select("*")
    .eq("team_id", profile.team_id)
    .order("created_at", {ascending: true});

  if (error || !data) return [];

  return data.map((m) => ({
    id: m.id,
    teamId: m.team_id,
    profileId: m.profile_id ?? null,
    email: m.email,
    displayName: m.display_name,
    hourlyRate: Number(m.hourly_rate),
    status: m.status as "active" | "pending" | "invited",
    isExcluded: m.is_excluded ?? false,
    invitedAt: m.invited_at ?? null,
    joinedAt: m.joined_at ?? null,
    createdAt: m.created_at,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────

export async function addTeamMember(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const hourlyRate = parseFloat(String(formData.get("hourlyRate") ?? "0"));

  if (!displayName) return {error: "Name is required."};
  if (!email || !/\S+@\S+\.\S+/.test(email)) return {error: "A valid email is required."};
  if (isNaN(hourlyRate) || hourlyRate < 0) return {error: "Hourly rate must be 0 or more."};

  try {
    const {profile, admin} = await requireManager();

    // Check if already exists
    const {data: existing} = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", profile.team_id)
      .eq("email", email)
      .maybeSingle();

    if (existing) return {error: "A member with this email already exists in the team."};

    // Check if email belongs to an existing app user (auto-link)
    const {data: existingProfile} = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const now = new Date().toISOString();

    const {error: insertError} = await admin.from("team_members").insert({
      team_id: profile.team_id,
      profile_id: existingProfile?.id ?? null,
      email,
      display_name: displayName,
      hourly_rate: hourlyRate,
      status: existingProfile ? "active" : "pending",
      joined_at: existingProfile ? now : null,
    });

    if (insertError) {
      console.error("addTeamMember error", insertError);
      return {error: insertError.message};
    }

    // Trigger cost recalculation so new member's meetings get priced
    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to add member."};
  }
}

// ─────────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────────

export async function updateTeamMember(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const hourlyRate = parseFloat(String(formData.get("hourlyRate") ?? "0"));

  if (!memberId) return {error: "Member ID is required."};
  if (!displayName) return {error: "Name is required."};
  if (isNaN(hourlyRate) || hourlyRate < 0) return {error: "Hourly rate must be 0 or more."};

  try {
    const {profile, admin} = await requireManager();

    const {error: updateError} = await admin
      .from("team_members")
      .update({display_name: displayName, hourly_rate: hourlyRate})
      .eq("id", memberId)
      .eq("team_id", profile.team_id);

    if (updateError) {
      console.error("updateTeamMember error", updateError);
      return {error: updateError.message};
    }

    // Recalculate costs because the rate changed
    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to update member."};
  }
}

// ─────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────

export async function removeTeamMember(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!memberId) return {error: "Member ID is required."};

  try {
    const {profile, admin} = await requireManager();

    const {error: deleteError} = await admin
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("team_id", profile.team_id);

    if (deleteError) {
      console.error("removeTeamMember error", deleteError);
      return {error: deleteError.message};
    }

    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to remove member."};
  }
}

// ─────────────────────────────────────────────────────────────────
// Batch create
// ─────────────────────────────────────────────────────────────────

export async function addMultipleTeamMembers(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const membersJson = String(formData.get("members") ?? "[]");
  let entries: Array<{name: string; email: string; rate: string}>;
  try {
    entries = JSON.parse(membersJson);
  } catch {
    return {error: "Invalid member data."};
  }

  if (!entries.length) return {error: "No members to add."};

  try {
    const {profile, admin} = await requireManager();
    let addedCount = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      const email = entry.email.trim().toLowerCase();
      const displayName = entry.name.trim();
      const hourlyRate = parseFloat(entry.rate) || 0;

      if (!displayName || !email || !/\S+@\S+\.\S+/.test(email)) continue;

      const {data: existing} = await admin
        .from("team_members")
        .select("id")
        .eq("team_id", profile.team_id)
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        errors.push(`${email} already exists`);
        continue;
      }

      const {data: existingProfile} = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      const now = new Date().toISOString();
      const {error: insertError} = await admin.from("team_members").insert({
        team_id: profile.team_id,
        profile_id: existingProfile?.id ?? null,
        email,
        display_name: displayName,
        hourly_rate: hourlyRate,
        status: existingProfile ? "active" : "pending",
        joined_at: existingProfile ? now : null,
      });

      if (insertError) {
        errors.push(`${email}: ${insertError.message}`);
      } else {
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await recalculateMeetingCosts(profile.team_id, admin);
      revalidatePath("/[locale]/(dashboard)/team", "page");
    }

    if (addedCount === 0) {
      return {error: errors.length ? errors.join("; ") : "No valid members to add."};
    }

    return {success: true, added: addedCount};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to add members."};
  }
}

// ─────────────────────────────────────────────────────────────────
// Set average rate for all members
// ─────────────────────────────────────────────────────────────────

export async function setAverageRateForAllMembers(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const rate = parseFloat(String(formData.get("averageRate") ?? "0"));
  if (isNaN(rate) || rate < 0) return {error: "Invalid hourly rate."};

  try {
    const {profile, admin} = await requireManager();

    const {error: updateError} = await admin
      .from("team_members")
      .update({hourly_rate: rate})
      .eq("team_id", profile.team_id);

    if (updateError) return {error: updateError.message};

    await recalculateMeetingCosts(profile.team_id, admin);
    revalidatePath("/[locale]/(dashboard)/team", "page");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to set rates."};
  }
}

// ─────────────────────────────────────────────────────────────────
// Toggle member exclusion from cost calculations
// ─────────────────────────────────────────────────────────────────

export async function toggleMemberExclusion(
  memberId: string,
  isExcluded: boolean,
): Promise<TeamActionState> {
  try {
    const {profile, admin} = await requireManager();

    const {error} = await admin
      .from("team_members")
      .update({is_excluded: isExcluded})
      .eq("id", memberId)
      .eq("team_id", profile.team_id);

    if (error) return {error: error.message};

    // Recalculate so meeting costs reflect the changed member set
    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    revalidatePath("/[locale]/(dashboard)/dashboard", "page");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Failed to update member."};
  }
}

// ─────────────────────────────────────────────────────────────────
// Recalculate costs on demand (callable from UI)
// ─────────────────────────────────────────────────────────────────

export async function triggerCostRecalculation(
  _prev: TeamActionState,
  _formData: FormData,
): Promise<TeamActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) return {error: "Unauthorized"};

    const admin = createSupabaseAdminClient();
    const {data: profile} = await admin
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.team_id) return {error: "No team assigned"};

    await recalculateMeetingCosts(profile.team_id, admin);
    revalidatePath("/[locale]/(dashboard)/dashboard", "page");
    return {success: true};
  } catch (err) {
    return {error: err instanceof Error ? err.message : "Recalculation failed."};
  }
}
