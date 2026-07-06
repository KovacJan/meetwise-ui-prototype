import { formatGraphLocalDateTime } from "./graph-datetime";

export type WorkingHoursConfig = {
  timezone: string;
  workStart: string;
  workEnd: string;
  /** ISO weekday: 1 = Monday … 7 = Sunday */
  workDays: number[];
};

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  timezone: "Europe/Bratislava",
  workStart: "09:00",
  workEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
};

function parseHm(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(":").map((part) => Number(part));
  return {
    hours: Number.isFinite(h) ? h : 9,
    minutes: Number.isFinite(m) ? m : 0,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): string {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hours)}:${pad2(minutes)}:00`;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  isoWeekday: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    isoWeekday: weekdayMap[pick("weekday")] ?? 1,
  };
}

/** UTC instant for a wall-clock time in an IANA / Windows time zone. */
function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const wantPrefix = formatLocalDateTime(
    year,
    month,
    day,
    hours,
    minutes,
  ).slice(0, 16);
  const start = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  const end = Date.UTC(year, month - 1, day + 1, 23, 59, 0);

  for (let t = start; t <= end; t += 15 * 60 * 1000) {
    if (
      formatGraphLocalDateTime(new Date(t), timeZone).slice(0, 16) === wantPrefix
    ) {
      return new Date(t);
    }
  }

  return new Date(Date.UTC(year, month - 1, day, hours, minutes));
}

export function normalizeWorkingHoursConfig(
  raw: Partial<WorkingHoursConfig> | null | undefined,
): WorkingHoursConfig {
  const workDays =
    Array.isArray(raw?.workDays) && raw.workDays.length > 0
      ? [...new Set(raw.workDays.filter((d) => d >= 1 && d <= 7))].sort()
      : DEFAULT_WORKING_HOURS.workDays;

  return {
    timezone: raw?.timezone?.trim() || DEFAULT_WORKING_HOURS.timezone,
    workStart: raw?.workStart?.trim() || DEFAULT_WORKING_HOURS.workStart,
    workEnd: raw?.workEnd?.trim() || DEFAULT_WORKING_HOURS.workEnd,
    workDays,
  };
}

export function buildWorkingHourTimeSlots(
  windowStart: Date,
  windowEnd: Date,
  config: WorkingHoursConfig,
): Array<{
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}> {
  const startHm = parseHm(config.workStart);
  const endHm = parseHm(config.workEnd);
  const slots: Array<{
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }> = [];

  const seenDays = new Set<string>();
  let cursor = windowStart.getTime();
  const endMs = windowEnd.getTime();

  while (cursor <= endMs + 86_400_000) {
    const parts = getZonedParts(new Date(cursor), config.timezone);
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      if (config.workDays.includes(parts.isoWeekday)) {
        const slotStart = zonedLocalToUtc(
          parts.year,
          parts.month,
          parts.day,
          startHm.hours,
          startHm.minutes,
          config.timezone,
        );
        const slotEnd = zonedLocalToUtc(
          parts.year,
          parts.month,
          parts.day,
          endHm.hours,
          endHm.minutes,
          config.timezone,
        );

        if (
          slotEnd > slotStart &&
          slotEnd > windowStart &&
          slotStart < windowEnd
        ) {
          const effectiveStart =
            slotStart < windowStart ? windowStart : slotStart;
          const effectiveEnd = slotEnd > windowEnd ? windowEnd : slotEnd;
          if (effectiveEnd > effectiveStart) {
            slots.push({
              start: {
                dateTime: formatGraphLocalDateTime(
                  effectiveStart,
                  config.timezone,
                ),
                timeZone: config.timezone,
              },
              end: {
                dateTime: formatGraphLocalDateTime(
                  effectiveEnd,
                  config.timezone,
                ),
                timeZone: config.timezone,
              },
            });
          }
        }
      }
    }
    cursor += 12 * 60 * 60 * 1000;
  }

  return slots;
}
