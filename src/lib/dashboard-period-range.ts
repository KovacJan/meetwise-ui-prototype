import {
  endOfISOWeek,
  endOfMonth,
  endOfYear,
  startOfISOWeek,
  startOfMonth,
  startOfYear,
} from "date-fns";

import type { FilterPeriod } from "@/app/[locale]/(dashboard)/dashboard/actions";

/** Shared ISO range for dashboard chart + meetings list. */
export function buildDashboardPeriodRange(
  period: FilterPeriod,
  customFrom: string,
  customTo: string,
): [string, string] {
  const now = new Date();
  switch (period) {
    case "week":
      return [
        startOfISOWeek(now).toISOString(),
        endOfISOWeek(now).toISOString(),
      ];
    case "month":
      return [startOfMonth(now).toISOString(), endOfMonth(now).toISOString()];
    case "year":
      return [startOfYear(now).toISOString(), endOfYear(now).toISOString()];
    case "custom":
      return [
        customFrom
          ? new Date(customFrom + "T00:00:00").toISOString()
          : startOfISOWeek(now).toISOString(),
        customTo
          ? new Date(customTo + "T23:59:59").toISOString()
          : endOfISOWeek(now).toISOString(),
      ];
  }
}
