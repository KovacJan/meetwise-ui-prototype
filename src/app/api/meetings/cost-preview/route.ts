import { NextRequest, NextResponse } from "next/server";
import { estimateSchedulingCost } from "@/lib/meeting-scheduling/cost-preview";
import {
  isSchedulingLeaderError,
  requireSchedulingLeader,
} from "@/lib/meeting-scheduling/leader-auth";

type Body = {
  durationMinutes?: number;
  attendeeEmails?: string[];
};

export async function POST(req: NextRequest) {
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attendeeEmails = Array.isArray(body.attendeeEmails)
    ? [...new Set(body.attendeeEmails.map((e) => e.trim().toLowerCase()))].filter(
        Boolean,
      )
    : [];

  const durationMinutes = Math.min(
    240,
    Math.max(15, Math.round(body.durationMinutes ?? 30)),
  );

  if (attendeeEmails.length === 0) {
    return NextResponse.json(
      { error: "Select at least one attendee" },
      { status: 400 },
    );
  }

  const { data: members } = await ctx.admin
    .from("team_members")
    .select("email, hourly_rate")
    .eq("team_id", ctx.teamId)
    .neq("status", "pending")
    .eq("is_excluded", false);

  const preview = estimateSchedulingCost(
    durationMinutes,
    attendeeEmails,
    (members ?? []).map((m) => ({
      email: m.email,
      hourlyRate: Number(m.hourly_rate) || 0,
    })),
  );

  return NextResponse.json({ preview });
}
