"use client";

import {useState, useEffect, useCallback} from "react";
import {useLocale, useTranslations} from "next-intl";
import {useRouter} from "../../i18n/navigation";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import GlassCard from "@/components/GlassCard";
import {useUser} from "@/contexts/UserContext";
import {
  BrainCircuit,
  Sparkles,
  TrendingDown,
  BarChart2,
  Users,
  Clock,
  Lock,
  Check,
  Euro,
  Zap,
  RefreshCw,
  AlertCircle,
  CalendarDays,
  Target,
  TrendingUp,
  Loader2,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type {AIRecommendation} from "@/lib/azure-ai";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "year" | "custom";

type TopMeeting = {
  id: string;
  title: string;
  cost: number;
  duration: number;
  people: number;
  date: string;
  efficiencyScore: number | null;
  aiInsight: string | null;
};

type InsightEntry = {
  meetingTitle: string;
  insight: string;
  efficiencyScore: number;
  date: string;
};

type InsightsData = {
  period: string;
  aiModel: string | null;
  kpis: {
    totalCost: number;
    avgEfficiencyScore: number | null;
    meetingsAnalyzed: number;
    estimatedSavings: number;
    totalMeetings: number;
    lowEfficiencyMeetings: number;
  };
  topMeetings: TopMeeting[];
  efficiencyDistribution: {
    high: number;
    medium: number;
    low: number;
    hasData: boolean;
  };
  costBreakdown: Array<{name: string; value: number; cost: number; color: string}>;
  recentInsights: InsightEntry[];
  debugMeetings: Array<{
    id: string;
    title: string;
    cost: number;
    duration: number;
    people: number;
    efficiencyScore: number | null;
    hasInsight: boolean;
    includedInAvgEfficiency: boolean;
    includedInMeetingsAnalyzed: boolean;
    isLowEfficiency: boolean;
    pollResponseCount: number;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtEur = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";

const PRIORITY_CONFIG: Record<
  Priority,
  {border: string; badge: string; label: string}
> = {
  high: {
    border: "border-l-red-500/70",
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    label: "HIGH",
  },
  medium: {
    border: "border-l-amber-500/70",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    label: "MEDIUM",
  },
  low: {
    border: "border-l-green-500/70",
    badge: "bg-green-500/15 text-green-400 border-green-500/30",
    label: "LOW",
  },
};

const REC_ICONS: Record<number, React.ElementType> = {
  0: Clock,
  1: Users,
  2: BarChart2,
  3: TrendingDown,
  4: Zap,
};

function RecommendationCard({
  rec,
  index,
}: {
  rec: AIRecommendation;
  index: number;
}) {
  const cfg = PRIORITY_CONFIG[rec.priority];
  const Icon = REC_ICONS[index % 5] ?? Zap;
  return (
    <div
      className={`glass rounded-2xl p-5 border-l-4 ${cfg.border} animate-fade-in`}
    >
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0 mt-0.5">
          <Icon size={16} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${cfg.badge}`}
            >
              {cfg.label}
            </span>
            {rec.savings != null && (
              <span className="text-xs text-muted-foreground">
                saves{" "}
                <span className="font-semibold text-foreground">
                  {fmtEur(rec.savings)}
                </span>
                <span className="text-muted-foreground/70"> / mo</span>
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {rec.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {rec.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({className}: {className?: string}) {
  return (
    <div
      className={`rounded-xl bg-white/[0.05] animate-pulse ${className ?? ""}`}
    />
  );
}

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIOD_KEYS: Period[] = ["week", "month", "year"];

// ─── FreeGate ─────────────────────────────────────────────────────────────────

function FreeGate({t}: {t: ReturnType<typeof useTranslations>}) {
  const router = useRouter();
  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 relative">
      <div className="blur-sm opacity-30 pointer-events-none select-none space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {v: "€8,420", l: "Meeting Cost"},
            {v: "68/100", l: "Efficiency"},
            {v: "47", l: "Analyzed"},
            {v: "€2,967", l: "Savings"},
          ].map((k) => (
            <div key={k.l} className="glass rounded-2xl p-5">
              <div className="text-2xl font-bold text-foreground">{k.v}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-4 sm:inset-8 flex items-center justify-center">
        <GlassCard className="w-full max-w-lg text-center animate-scale-in border border-secondary/20">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{
              background:
                "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
            }}
          >
            <Lock size={28} className="text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <BrainCircuit size={20} className="text-secondary" />
            <h2 className="text-2xl font-bold text-foreground">
              {t("freeTitle")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            {t("freeSubtitle")}
          </p>
          <ul className="space-y-2 mb-7 text-left max-w-xs mx-auto">
            {(
              [
                t("freeBenefit1"),
                t("freeBenefit2"),
                t("freeBenefit3"),
                t("freeBenefit4"),
              ] as string[]
            ).map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <Check size={14} className="text-secondary shrink-0 mt-0.5" />
                {b}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => router.push("/upgrade")}
            className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Sparkles size={15} />
            {t("freeCtaButton")}
          </button>
          <p className="mt-3 text-xs text-muted-foreground/60">
            €19 / month · cancel any time
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

// ─── Pro dashboard ────────────────────────────────────────────────────────────

const RECS_CACHE_KEY = "ai_insights_recommendations";

function getCachedRecs(): {recs: AIRecommendation[]; period: string} | null {
  try {
    const raw = sessionStorage.getItem(RECS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {recs: AIRecommendation[]; period: string};
  } catch {
    return null;
  }
}

function setCachedRecs(recs: AIRecommendation[], period: string) {
  try {
    sessionStorage.setItem(RECS_CACHE_KEY, JSON.stringify({recs, period}));
  } catch {
    // sessionStorage not available (e.g. SSR)
  }
}

function clearCachedRecs() {
  try {
    sessionStorage.removeItem(RECS_CACHE_KEY);
  } catch {
    // sessionStorage not available (e.g. SSR)
  }
}

function ProDashboard({t}: {t: ReturnType<typeof useTranslations>}) {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<
    AIRecommendation[] | null
  >(null);
  const [recsGeneratedAt, setRecsGeneratedAt] = useState<string | null>(null);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [recsGenerated, setRecsGenerated] = useState(false);
  const locale = useLocale();
  const router = useRouter();

  // Restore cached recommendations on mount (fallback until GET returns)
  useEffect(() => {
    const cached = getCachedRecs();
    if (cached) {
      setRecommendations(cached.recs);
      setRecsGenerated(true);
    }
  }, []);

  const periodKey =
    period === "custom" ? `custom:${customFrom}:${customTo}` : period;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setData(null);
    try {
      const params = new URLSearchParams({period});
      if (period === "custom" && customFrom && customTo) {
        params.set("from", customFrom);
        params.set("to", customTo);
      }
      const res = await fetch(`/api/insights?${params}`);
      if (!res.ok) throw new Error("Failed to load insights");
      const json: InsightsData = await res.json();
      setData(json);
      if (getCachedRecs()?.period !== periodKey) clearCachedRecs();
      setRecsError(null);

      // Always load persisted recommendations for this period (no cache so we get fresh data)
      const recsParams = new URLSearchParams({period});
      if (period === "custom" && customFrom && customTo) {
        recsParams.set("from", customFrom);
        recsParams.set("to", customTo);
      }
      const recsRes = await fetch(
        `/api/insights/recommendations?${recsParams}`,
        {cache: "no-store", credentials: "include"},
      );
      if (recsRes.ok) {
        const recsJson = (await recsRes.json()) as {
          recommendations: AIRecommendation[];
          generated_at: string | null;
        };
        const recs = Array.isArray(recsJson.recommendations)
          ? recsJson.recommendations
          : [];
        setRecommendations(recs.length > 0 ? recs : null);
        setRecsGenerated(recs.length > 0);
        setRecsGeneratedAt(recsJson.generated_at ?? null);
        if (recs.length > 0) setCachedRecs(recs, periodKey);
      } else {
        setRecommendations(null);
        setRecsGenerated(false);
        setRecsGeneratedAt(null);
      }
    } catch (e) {
      console.error("Insights fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [period, customFrom, customTo, periodKey]);

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;
    fetchData();
  }, [fetchData, period, customFrom, customTo]);

  const generateRecommendations = async () => {
    if (!data) return;
    setIsLoadingRecs(true);
    setRecsError(null);
    try {
      // Use filter key (week|month|year|custom) for storage, not the insights label (e.g. "last 30 days")
      const payload: Record<string, unknown> = {
        totalCost: data.kpis.totalCost,
        avgEfficiencyScore: data.kpis.avgEfficiencyScore ?? 0,
        totalMeetings: data.kpis.totalMeetings,
        lowEfficiencyMeetings: data.kpis.lowEfficiencyMeetings,
        topMeetings: data.topMeetings.map((m) => ({
          title: m.title,
          cost: m.cost,
          duration: m.duration,
          people: m.people,
        })),
        period,
        locale,
      };
      if (period === "custom" && customFrom && customTo) {
        payload.from = customFrom;
        payload.to = customTo;
      }
      const res = await fetch("/api/insights/recommendations", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "no_ai_configured") {
          setRecsError("configure_ai");
        } else {
          setRecsError(json.message ?? "AI generation failed");
        }
        return;
      }
      setRecommendations(json.recommendations);
      setRecsGenerated(true);
      setRecsGeneratedAt(json.generated_at ?? null);
      setCachedRecs(json.recommendations, periodKey);
    } catch (e) {
      setRecsError(String(e));
    } finally {
      setIsLoadingRecs(false);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 overflow-y-auto overflow-x-hidden pb-24 md:pb-6 lg:pb-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
              }}
            >
              <BrainCircuit size={20} className="text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("title")}</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground pl-0 sm:pl-[52px]">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium border"
            style={{
              background:
                "linear-gradient(135deg, hsla(45,90%,55%,0.12), hsla(32,90%,50%,0.08))",
              borderColor: "hsla(45,90%,55%,0.25)",
              color: "hsl(45,90%,65%)",
            }}
          >
            <Sparkles size={11} />
            {data?.aiModel
              ? t("poweredByModel", {model: data.aiModel})
              : t("poweredBy")}
          </span>
          <button
            type="button"
            onClick={fetchData}
            disabled={isLoading}
            className="p-2 rounded-xl glass hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Refresh data"
          >
            <RefreshCw
              size={14}
              className={isLoading ? "animate-spin" : ""}
            />
          </button>
          {data && (
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams({period});
                if (period === "custom" && customFrom && customTo) {
                  params.set("from", customFrom);
                  params.set("to", customTo);
                }
                router.push(`/ai-insights/details?${params.toString()}`);
              }}
              className="px-3 py-1.5 rounded-xl glass text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("detailsButton")}
            </button>
          )}
        </div>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-1 p-1 rounded-xl glass w-fit">
        {PERIOD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === key
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(
              key === "week"
                ? "filter7Days"
                : key === "month"
                ? "filter30Days"
                : "filter12Months",
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPeriod("custom")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            period === "custom"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("filterCustom")}
        </button>
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-muted-foreground" />
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg glass border border-white/10 bg-transparent text-foreground"
            />
          </div>
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg glass border border-white/10 bg-transparent text-foreground"
          />
        </div>
      )}

      {/* KPIs — stacked on mobile like dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({length: 4}).map((_, i) => (
            <SkeletonBlock key={i} className="h-28" />
          ))
        ) : (
          <>
            <KpiTile
              title={t("kpiCostTitle")}
              value={data ? fmtEur(data.kpis.totalCost) : "—"}
              sub={
                data
                  ? t("kpiCostSub", {count: data.kpis.totalMeetings})
                  : undefined
              }
              icon={Euro}
              accent="gradient-orange-red"
              info={t("kpiCostInfo")}
            />
            <KpiTile
              title={t("kpiEfficiencyTitle")}
              value={
                data?.kpis.avgEfficiencyScore != null
                  ? `${Math.round(data.kpis.avgEfficiencyScore)}`
                  : "—"
              }
              sub={
                data?.kpis.avgEfficiencyScore != null
                  ? t("kpiEfficiencySuffix")
                  : t("kpiEfficiencyEmpty")
              }
              icon={Target}
              accent="gradient-blue-cyan"
              info={t("kpiEfficiencyInfo")}
            />
            <KpiTile
              title={t("kpiAnalyzedTitle")}
              value={data ? String(data.kpis.meetingsAnalyzed) : "—"}
              sub={
                data
                  ? t("kpiAnalyzedSub", {
                      analyzed: data.kpis.meetingsAnalyzed,
                      total: data.kpis.totalMeetings,
                    })
                  : undefined
              }
              icon={BrainCircuit}
              accent="gradient-purple-blue"
              info={t("kpiAnalyzedInfo")}
            />
            <KpiTile
              title={t("kpiSavingsTitle")}
              value={data ? fmtEur(data.kpis.estimatedSavings) : "—"}
              sub={
                data
                  ? t("kpiSavingsSub", {
                      count: data.kpis.lowEfficiencyMeetings,
                    })
                  : undefined
              }
              icon={TrendingDown}
              accent="gradient-cyan-green"
              info={t("kpiSavingsInfo")}
            />
          </>
        )}
      </div>

      {/* Recommendations + Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr,380px] gap-6">
        {/* Recommendations */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("recommendationsTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("recommendationsSubtitle")}
              </p>
              {recommendations &&
                recommendations.length > 0 &&
                recsGeneratedAt && (
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {t("recommendationsLastUpdated", {
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(recsGeneratedAt)),
                    })}
                  </p>
                )}
            </div>
            <button
              type="button"
              onClick={generateRecommendations}
              disabled={isLoadingRecs || isLoading || !data}
              className="relative flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] shadow-lg w-full sm:w-auto"
              style={{
                background:
                  "linear-gradient(135deg, hsl(270,65%,55%), hsl(232,70%,55%), hsl(190,75%,45%))",
                boxShadow:
                  "0 4px 18px hsla(250,65%,55%,0.45), inset 0 1px 0 hsla(0,0%,100%,0.15)",
              }}
            >
              {isLoadingRecs ? (
                <Loader2 size={15} className="animate-spin shrink-0" />
              ) : (
                <Sparkles size={15} className="shrink-0" />
              )}
              <span>
                {isLoadingRecs ? t("generateLoading") : t("generateCta")}
              </span>
            </button>
          </div>

          {/* How it works — collapsible */}
          <HowItWorksPanel t={t} />

          {isLoadingRecs && (
            <div className="space-y-3">
              {Array.from({length: 4}).map((_, i) => (
                <SkeletonBlock key={i} className="h-20" />
              ))}
            </div>
          )}

          {recsError === "configure_ai" && (
            <GlassCard className="border border-amber-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={18}
                  className="text-amber-400 shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {t("aiProviderNotConfiguredTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("aiProviderNotConfiguredBodyPrefix")}{" "}
                    <code className="text-xs px-1 py-0.5 rounded bg-white/10">
                      AZURE_OPENAI_ENDPOINT
                    </code>{" "}
                    {t("aiProviderNotConfiguredAnd")}{" "}
                    <code className="text-xs px-1 py-0.5 rounded bg-white/10">
                      AZURE_OPENAI_API_KEY
                    </code>{" "}
                    {t("aiProviderNotConfiguredIn")}{" "}
                    <code className="text-xs px-1 py-0.5 rounded bg-white/10">
                      .env.local
                    </code>{" "}
                    {t("aiProviderNotConfiguredEnable")}{" "}
                    <code className="text-xs px-1 py-0.5 rounded bg-white/10">
                      OPENAI_API_KEY
                    </code>
                    .
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {recsError && recsError !== "configure_ai" && (
            <GlassCard className="border border-red-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={18}
                  className="text-red-400 shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {t("aiGenerationFailed")}
                  </p>
                  <p className="text-xs text-muted-foreground">{recsError}</p>
                </div>
              </div>
            </GlassCard>
          )}

          {!isLoadingRecs &&
            !recsError &&
            !recsGenerated &&
            !isLoading &&
            data && (
              <div className="glass rounded-2xl p-8 text-center border border-dashed border-white/10">
                <BrainCircuit
                  size={32}
                  className="text-muted-foreground/40 mx-auto mb-3"
                />
                <p className="text-sm text-muted-foreground mb-1">
                  {t("noRecommendationsTitle")}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {t("noRecommendationsBody")}
                </p>
              </div>
            )}

          {recommendations && recommendations.length > 0 && (
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <RecommendationCard key={i} rec={rec} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: charts */}
        <div className="space-y-6">
          {/* Cost breakdown */}
          <GlassCard>
            <h2 className="text-sm font-semibold text-foreground mb-4">
              {t("costBreakdownTitle")}
            </h2>
            {isLoading ? (
              <SkeletonBlock className="h-52" />
            ) : data && data.costBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.costBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.costBreakdown.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <ReTooltip
                    content={({active, payload}) => {
                      if (!active || !payload?.length) return null;
                      const entry = payload[0]?.payload as {name: string; value: number; cost: number; color: string} | undefined;
                      if (!entry) return null;
                      return (
                        <div
                          style={{
                            background: "hsl(237,56%,10%)",
                            border: "1px solid hsl(237,30%,22%)",
                            borderRadius: "12px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "hsl(210,40%,96%)",
                          }}
                        >
                          <p style={{fontWeight: 600, marginBottom: 2}}>{entry.name}</p>
                          <p style={{color: "hsl(210,20%,65%)"}}>{entry.value}% · {fmtEur(entry.cost)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => (
                      <span
                        style={{color: "hsl(210,20%,65%)", fontSize: 11}}
                      >
                        {v}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-10">
                No cost data for this period
              </p>
            )}
          </GlassCard>

          {/* Efficiency distribution */}
          <GlassCard>
            <h2 className="text-sm font-semibold text-foreground mb-4">
              {t("efficiencyTitle")}
            </h2>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({length: 3}).map((_, i) => (
                  <SkeletonBlock key={i} className="h-8" />
                ))}
              </div>
            ) : data && data.efficiencyDistribution.hasData ? (
              <div className="space-y-3">
                {[
                  {
                    label: t("efficiencyHigh"),
                    pct: data.efficiencyDistribution.high,
                    bar: "bg-green-500/70",
                  },
                  {
                    label: t("efficiencyMedium"),
                    pct: data.efficiencyDistribution.medium,
                    bar: "bg-amber-500/70",
                  },
                  {
                    label: t("efficiencyLow"),
                    pct: data.efficiencyDistribution.low,
                    bar: "bg-red-500/60",
                  },
                ].map(({label, pct, bar}) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{label}</span>
                      <span className="font-medium text-foreground">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bar}`}
                        style={{width: `${pct}%`, transition: "width 1s ease"}}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                {t("efficiencyEmptyHint")}
              </p>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Recent AI insights from meetings */}
      {(isLoading || (data && data.recentInsights.length > 0)) && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-4">
            <BrainCircuit size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Recent Meeting Insights
            </h2>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({length: 3}).map((_, i) => (
                <SkeletonBlock key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {data!.recentInsights.map((ins, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 px-4 py-3 rounded-xl bg-white/[0.03]"
                >
                  <div
                    className={`text-xs font-bold min-w-[44px] text-right mt-0.5 ${scoreColor(ins.efficiencyScore)}`}
                  >
                    {Math.round(ins.efficiencyScore)}/100
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {ins.meetingTitle}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {ins.insight}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0">
                    {fmtDate(ins.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}


      <p className="text-xs text-muted-foreground/50 text-center pb-2">
        {t("lastUpdated")}
      </p>
    </main>
  );
}

// ─── How It Works panel ───────────────────────────────────────────────────────

function HowItWorksPanel({t}: {t: ReturnType<typeof useTranslations>}) {
  const [open, setOpen] = useState(false);

  const sections = [
    {
      title: t("howItWorksEfficiencyTitle"),
      body: t("howItWorksEfficiencyBody"),
    },
    {
      title: t("howItWorksSavingsTitle"),
      body: t("howItWorksSavingsBody"),
    },
    {
      title: t("howItWorksRecsTitle"),
      body: t("howItWorksRecsBody"),
    },
  ];

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors group"
      >
        <HelpCircle size={12} className="shrink-0" />
        <span>{t("howItWorksTitle")}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {sections.map(({title, body}) => (
            <div
              key={title}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                {title}
              </p>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiTile({
  title,
  value,
  sub,
  icon: Icon,
  accent,
  info,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  info?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-2xl overflow-hidden animate-fade-in">
      <div className={`px-5 py-3 flex items-center gap-2 ${accent}`}>
        <Icon size={16} className="text-foreground/80 shrink-0" />
        <span className="text-xs font-medium text-foreground/90 leading-tight flex-1">
          {title}
        </span>
        {info && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="p-0.5 rounded-full text-foreground/50 hover:text-foreground/90 transition-colors"
              aria-label="How is this calculated?"
            >
              <HelpCircle size={13} />
            </button>
            {open && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOpen(false)}
                />
                <div className="absolute right-0 top-6 z-20 w-64 rounded-xl border border-white/10 bg-[hsl(237,56%,10%)] shadow-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
                  {info}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="text-3xl font-bold text-foreground">{value}</div>
        {sub && (
          <div className="text-xs text-muted-foreground mt-1">{sub}</div>
        )}
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function AiInsightsPage() {
  const t = useTranslations("insights");
  const {plan} = useUser();
  const isPro = plan === "pro";

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {isPro ? <ProDashboard t={t} /> : <FreeGate t={t} />}
      </div>
    </div>
  );
}
