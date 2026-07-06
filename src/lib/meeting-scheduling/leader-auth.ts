import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/app/lib/supabase-server";
import { decryptToken } from "@/lib/token-encryption";
import { refreshCalendarAccessToken } from "@/lib/microsoft-graph";

export type SchedulingLeaderContext = {
  userId: string;
  teamId: string;
  calendarWriteEnabled: boolean;
  accessToken: string;
  microsoftRefreshToken: string;
  admin: ReturnType<typeof createSupabaseAdminClient>;
};

export type SchedulingLeaderError = {
  status: number;
  code?: string;
  error: string;
};

export async function requireSchedulingLeader(): Promise<
  SchedulingLeaderContext | SchedulingLeaderError
> {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 401, error: "Unauthorized" };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, team_id, is_manager, outlook_connected, microsoft_refresh_token, calendar_write_enabled",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) {
    return { status: 400, code: "NO_TEAM", error: "No team assigned" };
  }

  if (!profile.is_manager) {
    return {
      status: 403,
      code: "LEADER_ONLY",
      error: "Only team leaders can schedule meetings",
    };
  }

  if (!profile.outlook_connected || !profile.microsoft_refresh_token) {
    return {
      status: 400,
      code: "OUTLOOK_NOT_CONNECTED",
      error: "Outlook is not connected",
    };
  }

  try {
    const refreshToken = decryptToken(profile.microsoft_refresh_token);
    const tokenResponse = await refreshCalendarAccessToken(refreshToken, {
      preferWrite: true,
    });
    return {
      userId: user.id,
      teamId: profile.team_id,
      calendarWriteEnabled:
        profile.calendar_write_enabled === true &&
        tokenResponse.scope.toLowerCase().includes("calendars.readwrite"),
      accessToken: tokenResponse.access_token,
      microsoftRefreshToken: profile.microsoft_refresh_token,
      admin,
    };
  } catch {
    return {
      status: 502,
      code: "OUTLOOK_TOKEN_FAILED",
      error: "Could not refresh Outlook access token",
    };
  }
}

export function isSchedulingLeaderError(
  value: SchedulingLeaderContext | SchedulingLeaderError,
): value is SchedulingLeaderError {
  return "status" in value && "error" in value && !("accessToken" in value);
}
