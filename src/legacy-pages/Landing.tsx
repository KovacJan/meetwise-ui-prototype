"use client";

import {useTranslations} from "next-intl";
import {useRouter} from "../../i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import GlassCard from "@/components/GlassCard";
import {BarChart3, Sparkles, Calendar} from "lucide-react";

const Landing = () => {
  const t = useTranslations("landing");
  const router = useRouter();

  const features = [
    {icon: BarChart3, title: t("costVisibilityTitle"), desc: t("costVisibilityDesc")},
    {icon: Sparkles, title: t("aiInsightsTitle"), desc: t("aiInsightsDesc")},
    {icon: Calendar, title: t("outlookSyncTitle"), desc: t("outlookSyncDesc")},
  ];

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">M</div>
          <span className="text-xl font-bold text-foreground">MeetWise</span>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <button
            onClick={() => router.push("/login")}
            className="px-5 py-2 rounded-xl glass text-sm font-medium text-foreground hover:bg-secondary/20 transition-all"
          >
            {t("navLogin")}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center pt-12 sm:pt-24 pb-12 sm:pb-20 px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground leading-tight mb-4 sm:mb-6 animate-fade-in">
          {t.rich("heroTitle", {
            highlight: (chunks) => (
              <span className="text-gradient">{chunks}</span>
            ),
          })}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in" style={{animationDelay: "0.1s"}}>
          {t("heroDesc")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 animate-fade-in" style={{animationDelay: "0.2s"}}>
          <button
            onClick={() => router.push("/register")}
            className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            {t("startFree")}
          </button>
          <button className="px-8 py-3.5 rounded-xl glass text-sm font-medium text-foreground hover:bg-secondary/20 transition-all">
            {t("seeHow")}
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <GlassCard key={f.title} className="animate-fade-in">
              <div className="w-11 h-11 rounded-xl gradient-blue-cyan flex items-center justify-center mb-4">
                <f.icon size={20} className="text-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-32">
        <h2 className="text-3xl font-bold text-foreground text-center mb-12">{t("simplePricing")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="animate-fade-in flex flex-col">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-foreground mb-2">{t("freePlan")}</h3>
              <p className="text-3xl font-extrabold text-foreground mb-4">
                €0<span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li>✓ {t("freeFeature1")}</li>
                <li>✓ {t("freeFeature2")}</li>
                <li>✓ {t("freeFeature3")}</li>
              </ul>
            </div>
            <button
              onClick={() => router.push("/register")}
              className="w-full py-3 rounded-xl glass text-sm font-semibold text-foreground hover:bg-secondary/20 transition-all shrink-0"
            >
              {t("getStarted")}
            </button>
          </GlassCard>
          <GlassCard className="border border-secondary/30 animate-fade-in flex flex-col">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold text-foreground">{t("proPlan")}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary/20 text-secondary font-medium">
                  {t("pricingPopular")}
                </span>
              </div>
              <p className="text-3xl font-extrabold text-foreground mb-4">
                €19<span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li>✓ {t("proFeature1")}</li>
                <li>✓ {t("proFeature2")}</li>
                <li>✓ {t("proFeature3")}</li>
                <li>✓ {t("proFeature4")}</li>
              </ul>
            </div>
            <button className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shrink-0">
              {t("upgradePro")}
            </button>
          </GlassCard>
        </div>
      </section>
    </div>
  );
};

export default Landing;
