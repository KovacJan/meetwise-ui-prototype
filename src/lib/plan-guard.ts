import type {Team} from "@/types";

export function isPro(team: Pick<Team, "plan" | "plan_expires_at">): boolean {
  if (team.plan !== "pro") return false;

  if (!team.plan_expires_at) {
    return true;
  }

  const expiresAt = new Date(team.plan_expires_at);
  return expiresAt.getTime() > Date.now();
}

