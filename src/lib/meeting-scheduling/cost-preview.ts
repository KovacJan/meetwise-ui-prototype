import {calculateMeetingCost} from "@/lib/cost-engine";

export type CostPreviewMember = {
  email: string;
  hourlyRate: number;
};

export type SchedulingCostPreview = {
  totalEur: number;
  matchedCount: number;
  unmatchedCount: number;
  durationMinutes: number;
};

export function estimateSchedulingCost(
  durationMinutes: number,
  attendeeEmails: string[],
  members: CostPreviewMember[],
): SchedulingCostPreview {
  const memberByEmail = new Map(
    members.map((m) => [m.email.trim().toLowerCase(), m]),
  );

  let matchedCount = 0;
  let total = 0;

  for (const email of attendeeEmails) {
    const member = memberByEmail.get(email.trim().toLowerCase());
    if (!member || member.hourlyRate <= 0) continue;
    matchedCount += 1;
    total += calculateMeetingCost(
      durationMinutes,
      1,
      member.hourlyRate,
    );
  }

  return {
    totalEur: Math.round(total * 100) / 100,
    matchedCount,
    unmatchedCount: Math.max(0, attendeeEmails.length - matchedCount),
    durationMinutes,
  };
}
