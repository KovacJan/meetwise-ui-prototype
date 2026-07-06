import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import AiInsightsPage from "@/pages/AiInsightsPage";

export default async function LocaleAiInsightsPage() {
  const locale = await getLocale();
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  return <AiInsightsPage />;
}

