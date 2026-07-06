import type {SupabaseClient} from "@supabase/supabase-js";

export type SchedulingAuditAction =
  | "find_slots"
  | "create"
  | "update"
  | "cancel";

export type SchedulingAuditInput = {
  teamId: string;
  actorId: string;
  action: SchedulingAuditAction;
  occurrenceId?: string | null;
  outlookEventId?: string | null;
  scope?: string | null;
  payload?: Record<string, unknown> | null;
  result?: "success" | "error";
  errorMessage?: string | null;
};

export async function logSchedulingAudit(
  admin: SupabaseClient,
  input: SchedulingAuditInput,
): Promise<void> {
  const {error} = await admin.from("meeting_scheduling_audit").insert({
    team_id: input.teamId,
    actor_id: input.actorId,
    action: input.action,
    occurrence_id: input.occurrenceId ?? null,
    outlook_event_id: input.outlookEventId ?? null,
    scope: input.scope ?? null,
    payload: input.payload ?? null,
    result: input.result ?? "success",
    error_message: input.errorMessage ?? null,
  });

  if (error) {
    console.error("logSchedulingAudit:", error.message);
  }
}
