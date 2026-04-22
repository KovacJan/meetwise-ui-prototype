import {NextRequest, NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {syncCalendarForProfile} from "@/lib/calendar-sync";

export async function POST(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: {session},
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  // Load profile — use admin client so RLS never hides data
  const {data: profile, error: profileError} = await admin
    .from("profiles")
    .select("id, team_id, microsoft_refresh_token")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({error: "Profile not found"}, {status: 400});
  }

  if (!profile.team_id) {
    return NextResponse.json(
      {error: "User is not assigned to a team"},
      {status: 400},
    );
  }

  if (!profile.microsoft_refresh_token) {
    return NextResponse.json(
      {error: "Outlook is not connected"},
      {status: 400},
    );
  }

  const result = await syncCalendarForProfile(admin, profile);

  // Invalidate the dashboard server cache so router.refresh() picks up new data
  revalidatePath("/", "layout");

  return NextResponse.json(result);
}
