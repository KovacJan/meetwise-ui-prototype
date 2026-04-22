import type {ReactNode} from "react";
import {NextIntlClientProvider} from "next-intl";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {UserProvider, type UserPlan} from "@/contexts/UserContext";

async function loadMessages(locale: string) {
  const core = (await import(`../../../messages/${locale}.json`)).default;
  let upgrade: Record<string, unknown> = {};
  try {
    upgrade = (await import(`../../../messages/upgrade.${locale}.json`)).default;
  } catch {
    // Optional namespace – ignore if missing
  }
  return {
    ...core,
    ...(Object.keys(upgrade).length > 0 ? {upgrade} : {}),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const messages = await loadMessages(locale);

  let displayName: string | null = null;
  let email: string | null = null;
  let plan: UserPlan = "free";

  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (user) {
      email = user.email ?? null;
      const admin = createSupabaseAdminClient();

      const {data: profile} = await admin
        .from("profiles")
        .select("display_name, team_id")
        .eq("id", user.id)
        .maybeSingle();

      displayName =
        profile?.display_name ??
        (user.user_metadata?.full_name as string | undefined) ??
        null;

      if (profile?.team_id) {
        const {data: team} = await admin
          .from("teams")
          .select("plan")
          .eq("id", profile.team_id)
          .maybeSingle();
        if (team?.plan === "pro") plan = "pro";
      }
    }
  } catch {
    // Not authenticated or DB unavailable — continue without user data
  }

  return (
    <NextIntlClientProvider key={locale} locale={locale} messages={messages}>
      <UserProvider displayName={displayName} email={email} plan={plan}>
        {children}
      </UserProvider>
    </NextIntlClientProvider>
  );
}
