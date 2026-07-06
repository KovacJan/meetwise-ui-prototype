import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";

// Legacy route: /[locale]/meetings
// Redirect to the new AI Insights page at /[locale]/ai-insights.
export default async function LegacyMeetingsRedirectPage() {
  const locale = await getLocale();
  redirect(`/${locale}/ai-insights`);
}
