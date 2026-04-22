import {getLocale} from "next-intl/server";
import {redirect} from "next/navigation";

// Legacy route: /[locale]/surveys
// Redirect to the new Polls page at /[locale]/polls to keep old links working.
export default async function LegacySurveysRedirectPage() {
  const locale = await getLocale();
  redirect(`/${locale}/polls`);
}
