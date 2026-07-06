export type RecurrenceEditScope = "occurrence" | "series" | "following";

const VALID_SCOPES = new Set<RecurrenceEditScope>([
  "occurrence",
  "series",
  "following",
]);

export function parseRecurrenceEditScope(
  raw: unknown,
  isRecurring: boolean,
): RecurrenceEditScope {
  if (!isRecurring) return "occurrence";
  if (typeof raw !== "string" || !VALID_SCOPES.has(raw as RecurrenceEditScope)) {
    return "occurrence";
  }
  return raw as RecurrenceEditScope;
}

export function availableRecurrenceScopes(
  isRecurring: boolean,
  hasSeriesMaster: boolean,
): RecurrenceEditScope[] {
  if (!isRecurring) return ["occurrence"];
  if (!hasSeriesMaster) return ["occurrence"];
  return ["occurrence", "following", "series"];
}
