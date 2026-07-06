import type {SupabaseClient} from "@supabase/supabase-js";

import {
  DEFAULT_WORKING_HOURS,
  normalizeWorkingHoursConfig,
  type WorkingHoursConfig,
} from "./working-hours";

type TeamSchedulingRow = {
  scheduling_timezone: string | null;
  scheduling_work_start: string | null;
  scheduling_work_end: string | null;
  scheduling_work_days: number[] | null;
};

export async function loadTeamSchedulingSettings(
  admin: SupabaseClient,
  teamId: string,
): Promise<WorkingHoursConfig> {
  const {data, error} = await admin
    .from("teams")
    .select(
      "scheduling_timezone, scheduling_work_start, scheduling_work_end, scheduling_work_days",
    )
    .eq("id", teamId)
    .maybeSingle();

  if (error || !data) {
    console.error("loadTeamSchedulingSettings:", error?.message);
    return DEFAULT_WORKING_HOURS;
  }

  const row = data as TeamSchedulingRow;
  return normalizeWorkingHoursConfig({
    timezone: row.scheduling_timezone ?? undefined,
    workStart: row.scheduling_work_start ?? undefined,
    workEnd: row.scheduling_work_end ?? undefined,
    workDays: row.scheduling_work_days ?? undefined,
  });
}
