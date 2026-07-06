import type {SupabaseClient} from "@supabase/supabase-js";

import {syncCalendarForProfile} from "@/lib/calendar-sync";

export async function syncAfterSchedulingMutation(
  admin: SupabaseClient,
  userId: string,
  teamId: string,
  microsoftRefreshToken: string,
) {
  return syncCalendarForProfile(admin, {
    id: userId,
    team_id: teamId,
    microsoft_refresh_token: microsoftRefreshToken,
  });
}

export function graphHttpErrorStatus(err: unknown): number | undefined {
  return (err as {status?: number}).status;
}
