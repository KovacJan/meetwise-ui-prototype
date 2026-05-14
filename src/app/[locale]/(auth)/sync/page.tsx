import {getLocale} from "next-intl/server";
import {getTranslations} from "next-intl/server";
import GlassCard from "@/components/GlassCard";
import Link from "next/link";

export default async function CalendarSyncPage() {
  const locale = await getLocale();
  const t = await getTranslations("sync");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <GlassCard className="w-full max-w-md text-center animate-scale-in">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
            M
          </div>
          <span className="text-xl font-bold text-foreground">MeetWise</span>
        </div>

        {/* Progress: step 2 of 2 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-1.5 rounded-full bg-secondary" />
          <div className="w-8 h-1.5 rounded-full bg-secondary" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">{t("title")}</h2>
        <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
          {t("description")}
        </p>

        {/* Connect button */}
        <a
          href="/api/auth/microsoft"
          className="w-full py-3.5 rounded-xl flex items-center justify-center gap-3 font-semibold text-sm transition-opacity hover:opacity-90 mb-4"
          style={{background: "linear-gradient(135deg, #00a4ef, #0078d4)"}}
        >
          {/* Microsoft logo squares */}
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none" aria-hidden="true">
            <rect width="10" height="10" fill="white" fillOpacity="0.9" />
            <rect x="11" width="10" height="10" fill="white" fillOpacity="0.7" />
            <rect y="11" width="10" height="10" fill="white" fillOpacity="0.8" />
            <rect x="11" y="11" width="10" height="10" fill="white" fillOpacity="0.6" />
          </svg>
          <span className="text-white">{t("connectButton")}</span>
        </a>

        {/* Skip */}
        <Link
          href={`/${locale}/dashboard`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("skip")}
        </Link>
      </GlassCard>
    </div>
  );
}
