import {getRequestConfig} from "next-intl/server";
import {routing} from "./routing";

export default getRequestConfig(async ({requestLocale}) => {
  // `requestLocale` is a Promise in next-intl v4; await it to get the string
  const requested = await requestLocale;

  // Validate against known locales; fall back to default
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? (requested as (typeof routing.locales)[number])
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
