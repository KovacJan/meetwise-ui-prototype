"use client";

import {useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import {useUser} from "@/contexts/UserContext";
import KpiCard from "@/components/KpiCard";
import ForecastKpiCard from "@/components/ForecastKpiCard";
import CostTrendChart from "@/components/CostTrendChart";
import RecentMeetings from "@/components/RecentMeetings";
import CostDebugPanel from "@/components/CostDebugPanel";
import {useRouter} from "../../i18n/navigation";
import Loader from "@/components/Loader";
import {AppDatePicker} from "@/components/AppDatePicker";
import type {FilterPeriod, DebugPeriod} from "@/app/[locale]/(dashboard)/dashboard/actions";
import {DollarSign, TrendingUp, BarChart3, PlugZap} from "lucide-react";

// ─── period filter ids (labels resolved inside component via t()) ───────────

const PERIOD_IDS: FilterPeriod[] = ["week", "month", "year", "custom"];

// ─── types ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

type ManagerDashboardProps = {
  weeklyCost: number;
  monthlyCost: number;
  annualCost: number;
  errorMessage?: string;
  showTeamSetupCta?: boolean;
  calendarConnected?: boolean;
};

// ─── component ─────────────────────────────────────────────────────────────

const ManagerDashboard = ({
  weeklyCost,
  monthlyCost,
  annualCost,
  errorMessage,
  showTeamSetupCta,
  calendarConnected = false,
}: ManagerDashboardProps) => {
  const tDash = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const {displayName} = useUser();

  const PERIOD_TABS = PERIOD_IDS.map((id) => ({
    id,
    label: tDash(
      id === "week" ? "periodWeek" :
      id === "month" ? "periodMonth" :
      id === "year" ? "periodYear" : "periodCustom"
    ),
  }));

  // Local KPI state so we can refresh after exclusions
  const [kpis, setKpis] = useState({
    weeklyCost,
    monthlyCost,
    annualCost,
  });

  // Shared analytics period (controls both chart and meetings list)
  const [period, setPeriod] = useState<FilterPeriod>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Triggers reload of chart & meetings after sync/clear
  const [refreshToken, setRefreshToken] = useState(0);

  // Sync calendar
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isCalendarConnected, setIsCalendarConnected] = useState(calendarConnected);

  // Dev cost debug panel
  const [debugPeriod, setDebugPeriod] = useState<DebugPeriod | null>(null);

  // Refresh KPIs from server without a full page reload
  const refreshKpis = async () => {
    try {
      const res = await fetch("/api/dashboard-kpis");
      if (!res.ok) return;
      const updated = await res.json();
      setKpis({
        weeklyCost: updated.weeklyCost ?? kpis.weeklyCost,
        monthlyCost: updated.monthlyCost ?? kpis.monthlyCost,
        annualCost: updated.annualCost ?? kpis.annualCost,
      });
    } catch {
      // Ignore errors; KPIs just won't update
    }
  };

  const handleSync = async () => {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-calendar", {method: "POST"});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMessage(
          typeof data.error === "string" ? data.error : tDash("syncError"),
        );
      } else {
        const count = data.synced ?? 0;
        const total = data.total;
        setSyncMessage(
          total
            ? tDash("syncedMeetingsOf", {count, total})
            : tDash("syncedMeetings", {count}),
        );
        // Calendar is definitely connected if sync succeeds
        setIsCalendarConnected(true);
        // Refresh KPI cards (they use local state, so fetch fresh values)
        await refreshKpis();
        // Refresh charts and meetings list
        setRefreshToken((v) => v + 1);
        router.refresh();
        // Also refresh pending polls count badge in sidebar
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("polls:refresh"));
        }
      }
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : tDash("syncError"));
    } finally {
      setSyncing(false);
    }
  };

  // Date-based subtitles for KPI cards
  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat(
    locale === "de" ? "de-DE" : "en-US",
    {
      month: "long",
      year: "numeric",
    },
  ).format(now);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const fmtDMY = (d: Date) =>
    `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const yearToDateLabel = `${fmtDMY(yearStart)} - ${fmtDMY(now)}`;

  return (
    <div className="flex w-full min-w-0">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <TopBar />
        <main className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8 pb-24 md:pb-6 lg:pb-8 overflow-x-hidden">

          {/* Error banner */}
          {errorMessage && (
            <div className="mb-4 sm:mb-6 rounded-xl border border-destructive/70 bg-destructive/20 px-4 py-3 text-sm text-destructive-foreground flex items-start gap-2 shadow-lg shadow-destructive/30 max-w-2xl w-full">
              <span className="mt-0.5 text-lg leading-none">!</span>
              <p className="flex-1">{errorMessage}</p>
            </div>
          )}

          {/* No-team CTA */}
          {showTeamSetupCta && (
            <div className="mb-6 sm:mb-8 flex flex-col items-center justify-center rounded-2xl border border-secondary/30 bg-card/50 px-4 sm:px-6 py-8 sm:py-12 text-center animate-fade-in">
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {tDash("noTeamTitle")}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                {tDash("noTeamDesc")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/onboarding")}
                  className="px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  {tDash("createTeam")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/onboarding")}
                  className="px-5 py-2.5 rounded-xl glass text-sm font-semibold text-foreground hover:bg-secondary/20 transition-colors"
                >
                  {tDash("joinTeam")}
                </button>
              </div>
            </div>
          )}

          {/* ── KPI cards ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <KpiCard
              title={tDash("weeklyCost")}
              value={formatCurrency(kpis.weeklyCost)}
              icon={<DollarSign size={16} className="text-foreground/80" />}
              gradient="purple-blue"
              subtitle={tDash("weeklyCostSubtitle")}
              onDetailOpen={() => setDebugPeriod("week")}
            />
            <KpiCard
              title={tDash("monthlyCost")}
              value={formatCurrency(kpis.monthlyCost)}
              icon={<TrendingUp size={16} className="text-foreground/80" />}
              gradient="blue-cyan"
              subtitle={monthLabel}
              onDetailOpen={() => setDebugPeriod("month")}
            />
            <KpiCard
              title={tDash("annualCost")}
              value={formatCurrency(kpis.annualCost)}
              icon={<BarChart3 size={16} className="text-foreground/80" />}
              gradient="cyan-green"
              subtitle={yearToDateLabel}
              onDetailOpen={() => setDebugPeriod("year")}
            />
            <ForecastKpiCard
              monthlyCost={kpis.monthlyCost}
              annualCost={kpis.annualCost}
            />
          </div>

          {/* Dev cost breakdown drawer */}
          {debugPeriod && (
            <CostDebugPanel
              period={debugPeriod}
              onClose={() => setDebugPeriod(null)}
            />
          )}

          {/* ── Shared period selector: tabs and custom dates on one row ───── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-5">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
              <div
                className="flex items-center gap-0.5 rounded-xl p-1 shrink-0 overflow-x-auto max-w-full"
                style={{
                  background: "hsla(0,0%,100%,0.04)",
                  border: "1px solid hsla(0,0%,100%,0.08)",
                }}
              >
                {PERIOD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setPeriod(tab.id);
                    }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 shrink-0 touch-manipulation ${
                      period === tab.id
                        ? "text-white"
                        : "text-white/30 hover:text-white/55"
                    }`}
                    style={
                      period === tab.id
                        ? {
                            background: "hsla(232,42%,53%,0.45)",
                            boxShadow: "0 1px 5px hsla(232,42%,53%,0.35)",
                          }
                        : {}
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Custom date inputs – same row as tabs; app-styled calendar popup */}
              {period === "custom" && (
                <div className="flex items-center gap-3 flex-wrap">
                  <AppDatePicker
                    label={tDash("periodFrom")}
                    value={customFrom}
                    onChange={setCustomFrom}
                    placeholder={tDash("periodFromPlaceholder")}
                  />
                  <AppDatePicker
                    label={tDash("periodTo")}
                    value={customTo}
                    onChange={setCustomTo}
                    placeholder={tDash("periodToPlaceholder")}
                  />
                </div>
              )}
            </div>

            {/* Calendar connection status + actions */}
            {!showTeamSetupCta && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isCalendarConnected ? "bg-emerald-400" : "bg-white/30"
                    }`}
                  />
                  <span className="flex items-center gap-1 text-white/60">
                    <PlugZap size={11} className="opacity-70" />
                    {isCalendarConnected
                      ? tDash("calendarConnected")
                      : tDash("calendarDisconnected")}
                  </span>
                </div>

                {syncMessage && (
                  <span className="text-muted-foreground">{syncMessage}</span>
                )}

                {isCalendarConnected ? (
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-3 py-2 sm:py-1 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2 touch-manipulation min-h-[40px] sm:min-h-0"
                  >
                    {syncing ? (
                      <>
                        <Loader variant="inline" className="text-muted-foreground" />
                        {tDash("syncing")}
                      </>
                    ) : (
                      tDash("syncCalendar")
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/sync")}
                    className="px-3 py-2 sm:py-1.5 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 touch-manipulation min-h-[40px] sm:min-h-0"
                  >
                    <PlugZap size={11} />
                    {tDash("connectCalendar")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Cost trend chart ────────────────────────────────── */}
          <div className="mb-5">
            <CostTrendChart
              period={period}
              customFrom={customFrom}
              customTo={customTo}
              refreshToken={refreshToken}
            />
          </div>

          {/* ── Recent meetings list ────────────────────────────── */}
          <RecentMeetings
            showCost
            externalPeriod={period}
            externalCustomFrom={customFrom}
            externalCustomTo={customTo}
            refreshToken={refreshToken}
            onAfterToggleExclusion={refreshKpis}
          />
        </main>

      </div>
    </div>
  );
};

export default ManagerDashboard;
