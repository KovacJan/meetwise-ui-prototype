"use client";

import {useState, useTransition, useEffect, useCallback} from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getCostTrendForPeriod,
  getTimeTrendForPeriod,
  type FilterPeriod,
} from "@/app/[locale]/(dashboard)/dashboard/actions";
import { buildDashboardPeriodRange } from "@/lib/dashboard-period-range";
import {formatDurationMinutes} from "@/lib/meeting-metrics";
import {useLocale, useTranslations} from "next-intl";

// ─── helpers ───────────────────────────────────────────────────────────────

const fmtEur = (v: number, locale: string = "en-GB") =>
  new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const costTickFmt = (v: number) =>
  v === 0 ? "€0" : v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`;

const timeTickFmt = (v: number, locale: string) => {
  if (v === 0) return "0";
  if (v < 60) return `${v}m`;
  const h = Math.round(v / 60);
  return locale === "de" ? `${h}h` : `${h}h`;
};

// ─── custom tooltip ────────────────────────────────────────────────────────

export type NoCostReasons = {
  hasSyncedCalendar: boolean;
  hasMeetingsInPeriod: boolean;
  hasTeamMembersWithRate: boolean;
  hasMatchingAttendeesInPeriod: boolean;
};

export type MetricsChartMode = "cost" | "time";

interface CostTrendChartProps {
  period: FilterPeriod;
  customFrom?: string;
  customTo?: string;
  /** Bump this to force a reload after calendar sync/clear */
  refreshToken?: number;
  /** Members always use `time`; leaders can switch. */
  mode?: MetricsChartMode;
}

function CustomTooltipWithLocale({
  active,
  payload,
  label,
  locale,
  mode,
}: {
  active?: boolean;
  payload?: {value: number}[];
  label?: string;
  locale: string;
  mode: MetricsChartMode;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-sm shadow-xl"
      style={{
        background: "hsl(237,56%,16%)",
        border: "1px solid hsla(0,0%,100%,0.12)",
        color: "white",
      }}
    >
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className="font-bold">
        {mode === "cost"
          ? fmtEur(value, locale)
          : formatDurationMinutes(value, locale)}
      </p>
    </div>
  );
}

export default function CostTrendChart({
  period,
  customFrom = "",
  customTo = "",
  refreshToken,
  mode = "cost",
}: CostTrendChartProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [points, setPoints] = useState<{label: string; cost: number}[]>([]);
  const [noCostReasons, setNoCostReasons] = useState<NoCostReasons | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;
    const [from, to] = buildDashboardPeriodRange(period, customFrom, customTo);
    startTransition(async () => {
      if (mode === "time") {
        const result = await getTimeTrendForPeriod(from, to, locale);
        setPoints(result.points);
        setNoCostReasons(undefined);
      } else {
        const result = await getCostTrendForPeriod(from, to, locale);
        setPoints(result.points);
        setNoCostReasons(result.noCostReasons);
      }
    });
  }, [period, customFrom, customTo, locale, mode]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const hasCostValues = points.some((p) => p.cost > 0);
  const hasMeetingsInPeriod = noCostReasons?.hasMeetingsInPeriod ?? false;

  const costHintReasons: string[] = [];
  if (mode === "cost" && hasMeetingsInPeriod && !hasCostValues) {
    if (!noCostReasons?.hasTeamMembersWithRate) {
      costHintReasons.push(t("noCostDataReasonRates"));
    }
    if (
      noCostReasons?.hasTeamMembersWithRate &&
      !noCostReasons.hasMatchingAttendeesInPeriod
    ) {
      costHintReasons.push(t("noCostDataReasonEmails"));
    }
  }

  const showEmptyCostPanel =
    mode === "cost" &&
    !isPending &&
    points.length > 0 &&
    !hasMeetingsInPeriod;

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-foreground text-sm">
          {mode === "cost" ? t("costTrend") : t("timeTrend")}
        </h3>
        {isPending && (
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{
              borderColor: "hsla(232,42%,53%,0.25)",
              borderTopColor: "hsl(232,42%,53%)",
            }}
          />
        )}
      </div>

      {showEmptyCostPanel && (() => {
        const showUnsynced = !noCostReasons?.hasSyncedCalendar;
        const showNoMeetingsInPeriod =
          !!noCostReasons?.hasSyncedCalendar &&
          !noCostReasons.hasMeetingsInPeriod;
        const showNoRates =
          !noCostReasons?.hasMeetingsInPeriod &&
          (!noCostReasons || !noCostReasons.hasTeamMembersWithRate);
        const showNoMatch =
          !!noCostReasons?.hasMeetingsInPeriod &&
          noCostReasons.hasTeamMembersWithRate &&
          !noCostReasons.hasMatchingAttendeesInPeriod;
        const reasons: string[] = [];
        if (showUnsynced) reasons.push(t("noCostDataReasonUnsynced"));
        if (showNoMeetingsInPeriod) reasons.push(t("noCostDataReasonNoMeetings"));
        if (showNoRates) reasons.push(t("noCostDataReasonRates"));
        if (showNoMatch) reasons.push(t("noCostDataReasonEmails"));
        return (
          <div className="flex items-center justify-center h-52">
            <div className="max-w-md w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 space-y-2 text-xs sm:text-sm">
              <p className="font-medium text-white/80">{t("noCostDataTitle")}</p>
              {reasons.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-white/60">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      {!isPending && points.length === 0 && (
        <div className="flex items-center justify-center h-52">
          <div className="max-w-md w-full rounded-xl border border-white/8 bg-white/[0.015] px-4 py-3 text-xs sm:text-sm text-white/70 text-center">
            {t("noDataForPeriod")}
          </div>
        </div>
      )}

      {(isPending || (points.length > 0 && !showEmptyCostPanel)) && (
        <div style={{opacity: isPending ? 0.4 : 1, transition: "opacity 0.3s"}}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={points}
              margin={{top: 4, right: 4, left: 0, bottom: 0}}
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="hsl(232,60%,65%)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(190,70%,55%)"
                    stopOpacity={0.0}
                  />
                </linearGradient>
                <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(232,60%,65%)" />
                  <stop offset="100%" stopColor="hsl(190,70%,55%)" />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsla(237,30%,30%,0.4)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="transparent"
                tick={{fill: "hsl(230,20%,50%)", fontSize: 11}}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="transparent"
                tick={{fill: "hsl(230,20%,50%)", fontSize: 11}}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  mode === "cost" ? costTickFmt(v) : timeTickFmt(v, locale)
                }
                width={48}
              />
              <Tooltip
                content={<CustomTooltipWithLocale locale={locale} mode={mode} />}
                cursor={{stroke: "hsla(0,0%,100%,0.08)", strokeWidth: 1}}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="url(#strokeGradient)"
                strokeWidth={2.5}
                fill="url(#trendGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "hsl(232,60%,65%)",
                  stroke: "hsl(237,56%,13%)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
          {costHintReasons.length > 0 && (
            <ul className="mt-3 list-disc list-inside space-y-1 text-xs text-white/55">
              {costHintReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
