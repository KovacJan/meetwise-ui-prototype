"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import { useUser } from "@/contexts/UserContext";
import KpiCard from "@/components/KpiCard";
import ForecastKpiCard from "@/components/ForecastKpiCard";
import CostTrendChart from "@/components/CostTrendChart";
import RecentMeetings from "@/components/RecentMeetings";
import CostDebugPanel from "@/components/CostDebugPanel";
import { useRouter } from "../../i18n/navigation";
import Loader from "@/components/Loader";
import { AppDatePicker } from "@/components/AppDatePicker";
import type {
  FilterPeriod,
  DebugPeriod,
} from "@/app/[locale]/(dashboard)/dashboard/actions";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  PlugZap,
  Clock,
} from "lucide-react";
import ScheduleMeetingDialog from "@/components/ScheduleMeetingDialog";
import { formatDurationMinutes } from "@/lib/meeting-metrics";
import type { MetricsChartMode } from "@/components/CostTrendChart";
import { resolveApiErrorMessage } from "@/lib/rate-limit-ui";
import { isOutlookReconnectRequiredError } from "@/lib/microsoft-graph";
import { toast } from "sonner";

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
  weeklyMinutes: number;
  monthlyMinutes: number;
  annualMinutes: number;
  errorMessage?: string;
  showTeamSetupCta?: boolean;
  calendarConnected?: boolean;
  calendarWriteEnabled?: boolean;
  lastCalendarSyncAt?: string | null;
  lastCalendarSyncStatus?: "success" | "failed" | null;
  lastCalendarSyncError?: string | null;
  isEmployeeView?: boolean;
};

// ─── component ─────────────────────────────────────────────────────────────

