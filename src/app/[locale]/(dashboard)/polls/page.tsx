import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import PollsPage from "@/pages/SurveysPage";
import {getSurveysForUser} from "../surveys/actions";

export default async function LocalePollsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const pollsData = await getSurveysForUser();

  return <PollsPage {...pollsData} />;
}

