export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";
export type RecurrenceEndType = "date" | "count";

export type MeetingRecurrenceInput = {
  frequency: RecurrenceFrequency;
  daysOfWeek: string[];
  endType: RecurrenceEndType;
  endDate?: string;
  occurrenceCount?: number;
};

export type GraphRecurrence = {
  pattern: Record<string, unknown>;
  range: Record<string, unknown>;
};

const GRAPH_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const VALID_DAYS = new Set<string>(GRAPH_DAYS);

export function graphDayFromIso(iso: string): string {
  return GRAPH_DAYS[new Date(iso).getUTCDay()] ?? "monday";
}

export function graphStartDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function normalizeDaysOfWeek(days: string[] | undefined, fallbackIso: string): string[] {
  const normalized = [...new Set((days ?? []).map((d) => d.trim().toLowerCase()))].filter(
    (d) => VALID_DAYS.has(d),
  );
  if (normalized.length > 0) return normalized;
  return [graphDayFromIso(fallbackIso)];
}

export function parseMeetingRecurrenceInput(
  raw: unknown,
  startIso: string,
): {ok: true; value: MeetingRecurrenceInput} | {ok: false; error: string} {
  if (raw == null) {
    return {ok: false, error: "Missing recurrence settings"};
  }
  if (typeof raw !== "object") {
    return {ok: false, error: "Invalid recurrence settings"};
  }

  const obj = raw as Record<string, unknown>;
  const frequency = obj.frequency;
  if (frequency !== "weekly" && frequency !== "biweekly" && frequency !== "monthly") {
    return {ok: false, error: "Invalid recurrence frequency"};
  }

  const endType = obj.endType;
  if (endType !== "date" && endType !== "count") {
    return {ok: false, error: "Invalid recurrence end type"};
  }

  const daysOfWeek = normalizeDaysOfWeek(
    Array.isArray(obj.daysOfWeek)
      ? obj.daysOfWeek.filter((d): d is string => typeof d === "string")
      : undefined,
    startIso,
  );

  if (frequency !== "monthly" && daysOfWeek.length === 0) {
    return {ok: false, error: "Select at least one day of the week"};
  }

  if (endType === "count") {
    const count = Number(obj.occurrenceCount);
    if (!Number.isInteger(count) || count < 2 || count > 999) {
      return {ok: false, error: "Occurrence count must be between 2 and 999"};
    }
    return {
      ok: true,
      value: {frequency, daysOfWeek, endType, occurrenceCount: count},
    };
  }

  const endDate = typeof obj.endDate === "string" ? obj.endDate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return {ok: false, error: "Invalid recurrence end date"};
  }
  const startDate = graphStartDate(startIso);
  if (endDate <= startDate) {
    return {ok: false, error: "Recurrence end date must be after the first occurrence"};
  }

  return {
    ok: true,
    value: {frequency, daysOfWeek, endType, endDate},
  };
}

export function buildGraphRecurrence(
  startIso: string,
  input: MeetingRecurrenceInput,
): GraphRecurrence {
  const startDate = graphStartDate(startIso);
  const pattern =
    input.frequency === "monthly"
      ? {
          type: "absoluteMonthly",
          interval: 1,
          dayOfMonth: new Date(startIso).getUTCDate(),
        }
      : {
          type: "weekly",
          interval: input.frequency === "biweekly" ? 2 : 1,
          daysOfWeek: normalizeDaysOfWeek(input.daysOfWeek, startIso),
          firstDayOfWeek: "monday",
        };

  const range =
    input.endType === "count"
      ? {
          type: "numbered",
          startDate,
          numberOfOccurrences: input.occurrenceCount,
        }
      : {
          type: "endDate",
          startDate,
          endDate: input.endDate,
        };

  return {pattern, range};
}