const ManagerDashboard = ({
  weeklyCost,
  monthlyCost,
  annualCost,
  weeklyMinutes,
  monthlyMinutes,
  annualMinutes,
  errorMessage,
  showTeamSetupCta,
  calendarConnected = false,
  calendarWriteEnabled = false,
  lastCalendarSyncAt = null,
  lastCalendarSyncStatus = null,
  lastCalendarSyncError = null,
  isEmployeeView = false,
}: ManagerDashboardProps) => {
  const tDash = useTranslations("dashboard");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const { displayName } = useUser();
  const isLeader = !isEmployeeView;
  const [metricsView, setMetricsView] = useState<MetricsChartMode>("cost");
  const showFinancials = isLeader && metricsView === "cost";

  const PERIOD_TABS = PERIOD_IDS.map((id) => ({
    id,
    label: tDash(
      id === "week"
        ? "periodWeek"
        : id === "month"
          ? "periodMonth"
          : id === "year"
            ? "periodYear"
            : "periodCustom",
    ),
  }));

  // Local KPI state so we can refresh after exclusions
  const [kpis, setKpis] = useState({
    weeklyCost,
    monthlyCost,
    annualCost,
    weeklyMinutes,
    monthlyMinutes,
    annualMinutes,
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
  const [isCalendarConnected, setIsCalendarConnected] =
    useState(calendarConnected);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(
    lastCalendarSyncAt,
  );
  const [persistedSyncError, setPersistedSyncError] = useState<string | null>(
    lastCalendarSyncStatus === "failed" ? lastCalendarSyncError : null,
  );
  const [needsOutlookReconnect, setNeedsOutlookReconnect] = useState(
    lastCalendarSyncStatus === "failed" &&
      !!lastCalendarSyncError &&
      isOutlookReconnectRequiredError(lastCalendarSyncError),
  );
  const [isSyncErrorOpen, setIsSyncErrorOpen] = useState(false);
  const syncErrorRef = useRef<HTMLDivElement | null>(null);
  const displaySyncError =
    needsOutlookReconnect && persistedSyncError
      ? tErrors("OUTLOOK_RECONNECT_REQUIRED")
      : persistedSyncError;

  useEffect(() => {
    if (!isSyncErrorOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!syncErrorRef.current) return;
      const target = event.target as Node;
      if (!syncErrorRef.current.contains(target)) {
        setIsSyncErrorOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSyncErrorOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isSyncErrorOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar_write") !== "1") return;
    setSyncMessage(tDash("calendarWriteEnabledSuccess"));
    const url = new URL(window.location.href);
    url.searchParams.delete("calendar_write");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [tDash]);

  const formatLastSync = (value: string | null) => {
    if (!value) return tDash("lastSyncNever");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tDash("lastSyncNever");
    return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

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
        weeklyMinutes: updated.weeklyMinutes ?? kpis.weeklyMinutes,
        monthlyMinutes: updated.monthlyMinutes ?? kpis.monthlyMinutes,
        annualMinutes: updated.annualMinutes ?? kpis.annualMinutes,
      });
    } catch {
      // Ignore errors; KPIs just won't update
    }
  };

  const handleSync = async () => {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-calendar", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = resolveApiErrorMessage(
          data,
          tErrors,
          tDash("syncError"),
        );
        setPersistedSyncError(message);
        const reconnect =
          data.code === "OUTLOOK_RECONNECT_REQUIRED" ||
          (typeof data.error === "string" &&
            isOutlookReconnectRequiredError(data.error));
        setNeedsOutlookReconnect(reconnect);
        setIsSyncErrorOpen(true);
        toast.error(
          reconnect ? tDash("syncReconnectRequired") : message,
        );
        setSyncMessage(null);
      } else {
        const count = data.synced ?? 0;
        const total = data.total;
        setSyncMessage(
          total
            ? tDash("syncedMeetingsOf", { count, total })
            : tDash("syncedMeetings", { count }),
        );
        // Calendar is definitely connected if sync succeeds
        setIsCalendarConnected(true);
        if (typeof data.lastSyncAt === "string") {
          setLastSyncAt(data.lastSyncAt);
        }
        setPersistedSyncError(null);
        setNeedsOutlookReconnect(false);
        setIsSyncErrorOpen(false);
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
      const message = e instanceof Error ? e.message : tDash("syncError");
      setPersistedSyncError(message);
      setNeedsOutlookReconnect(isOutlookReconnectRequiredError(message));
      setIsSyncErrorOpen(true);
      toast.error(message);
      setSyncMessage(null);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("outlook_reconnected") !== "1") return;

    setPersistedSyncError(null);
    setNeedsOutlookReconnect(false);
    setIsSyncErrorOpen(false);
    setIsCalendarConnected(true);

    const url = new URL(window.location.href);
    url.searchParams.delete("outlook_reconnected");
    window.history.replaceState({}, "", url.pathname + url.search);

    void handleSync();
    // Run once when returning from OAuth reconnect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <AppSidebar isEmployee={isEmployeeView} />
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

          {isLeader &&
            isCalendarConnected &&
            !calendarWriteEnabled &&
            !showTeamSetupCta &&
            !needsOutlookReconnect &&
            !displaySyncError && (
              <div className="mb-4 sm:mb-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex flex-col sm:flex-row sm:items-center gap-3 max-w-2xl w-full">
                <p className="flex-1">{tDash("calendarWriteUpgradeBody")}</p>
                <a
                  href="/api/auth/microsoft?upgrade=write"
                  className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg, #00a4ef, #0078d4)",
                  }}
                >
                  {tDash("calendarWriteUpgradeButton")}
                </a>
              </div>
            )}

          {/* No-team CTA */}
          {showTeamSetupCta && (
            <div
              className="mb-6 sm:mb-8 flex flex-col items-center justify-center rounded-2xl border border-white/15 px-4 sm:px-6 py-8 sm:py-12 text-center animate-fade-in shadow-[0_20px_60px_rgba(8,10,40,0.35)]"
              style={{
                background:
                  "linear-gradient(145deg, hsla(235,42%,30%,0.82), hsla(232,34%,22%,0.86))",
              }}
            >
              <h2 className="text-xl font-semibold text-white mb-2">
                {tDash("noTeamTitle")}
              </h2>
              <p className="text-sm text-white/75 max-w-md mb-6">
                {tDash("noTeamDesc")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/onboarding")}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-95"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(232,55%,58%), hsl(205,72%,57%))",
                    boxShadow: "0 8px 24px hsla(222,85%,62%,0.32)",
                  }}
                >
                  {tDash("createTeam")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/onboarding")}
                  className="px-5 py-2.5 rounded-xl border border-white/20 bg-white/10 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  {tDash("joinTeam")}
                </button>
              </div>
            </div>
          )}

          {/* ── KPI cards ───────────────────────────────────────── */}
          <div
            className={`grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8 ${
              showFinancials ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            <KpiCard
              title={showFinancials ? tDash("weeklyCost") : tDash("weeklyTime")}
              value={
                showFinancials
                  ? formatCurrency(kpis.weeklyCost)
                  : formatDurationMinutes(kpis.weeklyMinutes, locale)
              }
              icon={
                showFinancials ? (
                  <DollarSign size={16} className="text-foreground/80" />
                ) : (
                  <Clock size={16} className="text-foreground/80" />
                )
              }
              gradient="purple-blue"
              subtitle={tDash("weeklyCostSubtitle")}
              onDetailOpen={isLeader ? () => setDebugPeriod("week") : undefined}
            />
            <KpiCard
              title={
                showFinancials ? tDash("monthlyCost") : tDash("monthlyTime")
              }
              value={
                showFinancials
                  ? formatCurrency(kpis.monthlyCost)
                  : formatDurationMinutes(kpis.monthlyMinutes, locale)
              }
              icon={
                showFinancials ? (
                  <TrendingUp size={16} className="text-foreground/80" />
                ) : (
                  <Clock size={16} className="text-foreground/80" />
                )
              }
              gradient="blue-cyan"
              subtitle={monthLabel}
              onDetailOpen={
                isLeader ? () => setDebugPeriod("month") : undefined
              }
            />
            <KpiCard
              title={showFinancials ? tDash("annualCost") : tDash("annualTime")}
              value={
                showFinancials
                  ? formatCurrency(kpis.annualCost)
                  : formatDurationMinutes(kpis.annualMinutes, locale)
              }
              icon={
                showFinancials ? (
                  <BarChart3 size={16} className="text-foreground/80" />
                ) : (
                  <Clock size={16} className="text-foreground/80" />
                )
              }
              gradient="cyan-green"
              subtitle={yearToDateLabel}
              onDetailOpen={isLeader ? () => setDebugPeriod("year") : undefined}
            />
            {showFinancials && (
              <ForecastKpiCard
                monthlyCost={kpis.monthlyCost}
                annualCost={kpis.annualCost}
              />
            )}
          </div>

          {/* Dev cost breakdown drawer */}
          {isLeader && debugPeriod && (
            <CostDebugPanel
              period={debugPeriod}
              mode={metricsView}
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

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {isLeader && !showTeamSetupCta && (
                <div
                  className="flex items-center gap-0.5 rounded-xl p-1 shrink-0"
                  style={{
                    background: "hsla(0,0%,100%,0.04)",
                    border: "1px solid hsla(0,0%,100%,0.08)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setMetricsView("cost")}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      metricsView === "cost"
                        ? "text-white"
                        : "text-white/30 hover:text-white/55"
                    }`}
                    style={
                      metricsView === "cost"
                        ? {
                            background: "hsla(232,42%,53%,0.45)",
                            boxShadow: "0 1px 5px hsla(232,42%,53%,0.35)",
                          }
                        : {}
                    }
                  >
                    {tDash("viewCosts")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetricsView("time")}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      metricsView === "time"
                        ? "text-white"
                        : "text-white/30 hover:text-white/55"
                    }`}
                    style={
                      metricsView === "time"
                        ? {
                            background: "hsla(232,42%,53%,0.45)",
                            boxShadow: "0 1px 5px hsla(232,42%,53%,0.35)",
                          }
                        : {}
                    }
                  >
                    {tDash("viewTime")}
                  </button>
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

                {isCalendarConnected && (
                  <span className="text-muted-foreground">
                    {tDash("lastSyncLabel")}: {formatLastSync(lastSyncAt)}
                  </span>
                )}

                {syncMessage && (
                  <span className="text-muted-foreground">{syncMessage}</span>
                )}

                {displaySyncError && (
                  <div ref={syncErrorRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsSyncErrorOpen((v) => !v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-destructive/40 bg-destructive/15 text-destructive-foreground hover:bg-destructive/20 transition-colors"
                      aria-expanded={isSyncErrorOpen}
                      aria-haspopup="dialog"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive-foreground" />
                      {tDash("syncErrorShort")}
                    </button>

                    {isSyncErrorOpen && (
                      <div
                        role="dialog"
                        aria-label={tDash("syncErrorDetailsLabel")}
                        className="absolute right-0 top-[calc(100%+8px)] z-20 w-fit min-w-[18rem] max-w-[92vw] rounded-xl p-3"
                        style={{
                          background:
                            "linear-gradient(180deg, hsla(232,44%,18%,0.98) 0%, hsla(232,42%,14%,0.98) 100%)",
                          border: "1px solid hsla(0,0%,100%,0.12)",
                          boxShadow: "0 16px 36px hsla(232,60%,6%,0.62)",
                        }}
                      >
                        <p className="text-[11px] font-semibold text-white/75 mb-1">
                          {tDash("syncErrorDetailsLabel")}
                        </p>
                        <p className="text-xs leading-relaxed text-white/90 whitespace-pre-wrap break-words">
                          {displaySyncError}
                        </p>
                        {needsOutlookReconnect && (
                          <a
                            href="/api/auth/microsoft?reconnect=1"
                            className="mt-3 inline-flex items-center justify-center w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                          >
                            {tDash("reconnectOutlook")}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isLeader && isCalendarConnected && (
                  <ScheduleMeetingDialog
                    calendarWriteEnabled={calendarWriteEnabled}
                    onCreated={() => {
                      setRefreshToken((t) => t + 1);
                      void refreshKpis();
                    }}
                  />
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
                        <Loader
                          variant="inline"
                          className="text-muted-foreground"
                        />
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
              mode={showFinancials ? "cost" : "time"}
            />
          </div>

          {/* ── Recent meetings list ────────────────────────────── */}
          <RecentMeetings
            showCost={showFinancials}
            showExclusionToggle={isLeader}
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
