"use client";

import {useState} from "react";
import GlassCard from "@/components/GlassCard";
import {Check, ArrowLeft, Loader2, FlaskConical, Sparkles} from "lucide-react";
import {useRouter} from "../../i18n/navigation";
import {useLocale, useTranslations} from "next-intl";
import {useUser} from "@/contexts/UserContext";

const isTestMode =
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").startsWith("pk_test_");

const basePlans = [
  {
    key: "free" as const,
    price: "€0",
    featureKeys: ["freeFeature1", "freeFeature2", "freeFeature3"] as const,
  },
  {
    key: "pro" as const,
    price: "€19",
    featureKeys: ["proFeature1", "proFeature2", "proFeature3", "proFeature4"] as const,
  },
] as const;

const Upgrade = () => {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("upgrade");
  const {plan} = useUser();
  const isPro = plan === "pro";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Build localized plan models and mark current plan
  const displayPlans = basePlans.map((p) => {
    const isProPlan = p.key === "pro";
    const name = t(isProPlan ? "proName" : "freeName");
    const features = p.featureKeys.map((k) => t(k));
    const popular = isProPlan;
    const active = isProPlan ? isPro : !isPro;
    const cta = active
      ? t("ctaCurrent")
      : isProPlan
      ? t("ctaUpgrade")
      : t("ctaFree");

    return {
      key: p.key,
      name,
      price: p.price,
      features,
      popular,
      active,
      cta,
    };
  });

  const handleUpgrade = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({locale}),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.url) {
        const message =
          typeof data.error === "string"
            ? data.error
            : "We couldn't start the upgrade. Please check your configuration or try again.";
        setError(message);
        return;
      }

      window.location.href = data.url as string;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "We couldn't start the upgrade. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <ArrowLeft size={16} />
          <span>{t("backToDashboard")}</span>
        </button>

        {isTestMode && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3 text-sm text-amber-400">
            <FlaskConical size={16} className="shrink-0 mt-0.5" />
            <span>
              <strong>{t("stripeTestTitle")}</strong>{" "}
              {t("stripeTestBodyPrefix")}{" "}
              <code className="font-mono text-xs bg-amber-500/20 px-1.5 py-0.5 rounded">
                4242 4242 4242 4242
              </code>{" "}
              {t("stripeTestBodySuffix")}
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/70 bg-destructive/25 px-4 py-3 text-sm text-destructive-foreground flex items-start gap-2 shadow-lg shadow-destructive/30">
            <span className="mt-0.5 text-lg leading-none shrink-0">!</span>
            <p className="flex-1">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 mb-2">
          <h2 className="text-3xl font-bold text-foreground text-center">
            {t("title")}
          </h2>
          {isTestMode && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 font-medium whitespace-nowrap">
              {t("testModeBadge")}
            </span>
          )}
        </div>
        {isPro && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3 text-sm text-amber-200">
            <Sparkles size={18} className="shrink-0" />
            <span>{t("alreadyPro")}</span>
          </div>
        )}
        <p className="text-muted-foreground text-center mb-10">
          {t("subtitle")}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayPlans.map((planItem) => (
            <GlassCard
              key={planItem.name}
              className={`animate-fade-in flex flex-col h-full ${
                planItem.popular ? "border border-secondary/40" : ""
              } ${planItem.active ? "ring-1 ring-amber-500/30" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold text-foreground">
                  {planItem.name}
                </h3>
                {planItem.popular && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary/20 text-secondary font-medium">
                    {t("popularBadge")}
                  </span>
                )}
                {planItem.active && planItem.key === "pro" && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium flex items-center gap-1">
                    <Sparkles size={10} /> {t("activeBadge")}
                  </span>
                )}
              </div>
              <p className="text-3xl font-extrabold text-foreground mb-6">
                {planItem.price}
                <span className="text-sm font-normal text-muted-foreground">
                  {t("perMonth")}
                </span>
              </p>

              <ul className="space-y-3 mb-8">
                {planItem.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check size={14} className="text-secondary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={planItem.active || loading}
                onClick={!planItem.active ? handleUpgrade : undefined}
                className={`mt-auto w-full py-3 rounded-xl text-sm font-semibold transition-opacity flex items-center justify-center gap-2 ${
                  planItem.active
                    ? "glass text-muted-foreground cursor-default"
                    : "cursor-pointer bg-secondary text-secondary-foreground hover:opacity-90 disabled:opacity-60"
                }`}
              >
                {!planItem.active && loading && <Loader2 size={14} className="animate-spin" />}
                {planItem.cta}
              </button>
            </GlassCard>
          ))}
        </div>

        {isTestMode && (
          <p className="text-center text-xs text-muted-foreground/50 mt-8">
            {t("testModeDisclaimer")}
          </p>
        )}
      </div>
    </div>
  );
};

export default Upgrade;
