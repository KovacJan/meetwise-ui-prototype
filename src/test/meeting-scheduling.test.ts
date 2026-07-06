import {describe, it, expect} from "vitest";

import {minutesToGraphDuration} from "@/lib/meeting-scheduling/duration";
import {parseFindMeetingTimesResponse} from "@/lib/meeting-scheduling/find-slots";
import {buildCreateEventBody} from "@/lib/meeting-scheduling/create-event";
import {
  buildGraphRecurrence,
  parseMeetingRecurrenceInput,
} from "@/lib/meeting-scheduling/recurrence";
import {
  buildFollowingRecurrence,
  buildTruncatedRecurrence,
  dayBeforeStartDate,
} from "@/lib/meeting-scheduling/recurrence-mutate";
import {
  availableRecurrenceScopes,
  parseRecurrenceEditScope,
} from "@/lib/meeting-scheduling/recurrence-scope";
import {
  buildWorkingHourTimeSlots,
  normalizeWorkingHoursConfig,
} from "@/lib/meeting-scheduling/working-hours";
import {estimateSchedulingCost} from "@/lib/meeting-scheduling/cost-preview";

describe("meeting scheduling duration", () => {
  it("converts minutes to Graph ISO duration", () => {
    expect(minutesToGraphDuration(30)).toBe("PT30M");
    expect(minutesToGraphDuration(0)).toBe("PT1M");
  });
});

import {parseAttendeeEmails} from "@/lib/meeting-scheduling/attendees";
import {buildUpdateEventBody} from "@/lib/meeting-scheduling/mutate-event";

