import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import ManagerDashboard from "@/pages/ManagerDashboard";
import {ensureProfile} from "@/app/[locale]/(auth)/onboarding/actions";
import {getDashboardData} from "./actions";
import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";

// Demo values — only shown for users who have NO team yet (as a preview)
const DEMO_WEEKLY = 3420;
const DEMO_MONTHLY = 13680;
const DEMO_ANNUAL = 164160;

export default async function LocaleDashboardPage() {
  const locale = await getLocale();
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  // Auth check and redirect outside try/catch so redirect() is never caught
  if (!user) {
    redirect(`/${locale}/login`);
  }

  try {
    let profile = (
      await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle()
    ).data;

    if (!profile) {
      profile = await ensureProfile(supabase);
    }

    const teamId = profile?.team_id as string | undefined;

    // No team yet — show demo numbers with CTA to create/join a team
    if (!teamId) {
      return (
        <ManagerDashboard
          weeklyCost={DEMO_WEEKLY}
          monthlyCost={DEMO_MONTHLY}
          annualCost={DEMO_ANNUAL}
          showTeamSetupCta
        />
      );
    }

    const dashboardData = await getDashboardData(teamId);

    // User is a team member but not a manager
    if (!dashboardData.isManager) {
      return (
        <ManagerDashboard
          weeklyCost={dashboardData.weeklyCost}
          monthlyCost={dashboardData.monthlyCost}
          annualCost={dashboardData.annualCost}
          calendarConnected={dashboardData.calendarConnected}
        />
      );
    }

    // Manager with real data — always show the actual computed values (even if 0)
    return (
      <ManagerDashboard
        weeklyCost={dashboardData.weeklyCost}
        monthlyCost={dashboardData.monthlyCost}
        annualCost={dashboardData.annualCost}
        calendarConnected={dashboardData.calendarConnected}
      />
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "The dashboard is temporarily unavailable. Please try again later.";

    return (
      <ManagerDashboard
        weeklyCost={0}
        monthlyCost={0}
        annualCost={0}
        errorMessage={message}
      />
    );
  }
}
