"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "../../i18n/navigation";
import { BarChart3, Sparkles, Calendar } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import LandingStats from "@/components/landing/LandingStats";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingPricing from "@/components/landing/LandingPricing";
import LandingFAQ from "@/components/landing/LandingFAQ";
import LandingFooter from "@/components/landing/LandingFooter";

const Landing = () => {
  const t = useTranslations("landing");
  const router = useRouter();

  const tf = (key: string, fallback: string) =>
    t.has(key) ? t(key) : fallback;

  const features = [
    {
      icon: BarChart3,
      title: t("costVisibilityTitle"),
      desc: t("costVisibilityDesc"),
    },
    { icon: Sparkles, title: t("aiInsightsTitle"), desc: t("aiInsightsDesc") },
    {
      icon: Calendar,
      title: t("outlookSyncTitle"),
      desc: t("outlookSyncDesc"),
    },
  ];

  const stats = [
    { value: "EUR120k+", label: t("statsCost") },
    { value: "6.2h", label: t("statsTime") },
    { value: "94%", label: t("statsAction") },
  ];

  const howSteps = [
    { title: t("howStep1Title"), body: t("howStep1Body") },
    { title: t("howStep2Title"), body: t("howStep2Body") },
    { title: t("howStep3Title"), body: t("howStep3Body") },
  ];

  const faqItems = [
    {
      question: tf(
        "faqQ1",
        "What data does MeetWise access from Microsoft Calendar?",
      ),
      answer: tf(
        "faqA1",
        "MeetWise reads meeting metadata like title, participants, start and end time, and recurrence details. It does not read your email inbox or message bodies.",
      ),
    },
    {
      question: tf("faqQ2", "Do I need admin consent to use MeetWise?"),
      answer: tf(
        "faqA2",
        "Some organizations require Microsoft admin consent before users can grant calendar permissions. If your tenant enforces this policy, your admin must approve first.",
      ),
    },
    {
      question: tf("faqQ3", "Can I disconnect Outlook and delete my data?"),
      answer: tf(
        "faqA3",
        "Yes. You can disconnect your Outlook integration at any time and request data deletion. MeetWise is built to support account-level data removal workflows.",
      ),
    },
    {
      question: tf("faqQ4", "How is my data secured?"),
      answer: tf(
        "faqA4",
        "MeetWise uses encrypted transport and secure storage practices. Sensitive tokens are encrypted before persistence, and access controls are applied server-side.",
      ),
    },
    {
      question: tf("faqQ5", "Can I change plans or cancel anytime?"),
      answer: tf(
        "faqA5",
        "Yes. You can upgrade when your team needs more AI insights and change or cancel your plan according to your billing cycle.",
      ),
    },
    {
      question: tf("faqQ6", "How quickly can our team get started?"),
      answer: tf(
        "faqA6",
        "Most teams complete setup in minutes: create an account, connect Outlook, sync meetings, and start reviewing cost and efficiency insights.",
      ),
    },
  ];

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_20%_-10%,rgba(56,189,248,.18),transparent_48%),radial-gradient(circle_at_90%_10%,rgba(99,102,241,.20),transparent_40%),linear-gradient(180deg,hsl(237,56%,13%)_0%,hsl(236,50%,17%)_42%,hsl(235,56%,21%)_100%)]">
      <div className="absolute inset-0 pointer-events-none opacity-30 [background-image:linear-gradient(hsla(0,0%,100%,0.07)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.07)_1px,transparent_1px)] [background-size:48px_48px]" />

      <LandingNavbar
        howLabel={tf("howShort", "How it works")}
        faqLabel={tf("faqShort", "FAQ")}
        onHowClick={() => scrollToSection("how-it-works")}
        onFaqClick={() => scrollToSection("faq")}
        loginLabel={t("navLogin")}
        onLogin={() => router.push("/login")}
      />

      <LandingHero
        badge={t("heroBadge")}
        title={t.rich("heroTitle", {
          highlight: (chunks) => (
            <span className="text-gradient">{chunks}</span>
          ),
        })}
        description={t("heroDesc")}
        primaryCta={t("startFree")}
        secondaryCta={t("seeHow")}
        onPrimaryClick={() => router.push("/register")}
        onSecondaryClick={() => scrollToSection("how-it-works")}
      />

      <LandingStats items={stats} />

      <LandingHowItWorks
        sectionId="how-it-works"
        title={t("howTitle")}
        subtitle={t("howSubtitle")}
        steps={howSteps}
      />

      <LandingFeatures
        title={t("featuresTitle")}
        subtitle={t("featuresSubtitle")}
        items={features}
      />

      <LandingPricing
        title={t("simplePricing")}
        subtitle={t("pricingSubtitle")}
        freePlanLabel={t("freePlan")}
        proPlanLabel={t("proPlan")}
        perMonthLabel={t("perMonth")}
        popularLabel={t("pricingPopular")}
        getStartedLabel={t("getStarted")}
        upgradeLabel={t("upgradePro")}
        freeFeatures={[t("freeFeature1"), t("freeFeature2"), t("freeFeature3")]}
        proFeatures={[
          t("proFeature1"),
          t("proFeature2"),
          t("proFeature3"),
          t("proFeature4"),
        ]}
        onStartClick={() => router.push("/register")}
        onUpgradeClick={() => router.push("/upgrade")}
      />

      <LandingFAQ
        sectionId="faq"
        title={tf("faqTitle", "Frequently Asked Questions")}
        subtitle={tf(
          "faqSubtitle",
          "Everything teams usually ask before connecting calendars and rolling out MeetWise.",
        )}
        items={faqItems}
      />

      <LandingFooter
        tagline={t("footerTagline")}
        legalLabel={t("footerLegal")}
        privacyLabel={t("privacyPolicy")}
        termsLabel={t("termsOfUse")}
      />
    </div>
  );
};

export default Landing;
