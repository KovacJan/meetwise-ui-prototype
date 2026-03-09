"use client";

import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {useSearchParams} from "next/navigation";
import {useRouter} from "i18n/navigation";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import GlassCard from "@/components/GlassCard";
import {EfficiencyGauge} from "@/components/EfficiencyGauge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";

type DebugMeeting = {
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
};

type InsightsDebugResponse = {
  kpis: {
    totalCost: number;
    avgEfficiencyScore: number | null;
    meetingsAnalyzed: number;
    estimatedSavings: number;
    totalMeetings: number;
    lowEfficiencyMeetings: number;
  };
  debugMeetings: DebugMeeting[];
};

const fmtEur = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

export default function AiInsightsDetailsPage() {
  const t = useTranslations("insights");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<InsightsDebugResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const period = searchParams.get("period") ?? "month";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({period});
        if (period === "custom" && from && to) {
          params.set("from", from);
          params.set("to", to);
        }
        const res = await fetch(`/api/insights?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load insights details");
        const json = (await res.json()) as InsightsDebugResponse;
        setData(json);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [period, from, to]);

  const goBack = () => {
    const params = new URLSearchParams({period});
    if (period === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    const search = params.toString();
    router.push(search ? `/ai-insights?${search}` : "/ai-insights");
  };

  const reasonForMeeting = (m: DebugMeeting): string => {
    if (m.includedInMeetingsAnalyzed) return t("detailsReasonAnalyzed");
    if (!m.hasInsight && m.pollResponseCount === 0)
      return t("detailsReasonNoPollNoInsight");
    if (!m.hasInsight && m.pollResponseCount > 0)
      return t("detailsReasonHasPollNoInsight");
    if (m.efficiencyScore == null) return t("detailsReasonNoScore");
    return t("detailsReasonOther");
  };

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 overflow-y-auto overflow-x-hidden pb-24 md:pb-6 lg:pb-8">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
              >
                <span>←</span>
                <span>{t("detailsBack")}</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {t("detailsTitle")}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
                {t("detailsSubtitle")}
              </p>
            </div>
          </div>

          <GlassCard>
            {isLoading || !data ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-3 w-28 rounded bg-white/[0.06]" />
                  <div className="h-36 w-full rounded-xl bg-white/[0.04]" />
                  <div className="h-3 w-36 rounded bg-white/[0.06]" />
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="h-3 w-28 rounded bg-white/[0.06]" />
                  <div className="h-36 w-full rounded-xl bg-white/[0.04]" />
                  <div className="h-3 w-20 rounded bg-white/[0.06]" />
                </div>
                <div className="flex flex-col gap-3">
                  {Array.from({length: 4}).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/[0.04]" />
                  ))}
                </div>
              </div>
            ) : (() => {
              const answeredCount = data.debugMeetings.filter(
                (m) => m.pollResponseCount > 0,
              ).length;
              const unansweredCount = data.kpis.totalMeetings - answeredCount;
              const pollData = [
                {name: t("detailsPollsAnswered"), value: answeredCount},
                {name: t("detailsPollsUnanswered"), value: unansweredCount},
              ];
              return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                  {/* ── Column 1: Efficiency Gauge ── */}
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 text-center">
                      {t("kpiEfficiencyTitle")}
                    </p>
                    <div className="w-full h-44 max-w-[220px] flex items-center justify-center">
                      <EfficiencyGauge score={data.kpis.avgEfficiencyScore} />
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 text-center leading-snug">
                      {t("detailsExplanation")}
                    </p>
                  </div>

                  {/* ── Column 2: Poll Coverage Pie ── */}
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                      {t("detailsPollsTitle")}
                    </p>
                    {data.kpis.totalMeetings === 0 ? (
                      <p className="text-xs text-muted-foreground mt-4">
                        {t("detailsPollsEmpty")}
                      </p>
                    ) : (
                      <>
                        <div className="w-full h-44 max-w-[220px] mx-auto">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pollData}
                                cx="50%"
                                cy="50%"
                                innerRadius={48}
                                outerRadius={68}
                                paddingAngle={3}
                                dataKey="value"
                                strokeWidth={0}
                              >
                                <Cell fill="hsl(190, 80%, 55%)" />
                                <Cell fill="hsl(230, 15%, 30%)" />
                              </Pie>
                              <ReTooltip
                                content={({active, payload}) => {
                                  if (!active || !payload?.length) return null;
                                  const p = payload[0];
                                  return (
                                    <div className="rounded-xl border border-white/10 bg-background/95 px-3 py-2 text-[11px] text-foreground shadow-lg">
                                      <div className="font-semibold">{p.name}</div>
                                      <div className="text-muted-foreground">{p.value as number}</div>
                                    </div>
                                  );
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[hsl(190,80%,55%)]" />
                            {t("detailsPollsAnswered")}: <span className="font-semibold text-foreground">{answeredCount}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[hsl(230,15%,35%)]" />
                            {t("detailsPollsUnanswered")}: <span className="font-semibold text-foreground">{unansweredCount}</span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── Column 3: Key Stats ── */}
                  <div className="flex flex-col justify-center gap-3">
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex flex-col gap-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                        {t("kpiAnalyzedTitle")}
                      </p>
                      <p className="text-2xl font-bold text-foreground leading-tight">
                        {data.kpis.meetingsAnalyzed}
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                          / {data.kpis.totalMeetings}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 leading-snug">
                        {t("detailsStatAnalyzedSub")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex flex-col gap-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                        {t("kpiSavingsTitle")}
                      </p>
                      <p className="text-2xl font-bold text-foreground leading-tight">
                        {fmtEur(data.kpis.estimatedSavings)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 leading-snug">
                        {t("detailsStatSavingsSub")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex flex-col gap-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                        {t("kpiCostTitle")}
                      </p>
                      <p className="text-2xl font-bold text-foreground leading-tight">
                        {fmtEur(data.kpis.totalCost)}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 leading-snug">
                        {t("detailsStatCostSub")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex flex-col gap-1">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
                        {t("kpiLowEffTitle")}
                      </p>
                      <p className="text-2xl font-bold text-foreground leading-tight">
                        {data.kpis.lowEfficiencyMeetings}
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                          / {data.kpis.totalMeetings}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 leading-snug">
                        {t("detailsStatLowEffSub")}
                      </p>
                    </div>
                  </div>

                </div>
              );
            })()}
          </GlassCard>

          <GlassCard>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t("detailsTableTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              {t("detailsTableSubtitle")}
            </p>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs text-muted-foreground border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-[11px] text-muted-foreground/70">
                    <th className="text-left font-medium">
                      {t("detailsColTitle")}
                    </th>
                    <th className="text-right font-medium">
                      {t("detailsColEff")}
                    </th>
                    <th className="text-right font-medium">
                      {t("detailsColCost")}
                    </th>
                    <th className="text-center font-medium">
                      {t("detailsColPollAnswers")}
                    </th>
                    <th className="text-center font-medium">
                      {t("detailsColInAvg")}
                    </th>
                    <th className="text-center font-medium">
                      {t("detailsColAnalyzed")}
                    </th>
                    <th className="text-center font-medium">
                      {t("detailsColLowEff")}
                    </th>
                    <th className="text-left font-medium">
                      {t("detailsColReason")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading || !data
                    ? Array.from({length: 5}).map((_, i) => (
                        <tr key={i}>
                          <td
                            colSpan={8}
                            className="px-2 py-2 text-center text-muted-foreground/60"
                          >
                            …
                          </td>
                        </tr>
                      ))
                    : data.debugMeetings.map((m) => (
                        <tr
                          key={m.id}
                          className="bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                        >
                          <td className="px-2 py-1.5 text-foreground max-w-[220px] truncate">
                            {m.title}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {m.efficiencyScore != null
                              ? `${Math.round(m.efficiencyScore)}/100`
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {fmtEur(m.cost)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {m.pollResponseCount}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {m.includedInAvgEfficiency ? "✓" : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {m.includedInMeetingsAnalyzed ? "✓" : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {m.isLowEfficiency ? "✓" : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-left">
                            {reasonForMeeting(m)}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </main>
      </div>
    </div>
  );
}

