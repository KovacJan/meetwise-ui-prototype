import { minutesToGraphDuration } from "./duration";
import {
  buildWorkingHourTimeSlots,
  type WorkingHoursConfig,
} from "./working-hours";
import { formatGraphLocalDateTime } from "./graph-datetime";

export type MeetingSlotSuggestion = {
  start: string;
  end: string;
  confidence: number;
  organizerAvailability: string;
  attendees: Array<{ email: string; availability: string }>;
};

type GraphFindMeetingTimesResponse = {
  emptySuggestionsReason?: string;
  meetingTimeSuggestions?: Array<{
    confidence?: number;
    organizerAvailability?: string;
    attendeeAvailability?: Array<{
      attendee?: { emailAddress?: { address?: string } };
      availability?: string;
    }>;
    meetingTimeSlot?: {
      start?: { dateTime?: string; timeZone?: string };
      end?: { dateTime?: string; timeZone?: string };
    };
  }>;
};

type GraphTimeSlot = {
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

type FindMeetingTimesStrategy = {
  timeSlots: GraphTimeSlot[];
  isOrganizerOptional: boolean;
  minimumAttendeePercentage: number;
};

function toUtcIso(dateTime: string | undefined): string | null {
  if (!dateTime) return null;
  const normalized =
    dateTime.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateTime)
      ? dateTime
      : `${dateTime}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseFindMeetingTimesResponse(
  json: GraphFindMeetingTimesResponse,
): MeetingSlotSuggestion[] {
  const suggestions = json.meetingTimeSuggestions ?? [];
  const slots: MeetingSlotSuggestion[] = [];

  for (const item of suggestions) {
    const start = toUtcIso(item.meetingTimeSlot?.start?.dateTime);
    const end = toUtcIso(item.meetingTimeSlot?.end?.dateTime);
    if (!start || !end) continue;

    slots.push({
      start,
      end,
      confidence: item.confidence ?? 0,
      organizerAvailability: item.organizerAvailability ?? "unknown",
      attendees: (item.attendeeAvailability ?? []).map((a) => ({
        email: a.attendee?.emailAddress?.address ?? "",
        availability: a.availability ?? "unknown",
      })),
    });
  }

  return slots;
}

function buildFullWindowTimeSlot(
  windowStart: Date,
  windowEnd: Date,
  timeZone: string,
): GraphTimeSlot {
  return {
    start: {
      dateTime: formatGraphLocalDateTime(windowStart, timeZone),
      timeZone,
    },
    end: {
      dateTime: formatGraphLocalDateTime(windowEnd, timeZone),
      timeZone,
    },
  };
}

async function callFindMeetingTimes(
  accessToken: string,
  options: {
    attendeeEmails: string[];
    durationMinutes: number;
    timeZone: string;
    maxCandidates: number;
    strategy: FindMeetingTimesStrategy;
  },
): Promise<{ slots: MeetingSlotSuggestion[]; emptyReason?: string }> {
  const body = {
    attendees: options.attendeeEmails.map((email) => ({
      type: "required",
      emailAddress: { address: email },
    })),
    timeConstraint: {
      timeSlots: options.strategy.timeSlots,
    },
    meetingDuration: minutesToGraphDuration(options.durationMinutes),
    maxCandidates: options.maxCandidates,
    isOrganizerOptional: options.strategy.isOrganizerOptional,
    returnSuggestionReasons: true,
    minimumAttendeePercentage: options.strategy.minimumAttendeePercentage,
  };

  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/findMeetingTimes",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: `outlook.timezone="${options.timeZone}"`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`findMeetingTimes failed: ${text}`);
  }

  const json = (await res.json()) as GraphFindMeetingTimesResponse;
  return {
    slots: parseFindMeetingTimesResponse(json),
    emptyReason: json.emptySuggestionsReason || undefined,
  };
}

export async function findMeetingTimeSlots(
  accessToken: string,
  options: {
    attendeeEmails: string[];
    organizerEmail?: string;
    durationMinutes: number;
    searchWindowDays: number;
    timeZone?: string;
    maxCandidates?: number;
    workingHours?: WorkingHoursConfig;
  },
): Promise<{ slots: MeetingSlotSuggestion[]; emptyReason?: string }> {
  const timeZone = options.workingHours?.timezone ?? options.timeZone ?? "UTC";
  const now = new Date();
  const windowStart = new Date(now.getTime() + 60 * 60 * 1000);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + options.searchWindowDays);

  const organizerEmail = options.organizerEmail?.trim().toLowerCase();
  const requiredAttendees = options.attendeeEmails.filter(
    (email) => email.toLowerCase() !== organizerEmail,
  );

  const fullWindow = buildFullWindowTimeSlot(windowStart, windowEnd, timeZone);
  const workingHourSlots = options.workingHours
    ? buildWorkingHourTimeSlots(windowStart, windowEnd, options.workingHours)
    : [];

  const strategies: FindMeetingTimesStrategy[] = [
    {
      timeSlots: workingHourSlots.length > 0 ? workingHourSlots : [fullWindow],
      isOrganizerOptional: false,
      minimumAttendeePercentage: 100,
    },
    {
      timeSlots: [fullWindow],
      isOrganizerOptional: true,
      minimumAttendeePercentage: 100,
    },
    {
      timeSlots: [fullWindow],
      isOrganizerOptional: true,
      minimumAttendeePercentage: 50,
    },
  ];

  let lastResult: { slots: MeetingSlotSuggestion[]; emptyReason?: string } = {
    slots: [],
    emptyReason: undefined,
  };

  for (const strategy of strategies) {
    const result = await callFindMeetingTimes(accessToken, {
      attendeeEmails: requiredAttendees,
      durationMinutes: options.durationMinutes,
      timeZone,
      maxCandidates: options.maxCandidates ?? 12,
      strategy,
    });
    lastResult = result;
    if (result.slots.length > 0) {
      return result;
    }
  }

  return lastResult;
}
