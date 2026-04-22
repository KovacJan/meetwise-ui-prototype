import {redirect} from "next/navigation";
import {getLocale} from "next-intl/server";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";
import {getTeamPreview} from "./actions";
import JoinLanding from "./JoinLanding";
import JoinConfirm from "./JoinConfirm";
import GlassCard from "@/components/GlassCard";

export default async function JoinTeamPage({
  searchParams,
}: {
  searchParams: Promise<{team?: string}>;
}) {
  const {team: rawCode} = await searchParams;
  const locale = await getLocale();

  // No team code provided → redirect to home
  if (!rawCode) {
    redirect(`/${locale}`);
  }

  const teamCode = rawCode.trim().toUpperCase();

  // Fetch team info for display (works for both authed and anonymous users)
  const teamPreview = await getTeamPreview(teamCode);

  // Team not found → show error
  if (!teamPreview) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <GlassCard className="w-full max-w-md text-center animate-scale-in">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground">MeetWise</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">✕</span>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Team not found</h2>
          <p className="text-sm text-muted-foreground">
            The invite link is invalid or has expired. Ask your team manager for a new link.
          </p>
        </GlassCard>
      </main>
    );
  }

  // Check authentication
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (user) {
    // Check if this user is already on this exact team
    const admin = createSupabaseAdminClient();
    const {data: profile} = await admin
      .from("profiles")
      .select("team_id, outlook_connected")
      .eq("id", user.id)
      .maybeSingle();

    // Fetch the team id for comparison
    const {data: team} = await admin
      .from("teams")
      .select("id")
      .eq("team_code", teamCode)
      .maybeSingle();

    if (profile?.team_id && team?.id && profile.team_id === team.id) {
      // Already on this team — go straight to dashboard
      redirect(`/${locale}/dashboard`);
    }

    // Logged-in user not yet on this team → show confirmation screen
    return (
      <JoinConfirm
        teamName={teamPreview.name}
        teamCode={teamPreview.teamCode}
        locale={locale}
      />
    );
  }

  // Not authenticated → show landing with sign-in / register CTAs
  const joinHref = `/${locale}/join?team=${teamCode}`;

  return (
    <JoinLanding
      teamName={teamPreview.name}
      teamCode={teamPreview.teamCode}
      joinHref={joinHref}
    />
  );
}
