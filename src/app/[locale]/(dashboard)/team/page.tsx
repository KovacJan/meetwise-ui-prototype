import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import Team from "@/pages/Team";
import {getTeamData, getTeamMembers} from "./actions";

export default async function LocaleTeamPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const [teamData, members] = await Promise.all([
    getTeamData(),
    getTeamMembers(),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const locale = await getLocale();

  return (
    <Team
      teamName={teamData?.name}
      teamCode={teamData?.teamCode}
      teamId={teamData?.id}
      managerName={teamData?.managerName ?? null}
      managerEmail={teamData?.managerEmail ?? null}
      shareableLink={
        teamData?.teamCode
          ? `${appUrl}/${locale}/join?team=${teamData.teamCode}`
          : undefined
      }
      members={members}
      isManager={teamData?.isCurrentUserManager ?? false}
    />
  );
}
