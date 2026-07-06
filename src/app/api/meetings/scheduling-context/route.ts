import { NextResponse } from "next/server";
import {
  isSchedulingLeaderError,
  requireSchedulingLeader,
} from "@/lib/meeting-scheduling/leader-auth";
import { loadTeamSchedulingSettings } from "@/lib/meeting-scheduling/team-scheduling-settings";

export async function GET() {
  const ctx = await requireSchedulingLeader();
  if (isSchedulingLeaderError(ctx)) {
    return NextResponse.json(
      { code: ctx.code, error: ctx.error },
      { status: ctx.status },
    );
  }

  const { data: members } = await ctx.admin
    .from("team_members")
    .select("id, email, display_name, status, is_excluded, hourly_rate")
    .eq("team_id", ctx.teamId)
    .neq("status", "pending")
    .order("display_name", { ascending: true });

  const workingHours = await loadTeamSchedulingSettings(ctx.admin, ctx.teamId);

  const attendees = (members ?? [])
    .filter((m) => !m.is_excluded)
    .map((m) => ({
      id: m.id,
      email: m.email,
      name: m.display_name,
      hourlyRate: Number(m.hourly_rate) || 0,
    }));

  return NextResponse.json({
    calendarWriteEnabled: ctx.calendarWriteEnabled,
    attendees,
    workingHours,
  });
}
