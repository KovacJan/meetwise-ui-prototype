/**
 * Verifies meeting-scheduling modules (phases 1–7) without Graph/DB.
 * Usage: npx tsx scripts/verify-scheduling.ts
 */
import {parseAttendeeEmails} from "../src/lib/meeting-scheduling/attendees";
import {buildCreateEventBody} from "../src/lib/meeting-scheduling/create-event";
import {minutesToGraphDuration} from "../src/lib/meeting-scheduling/duration";
import {parseFindMeetingTimesResponse} from "../src/lib/meeting-scheduling/find-slots";
import {buildUpdateEventBody} from "../src/lib/meeting-scheduling/mutate-event";
import {
  buildGraphRecurrence,
  parseMeetingRecurrenceInput,
} from "../src/lib/meeting-scheduling/recurrence";
import {
  buildFollowingRecurrence,
  buildTruncatedRecurrence,
  dayBeforeStartDate,
} from "../src/lib/meeting-scheduling/recurrence-mutate";
import {
  availableRecurrenceScopes,
  parseRecurrenceEditScope,
} from "../src/lib/meeting-scheduling/recurrence-scope";
import {estimateSchedulingCost} from "../src/lib/meeting-scheduling/cost-preview";
import {
  buildWorkingHourTimeSlots,
  normalizeWorkingHoursConfig,
} from "../src/lib/meeting-scheduling/working-hours";

type Check = {name: string; ok: boolean; detail?: string};

const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({name, ok, detail});
}

// Phase 2: duration + find slots parsing
check(
  "duration PT30M",
  minutesToGraphDuration(30) === "PT30M",
);
const slots = parseFindMeetingTimesResponse({
  meetingTimeSuggestions: [
    {
      confidence: 90,
      meetingTimeSlot: {
        start: {dateTime: "2026-07-10T09:00:00", timeZone: "UTC"},
        end: {dateTime: "2026-07-10T09:30:00", timeZone: "UTC"},
      },
    },
  ],
});
check("find-slots parse", slots.length === 1 && slots[0]!.confidence === 90);

// Phase 3: create payload
const createBody = buildCreateEventBody({
  title: "Sync",
  startIso: "2026-07-10T09:00:00.000Z",
  endIso: "2026-07-10T09:30:00.000Z",
  attendeeEmails: ["a@example.com"],
});
check("create event body", createBody.subject === "Sync" && createBody.attendees?.length === 1);

// Phase 4: update + attendees
check(
  "parse attendees",
  parseAttendeeEmails([
    {emailAddress: {address: "A@Example.com"}},
  ])[0] === "a@example.com",
);
check(
  "update event body",
  buildUpdateEventBody({title: "X"}).subject === "X",
);

// Phase 5: recurring create
const recurring = parseMeetingRecurrenceInput(
  {
    frequency: "weekly",
    daysOfWeek: ["monday"],
    endType: "count",
    occurrenceCount: 5,
  },
  "2026-07-10T09:00:00.000Z",
);
check("recurrence parse", recurring.ok === true);
if (recurring.ok) {
  const graph = buildGraphRecurrence("2026-07-10T09:00:00.000Z", recurring.value);
  check("recurrence graph weekly", graph.pattern.type === "weekly");
}

// Phase 6: edit scopes + series split
check(
  "scope occurrence default",
  parseRecurrenceEditScope(undefined, true) === "occurrence",
);
check(
  "scope all for recurring",
  availableRecurrenceScopes(true, true).length === 3,
);
const truncated = buildTruncatedRecurrence(
  {
    pattern: {type: "weekly", interval: 1, daysOfWeek: ["monday"]},
    range: {type: "endDate", startDate: "2026-07-01", endDate: "2026-12-31"},
  },
  "2026-07-15T09:00:00.000Z",
);
check(
  "series truncate end",
  truncated.range.endDate === dayBeforeStartDate("2026-07-15T09:00:00.000Z"),
);
const following = buildFollowingRecurrence(
  {
    pattern: {type: "weekly", interval: 1, daysOfWeek: ["tuesday"]},
    range: {type: "numbered", startDate: "2026-07-01", numberOfOccurrences: 8},
  },
  "2026-07-15T09:00:00.000Z",
);
check("following series start", following.range.startDate === "2026-07-15");

// Phase 7: working hours + cost preview
const wh = normalizeWorkingHoursConfig(null);
const whSlots = buildWorkingHourTimeSlots(
  new Date("2026-07-06T00:00:00.000Z"),
  new Date("2026-07-12T23:59:59.000Z"),
  wh,
);
check("working hour slots", whSlots.length >= 5);
const cost = estimateSchedulingCost(
  30,
  ["a@example.com"],
  [{email: "a@example.com", hourlyRate: 100}],
);
check("cost preview 30min @100", cost.totalEur === 50);

const failed = checks.filter((c) => !c.ok);
console.log("\n=== MeetWise scheduling verify ===\n");
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} passed\n`);
if (failed.length > 0) process.exit(1);
