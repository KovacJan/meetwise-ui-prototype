"use server";

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import { recalculateMeetingCosts } from "@/lib/cost-engine";
import { syncCalendarForProfile } from "@/lib/calendar-sync";

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
  isTeamLead: boolean;
  isPrimaryLead: boolean;
  outlookConnected: boolean;
  lastCalendarSyncAt: string | null;
  lastCalendarSyncStatus: "success" | "failed" | null;
  lastCalendarSyncError: string | null;
};

export type TeamLead = {
  profileId: string;
  name: string;
  email: string;
  isPrimary: boolean;
};

export type TeamData = {
  id: string;
  name: string;
  teamCode: string;
  managerName: string | null;
  managerEmail: string | null;
  teamLeads: TeamLead[];
  isCurrentUserManager: boolean;
  isPrimaryOwner: boolean;
  primaryOwnerId: string | null;
};

export type TeamActionState = {
  error?: string;
  success?: boolean;
  added?: number;
  synced?: number;
  total?: number;
  deleted?: number;
  lastSyncAt?: string | null;
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function requireManager() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) throw new Error("No team assigned");
  if (!profile.is_manager)
    throw new Error("Only managers can perform this action");

  return { user, profile, admin };
}

async function requirePrimaryOwner() {
  const ctx = await requireManager();
  const { data: team } = await ctx.admin
    .from("teams")
    .select("manager_id")
    .eq("id", ctx.profile.team_id)
    .single();

  if (!team?.manager_id || team.manager_id !== ctx.user.id) {
    throw new Error("Only the primary team lead can manage lead roles.");
  }

  return { ...ctx, team };
}

// ─────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────

