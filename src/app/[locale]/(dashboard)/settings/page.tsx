import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import SettingsPage from "@/pages/SettingsPage";

export default async function LocaleSettingsPage() {
  const locale = await getLocale();
  const supabase = await createSupabaseServerClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  return <SettingsPage />;
}