describe("parseAttendeeEmails", () => {
  it("extracts unique emails from Graph attendee JSON", () => {
    expect(
      parseAttendeeEmails([
        {emailAddress: {address: "A@Example.com"}},
        {emailAddress: {address: "b@example.com"}},
      ]),
    ).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("buildUpdateEventBody", () => {
  it("includes only provided fields", () => {
    const body = buildUpdateEventBody({
      title: "Updated",
      startIso: "2026-07-10T09:00:00.000Z",
      endIso: "2026-07-10T10:00:00.000Z",
    });
    expect(body.subject).toBe("Updated");
    expect(body.start).toBeDefined();
    expect(body.attendees).toBeUndefined();
  });
});

describe("buildCreateEventBody", () => {
  it("builds Graph event payload with attendees", () => {
    const body = buildCreateEventBody({
      title: "Standup",
      startIso: "2026-07-10T09:00:00.000Z",
      endIso: "2026-07-10T09:30:00.000Z",
      attendeeEmails: ["a@example.com", "b@example.com"],
    });
    expect(body.subject).toBe("Standup");
    expect(body.attendees).toHaveLength(2);
    expect(body.start.dateTime).toBe("2026-07-10T09:00:00");
  });

  it("includes recurrence when provided", () => {
    const recurrence = buildGraphRecurrence("2026-07-10T09:00:00.000Z", {
      frequency: "weekly",
      daysOfWeek: ["friday"],
      endType: "count",
      occurrenceCount: 8,
    });
    const body = buildCreateEventBody({
      title: "Standup",
      startIso: "2026-07-10T09:00:00.000Z",
      endIso: "2026-07-10T09:30:00.000Z",
      attendeeEmails: ["a@example.com"],
      recurrence,
    });
    expect(body.recurrence).toEqual(recurrence);
  });

  it("includes description body when provided", () => {
    const body = buildCreateEventBody({
      title: "Standup",
      description: "Weekly goals",
      startIso: "2026-07-10T09:00:00.000Z",
      endIso: "2026-07-10T09:30:00.000Z",
      attendeeEmails: ["a@example.com"],
    });
    expect(body.body).toEqual({contentType: "text", content: "Weekly goals"});
  });
});

describe("recurrence helpers", () => {
  it("builds weekly numbered recurrence for Graph", () => {
    const parsed = parseMeetingRecurrenceInput(
      {
        frequency: "biweekly",
        daysOfWeek: ["monday", "wednesday"],
        endType: "count",
        occurrenceCount: 6,
      },
      "2026-07-10T09:00:00.000Z",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const graph = buildGraphRecurrence("2026-07-10T09:00:00.000Z", parsed.value);
    expect(graph.pattern).toMatchObject({
      type: "weekly",
      interval: 2,
      daysOfWeek: ["monday", "wednesday"],
    });
    expect(graph.range).toMatchObject({
      type: "numbered",
      numberOfOccurrences: 6,
    });
  });

  it("rejects invalid recurrence end date", () => {
    const parsed = parseMeetingRecurrenceInput(
      {
        frequency: "monthly",
        endType: "date",
        endDate: "2026-07-01",
      },
      "2026-07-10T09:00:00.000Z",
    );
    expect(parsed.ok).toBe(false);
  });
});

describe("recurrence edit scope", () => {
  it("defaults to occurrence for non-recurring meetings", () => {
    expect(parseRecurrenceEditScope(undefined, false)).toBe("occurrence");
    expect(parseRecurrenceEditScope("series", false)).toBe("occurrence");
  });

  it("exposes all scopes when series master is known", () => {
    expect(availableRecurrenceScopes(true, true)).toEqual([
      "occurrence",
      "following",
      "series",
    ]);
    expect(availableRecurrenceScopes(true, false)).toEqual(["occurrence"]);
  });
});

describe("recurrence series split helpers", () => {
  it("truncates series end date to day before occurrence", () => {
    const truncated = buildTruncatedRecurrence(
      {
        pattern: {type: "weekly", interval: 1, daysOfWeek: ["monday"]},
        range: {type: "endDate", startDate: "2026-07-01", endDate: "2026-12-31"},
      },
      "2026-07-15T09:00:00.000Z",
    );
    expect(truncated.range.endDate).toBe(dayBeforeStartDate("2026-07-15T09:00:00.000Z"));
  });

  it("starts following series on selected occurrence date", () => {
    const following = buildFollowingRecurrence(
      {
        pattern: {type: "weekly", interval: 1, daysOfWeek: ["tuesday"]},
        range: {type: "numbered", startDate: "2026-07-01", numberOfOccurrences: 10},
      },
      "2026-07-15T09:00:00.000Z",
    );
    expect(following.range.startDate).toBe("2026-07-15");
    expect(following.range.type).toBe("numbered");
  });
});

describe("working hours", () => {
  it("builds weekday-only slots inside search window", () => {
    const config = normalizeWorkingHoursConfig({
      timezone: "UTC",
      workStart: "09:00",
      workEnd: "17:00",
      workDays: [1, 2, 3, 4, 5],
    });
    const slots = buildWorkingHourTimeSlots(
      new Date("2026-07-06T08:00:00.000Z"),
      new Date("2026-07-10T18:00:00.000Z"),
      config,
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.start.timeZone === "UTC")).toBe(true);
  });
});

describe("scheduling cost preview", () => {
  it("sums matched member rates for duration", () => {
    const preview = estimateSchedulingCost(
      60,
      ["a@example.com", "b@example.com", "unknown@example.com"],
      [
        {email: "a@example.com", hourlyRate: 60},
        {email: "b@example.com", hourlyRate: 120},
      ],
    );
    expect(preview.matchedCount).toBe(2);
    expect(preview.unmatchedCount).toBe(1);
    expect(preview.totalEur).toBe(180);
  });
});

describe("parseFindMeetingTimesResponse", () => {
  it("maps Graph suggestions to normalized slots", () => {
    const slots = parseFindMeetingTimesResponse({
      meetingTimeSuggestions: [
        {
          confidence: 100,
          organizerAvailability: "free",
          attendeeAvailability: [
            {
              attendee: {emailAddress: {address: "a@example.com"}},
              availability: "free",
            },
          ],
          meetingTimeSlot: {
            start: {dateTime: "2026-07-10T09:00:00", timeZone: "UTC"},
            end: {dateTime: "2026-07-10T09:30:00", timeZone: "UTC"},
          },
        },
      ],
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]?.confidence).toBe(100);
    expect(slots[0]?.start).toContain("2026-07-10");
    expect(slots[0]?.attendees[0]?.email).toBe("a@example.com");
  });
});