export async function getTeamData(): Promise<TeamData | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return null;

  const { data: team } = await admin
    .from("teams")
    .select("id, name, team_code, manager_id")
    .eq("id", profile.team_id)
    .single();

  if (!team) return null;

  const { data: leadProfiles } = await admin
    .from("profiles")
    .select("id, display_name, email")
    .eq("team_id", profile.team_id)
    .eq("is_manager", true);

  const teamLeads: TeamLead[] = (leadProfiles ?? [])
    .map((p) => ({
      profileId: p.id,
      name: (p as { display_name?: string | null }).display_name ?? p.email,
      email: p.email,
      isPrimary: p.id === team.manager_id,
    }))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const primaryLead =
    teamLeads.find((l) => l.isPrimary) ?? teamLeads[0] ?? null;
  const managerName = primaryLead?.name ?? null;
  const managerEmail = primaryLead?.email ?? null;

  const isCurrentUserManager = !!profile.is_manager;
  const isPrimaryOwner = team.manager_id === user.id;

  return {
    id: team.id,
    name: team.name,
    teamCode: team.team_code,
    managerName,
    managerEmail,
    teamLeads,
    isCurrentUserManager,
    isPrimaryOwner,
    primaryOwnerId: team.manager_id ?? null,
  };
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("team_id, is_manager")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) return [];

  const { data, error } = await admin
    .from("team_members")
    .select("*")
    .eq("team_id", profile.team_id)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const { data: team } = await admin
    .from("teams")
    .select("manager_id")
    .eq("id", profile.team_id)
    .single();

  const { data: leadProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .eq("team_id", profile.team_id)
    .eq("is_manager", true);

  const linkedProfileIds = data
    .map((m) => m.profile_id)
    .filter((id): id is string => !!id);

  const profileSyncMeta = new Map<
    string,
    {
      outlook_connected: boolean;
      last_calendar_sync_at: string | null;
      last_calendar_sync_status: "success" | "failed" | null;
      last_calendar_sync_error: string | null;
    }
  >();

  if (linkedProfileIds.length > 0) {
    const { data: profilesMeta } = await admin
      .from("profiles")
      .select(
        "id, outlook_connected, last_calendar_sync_at, last_calendar_sync_status, last_calendar_sync_error",
      )
      .in("id", linkedProfileIds);

    for (const p of profilesMeta ?? []) {
      profileSyncMeta.set(p.id, {
        outlook_connected: p.outlook_connected ?? false,
        last_calendar_sync_at: p.last_calendar_sync_at ?? null,
        last_calendar_sync_status:
          (p.last_calendar_sync_status as "success" | "failed" | null) ?? null,
        last_calendar_sync_error: p.last_calendar_sync_error ?? null,
      });
    }
  }

  const leadProfileIds = new Set((leadProfiles ?? []).map((p) => p.id));
  const leadEmails = new Set(
    (leadProfiles ?? []).map((p) => p.email.toLowerCase()),
  );
  const primaryOwnerId = team?.manager_id ?? null;

  const canSeeRates = profile.is_manager === true;

  return data.map((m) => ({
    id: m.id,
    teamId: m.team_id,
    profileId: m.profile_id ?? null,
    email: m.email,
    displayName: m.display_name,
    // Server-side redaction: non-managers never receive real hourly rates.
    hourlyRate: canSeeRates ? Number(m.hourly_rate) : 0,
    status: m.status as "active" | "pending" | "invited",
    isExcluded: m.is_excluded ?? false,
    invitedAt: m.invited_at ?? null,
    joinedAt: m.joined_at ?? null,
    createdAt: m.created_at,
    isTeamLead:
      (!!m.profile_id && leadProfileIds.has(m.profile_id)) ||
      leadEmails.has(m.email.toLowerCase()),
    isPrimaryLead: !!m.profile_id && m.profile_id === primaryOwnerId,
    outlookConnected: m.profile_id
      ? (profileSyncMeta.get(m.profile_id)?.outlook_connected ?? false)
      : false,
    lastCalendarSyncAt: m.profile_id
      ? (profileSyncMeta.get(m.profile_id)?.last_calendar_sync_at ?? null)
      : null,
    lastCalendarSyncStatus: m.profile_id
      ? (profileSyncMeta.get(m.profile_id)?.last_calendar_sync_status ?? null)
      : null,
    lastCalendarSyncError: m.profile_id
      ? (profileSyncMeta.get(m.profile_id)?.last_calendar_sync_error ?? null)
      : null,
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
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const hourlyRate = parseFloat(String(formData.get("hourlyRate") ?? "0"));

  if (!displayName) return { error: "Name is required." };
  if (!email || !/\S+@\S+\.\S+/.test(email))
    return { error: "A valid email is required." };
  if (isNaN(hourlyRate) || hourlyRate < 0)
    return { error: "Hourly rate must be 0 or more." };

  try {
    const { profile, admin } = await requireManager();

    // Check if already exists
    const { data: existing } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", profile.team_id)
      .eq("email", email)
      .maybeSingle();

    if (existing)
      return { error: "A member with this email already exists in the team." };

    // Check if email belongs to an existing app user (auto-link)
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const now = new Date().toISOString();

    const { error: insertError } = await admin.from("team_members").insert({
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
      return { error: insertError.message };
    }

    // Trigger cost recalculation so new member's meetings get priced
    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to add member.",
    };
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

  if (!memberId) return { error: "Member ID is required." };
  if (!displayName) return { error: "Name is required." };
  if (isNaN(hourlyRate) || hourlyRate < 0)
    return { error: "Hourly rate must be 0 or more." };

  try {
    const { profile, admin } = await requireManager();

    const { error: updateError } = await admin
      .from("team_members")
      .update({ display_name: displayName, hourly_rate: hourlyRate })
      .eq("id", memberId)
      .eq("team_id", profile.team_id);

    if (updateError) {
      console.error("updateTeamMember error", updateError);
      return { error: updateError.message };
    }

    // Recalculate costs because the rate changed
    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update member.",
    };
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
  if (!memberId) return { error: "Member ID is required." };

  try {
    const { profile, admin } = await requireManager();

    const { error: deleteError } = await admin
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("team_id", profile.team_id);

    if (deleteError) {
      console.error("removeTeamMember error", deleteError);
      return { error: deleteError.message };
    }

    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to remove member.",
    };
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
  let entries: Array<{ name: string; email: string; rate: string }>;
  try {
    entries = JSON.parse(membersJson);
  } catch {
    return { error: "Invalid member data." };
  }

  if (!entries.length) return { error: "No members to add." };

  try {
    const { profile, admin } = await requireManager();
    let addedCount = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      const email = entry.email.trim().toLowerCase();
      const displayName = entry.name.trim();
      const hourlyRate = parseFloat(entry.rate) || 0;

      if (!displayName || !email || !/\S+@\S+\.\S+/.test(email)) continue;

      const { data: existing } = await admin
        .from("team_members")
        .select("id")
        .eq("team_id", profile.team_id)
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        errors.push(`${email} already exists`);
        continue;
      }

      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      const now = new Date().toISOString();
      const { error: insertError } = await admin.from("team_members").insert({
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
      return {
        error: errors.length ? errors.join("; ") : "No valid members to add.",
      };
    }

    return { success: true, added: addedCount };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to add members.",
    };
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
  if (isNaN(rate) || rate < 0) return { error: "Invalid hourly rate." };

  try {
    const { profile, admin } = await requireManager();

    const { error: updateError } = await admin
      .from("team_members")
      .update({ hourly_rate: rate })
      .eq("team_id", profile.team_id);

    if (updateError) return { error: updateError.message };

    await recalculateMeetingCosts(profile.team_id, admin);
    revalidatePath("/[locale]/(dashboard)/team", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to set rates.",
    };
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
    const { profile, admin } = await requireManager();

    const { error } = await admin
      .from("team_members")
      .update({ is_excluded: isExcluded })
      .eq("id", memberId)
      .eq("team_id", profile.team_id);

    if (error) return { error: error.message };

    // Recalculate so meeting costs reflect the changed member set
    await recalculateMeetingCosts(profile.team_id, admin);

    revalidatePath("/[locale]/(dashboard)/team", "page");
    revalidatePath("/[locale]/(dashboard)/dashboard", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update member.",
    };
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
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.team_id) return { error: "No team assigned" };

    await recalculateMeetingCosts(profile.team_id, admin);
    revalidatePath("/[locale]/(dashboard)/dashboard", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Recalculation failed.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Team lead roles (primary owner only)
// ─────────────────────────────────────────────────────────────────

export async function promoteTeamLead(
  profileId: string,
): Promise<TeamActionState> {
  if (!profileId?.trim()) return { error: "Profile ID is required." };

  try {
    const { profile, admin } = await requirePrimaryOwner();

    const { data: target } = await admin
      .from("profiles")
      .select("id, team_id, is_manager")
      .eq("id", profileId)
      .maybeSingle();

    if (!target || target.team_id !== profile.team_id) {
      return { error: "This user is not a member of your team." };
    }
    if (target.is_manager) {
      return { error: "This member is already a team lead." };
    }

    const { data: memberRow } = await admin
      .from("team_members")
      .select("id, status, profile_id")
      .eq("team_id", profile.team_id)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (!memberRow || memberRow.status !== "active") {
      return {
        error:
          "Only active members who have joined MeetWise can become team leads.",
      };
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_manager: true })
      .eq("id", profileId)
      .eq("team_id", profile.team_id);

    if (updateError) return { error: updateError.message };

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to promote member.",
    };
  }
}

export async function demoteTeamLead(
  profileId: string,
): Promise<TeamActionState> {
  if (!profileId?.trim()) return { error: "Profile ID is required." };

  try {
    const { profile, admin, team } = await requirePrimaryOwner();

    if (profileId === team.manager_id) {
      return { error: "The primary team lead cannot be demoted." };
    }

    const { data: target } = await admin
      .from("profiles")
      .select("id, team_id, is_manager")
      .eq("id", profileId)
      .maybeSingle();

    if (!target || target.team_id !== profile.team_id) {
      return { error: "This user is not a member of your team." };
    }
    if (!target.is_manager) {
      return { error: "This member is not a team lead." };
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_manager: false })
      .eq("id", profileId)
      .eq("team_id", profile.team_id);

    if (updateError) return { error: updateError.message };

    revalidatePath("/[locale]/(dashboard)/team", "page");
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to demote team lead.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Sync one member calendar (team lead only)
// ─────────────────────────────────────────────────────────────────

export async function syncTeamMemberCalendar(
  memberId: string,
): Promise<TeamActionState> {
  if (!memberId?.trim()) return { error: "Member ID is required." };

  const persistMemberSyncFailure = async (
    admin: ReturnType<typeof createSupabaseAdminClient>,
    profileId: string,
    message: string,
  ) => {
    await admin
      .from("profiles")
      .update({
        last_calendar_sync_status: "failed",
        last_calendar_sync_error: message,
      })
      .eq("id", profileId);
  };

  try {
    const { profile, admin } = await requireManager();

    const { data: member } = await admin
      .from("team_members")
      .select("id, profile_id, email")
      .eq("id", memberId)
      .eq("team_id", profile.team_id)
      .maybeSingle();

    if (!member) {
      return { error: "Member not found in your team." };
    }

    if (!member.profile_id) {
      return {
        error: "Member has not joined MeetWise yet.",
      };
    }

    const { data: targetProfile } = await admin
      .from("profiles")
      .select(
        "id, team_id, microsoft_refresh_token, outlook_connected, last_calendar_sync_at",
      )
      .eq("id", member.profile_id)
      .maybeSingle();

    if (!targetProfile || targetProfile.team_id !== profile.team_id) {
      if (member.profile_id) {
        await persistMemberSyncFailure(
          admin,
          member.profile_id,
          "Member profile is not part of your team.",
        );
      }
      return { error: "Member profile is not part of your team." };
    }

    if (
      !targetProfile.outlook_connected ||
      !targetProfile.microsoft_refresh_token
    ) {
      await persistMemberSyncFailure(
        admin,
        targetProfile.id,
        "Member does not have a connected Outlook calendar.",
      );
      return {
        error: "Member does not have a connected Outlook calendar.",
      };
    }

    const result = await syncCalendarForProfile(admin, {
      id: targetProfile.id,
      team_id: targetProfile.team_id,
      microsoft_refresh_token: targetProfile.microsoft_refresh_token,
    });

    const { data: refreshedProfile } = await admin
      .from("profiles")
      .select(
        "last_calendar_sync_at, last_calendar_sync_status, last_calendar_sync_error",
      )
      .eq("id", targetProfile.id)
      .maybeSingle();

    if (refreshedProfile?.last_calendar_sync_status === "failed") {
      return {
        error:
          refreshedProfile.last_calendar_sync_error ??
          "Member calendar sync failed.",
      };
    }

    revalidatePath("/[locale]/(dashboard)/team", "page");
    revalidatePath("/[locale]/(dashboard)/dashboard", "page");
    revalidatePath("/[locale]/(dashboard)/meetings", "page");

    return {
      success: true,
      synced: result.synced,
      total: result.total,
      deleted: result.deleted,
      lastSyncAt: refreshedProfile?.last_calendar_sync_at ?? null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to sync member calendar.";

    try {
      const { admin } = await requireManager();
      const { data: member } = await admin
        .from("team_members")
        .select("profile_id")
        .eq("id", memberId)
        .maybeSingle();

      if (member?.profile_id) {
        await persistMemberSyncFailure(admin, member.profile_id, message);
      }
    } catch {
      // Ignore persistence failures in error path.
    }

    return {
      error: message,
    };
  }
}
