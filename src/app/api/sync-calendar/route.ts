import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import { syncCalendarForProfile } from "@/lib/calendar-sync";
import { isOutlookReconnectRequiredError } from "@/lib/microsoft-graph";
import {
  checkRateLimit,
  rateLimitedResponse,
  syncCooldownRetrySeconds,
} from "@/lib/rate-limit";

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load profile — use admin client so RLS never hides data
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, team_id, microsoft_refresh_token, last_calendar_sync_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  if (!profile.team_id) {
    return NextResponse.json(
      { error: "User is not assigned to a team" },
      { status: 400 },
    );
  }

  if (!profile.microsoft_refresh_token) {
    return NextResponse.json(
      { error: "Outlook is not connected" },
      { status: 400 },
    );
  }

  const profileCooldown = syncCooldownRetrySeconds(profile.last_calendar_sync_at);
  if (profileCooldown !== null) {
    return rateLimitedResponse("RATE_LIMIT_SYNC", profileCooldown);
  }

  const cooldownLimit = await checkRateLimit("sync.cooldown", user.id);
  if (!cooldownLimit.success) {
    return rateLimitedResponse(
      "RATE_LIMIT_SYNC",
      cooldownLimit.retryAfterSeconds ?? 300,
    );
  }

  const hourlyLimit = await checkRateLimit("sync.hourly", user.id);
  if (!hourlyLimit.success) {
    return rateLimitedResponse(
      "RATE_LIMIT_SYNC",
      hourlyLimit.retryAfterSeconds ?? 3600,
    );
  }

  let result: {
    synced: number;
    total: number;
    deleted: number;
    costsRecalculated: number;
  } | null = null;

  try {
    result = await syncCalendarForProfile(admin, profile);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Calendar sync failed unexpectedly.";

    await admin
      .from("profiles")
      .update({
        last_calendar_sync_status: "failed",
        last_calendar_sync_error: message,
      })
      .eq("id", user.id);
  }

  const { data: refreshedProfile } = await admin
    .from("profiles")
    .select(
      "last_calendar_sync_at, last_calendar_sync_status, last_calendar_sync_error",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (refreshedProfile?.last_calendar_sync_status === "failed") {
    const rawError =
      refreshedProfile.last_calendar_sync_error ??
      "Calendar sync failed. Please try again.";
    const reconnectRequired = isOutlookReconnectRequiredError(rawError);
    return NextResponse.json(
      {
        code: reconnectRequired ? "OUTLOOK_RECONNECT_REQUIRED" : "SYNC_FAILED",
        error: rawError,
        lastSyncAt: refreshedProfile.last_calendar_sync_at ?? null,
      },
      { status: 502 },
    );
  }

  if (!result) {
    return NextResponse.json(
      {
        error: "Calendar sync failed. Please try again.",
        lastSyncAt: refreshedProfile?.last_calendar_sync_at ?? null,
      },
      { status: 502 },
    );
  }

  // Invalidate the dashboard server cache so router.refresh() picks up new data
  revalidatePath("/", "layout");

  return NextResponse.json({
    ...result,
    lastSyncAt: refreshedProfile?.last_calendar_sync_at ?? null,
  });
}
