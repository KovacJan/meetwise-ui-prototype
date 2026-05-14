"use client";

import {useEffect, useState, useTransition} from "react";
import {X, ChevronDown, ChevronRight, FlaskConical, RefreshCw, Users, AlertTriangle, CheckCircle2, Calculator} from "lucide-react";
import {
  getCostBreakdownForPeriod,
  type DebugMeeting,
  type DebugPeriod,
} from "@/app/[locale]/(dashboard)/dashboard/actions";

// ─── formatters ────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(v);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const periodLabel: Record<DebugPeriod, string> = {
  week: "This Week",
  month: "This Month",
  year: "This Year (to date)",
};

// ─── meeting row ───────────────────────────────────────────────
function MeetingRow({meeting, index}: {meeting: DebugMeeting; index: number}) {
  const [open, setOpen] = useState(false);
  const isMatched = meeting.teamCost !== null && (meeting.breakdown?.matched?.length ?? 0) > 0;
  const displayCost = meeting.teamCost ?? 0;
  const durationLabel =
    meeting.durationMinutes >= 60
      ? `${(meeting.durationMinutes / 60).toFixed(1).replace(".0", "")}h`
      : `${meeting.durationMinutes}m`;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        meeting.isExcluded
          ? "border-white/[0.04] bg-white/[0.01] opacity-40"
          : open
          ? "border-secondary/40 bg-white/[0.05]"
          : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.05]"
      }`}
      style={{animationDelay: `${index * 30}ms`}}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left group"
      >
          {/* Expand chevron */}
          <span className="text-white/20 group-hover:text-white/40 transition-colors shrink-0">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>

          {/* Status dot */}
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              meeting.isExcluded ? "bg-white/20" : isMatched ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate leading-snug ${meeting.isExcluded ? "line-through text-white/30" : "text-white/90"}`}>
              {meeting.title}
            </p>
            <p className="text-xs text-white/35 mt-0.5">
              {fmtDate(meeting.startTime)}
              <span className="mx-1.5 opacity-40">·</span>
              {durationLabel}
              <span className="mx-1.5 opacity-40">·</span>
              {meeting.participantCount} attendee{meeting.participantCount !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Cost badge */}
          <div className="text-right shrink-0">
            <span
              className={`text-sm font-bold tabular-nums ${
                meeting.isExcluded ? "text-white/20 line-through" : isMatched ? "text-white" : "text-amber-300/80"
              }`}
            >
              {fmt(displayCost)}
            </span>
            {!meeting.isExcluded && !isMatched && meeting.teamCost === null && (
              <p className="text-[10px] text-amber-400/70 mt-0.5">no match</p>
            )}
            {meeting.isExcluded && (
              <p className="text-[10px] text-white/25 mt-0.5">excluded</p>
            )}
          </div>
        </button>

      {/* Expanded breakdown */}
      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
          {isMatched ? (
            <>
              {/* Section label */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-secondary/70">
                Team members in this meeting
              </p>

              {/* Member rows */}
              <div className="space-y-1.5">
                {meeting.breakdown!.matched.map((entry) => (
                  <div
                    key={entry.email}
                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                    style={{background: "hsla(232,42%,53%,0.1)", border: "1px solid hsla(232,42%,53%,0.2)"}}
                  >
                    {/* Avatar initial */}
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{background: "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))"}}
                    >
                      {entry.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/90 truncate">{entry.name}</p>
                      <p className="text-[10px] text-white/35 truncate">{entry.email}</p>
                    </div>

                    {/* Calculation */}
                    <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
                      <span className="text-secondary/80">€{entry.rate}/h</span>
                      <span className="text-white/20">×</span>
                      <span className="text-white/50">{entry.duration_hours.toFixed(2)}h</span>
                      <span className="text-white/20">=</span>
                      <span className="text-emerald-300 font-bold">{fmt(entry.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Unmatched notice */}
              {meeting.breakdown!.unmatched_count > 0 && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                  style={{background: "hsla(38,90%,50%,0.08)", border: "1px solid hsla(38,90%,50%,0.2)"}}>
                  <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-300/80">
                    {meeting.breakdown!.unmatched_count} attendee{meeting.breakdown!.unmatched_count !== 1 ? "s" : ""} not in your team — excluded from cost
                  </p>
                </div>
              )}

              {/* Total line */}
              <div
                className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{background: "hsla(0,0%,100%,0.04)", border: "1px solid hsla(0,0%,100%,0.08)"}}
              >
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Calculator size={12} />
                  <span className="font-mono">
                    Σ {meeting.breakdown!.matched.map((e) => `€${e.rate}`).join(" + ")} × {meeting.breakdown!.duration_hours.toFixed(2)}h
                  </span>
                </div>
                <span className="text-sm font-bold text-white">{fmt(meeting.breakdown!.total)}</span>
              </div>
            </>
          ) : (
            <div
              className="rounded-lg px-3 py-3 space-y-1.5"
              style={{background: "hsla(38,90%,50%,0.08)", border: "1px solid hsla(38,90%,50%,0.18)"}}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                <p className="text-xs font-semibold text-amber-300">No team members matched</p>
              </div>
              <p className="text-[11px] text-white/30 pl-5">
                Add their emails on the Team page → Recalculate costs for accurate figures.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── stat pill ─────────────────────────────────────────────────
function StatPill({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: "green" | "amber" | "blue";
}) {
  const colors = {
    green: "text-emerald-300",
    amber: "text-amber-300",
    blue: "text-secondary",
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-xl font-bold tabular-nums ${accent ? colors[accent] : "text-white"}`}>
        {value}
      </span>
      <span className="text-[10px] text-white/35 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ─── main panel ────────────────────────────────────────────────
interface CostDebugPanelProps {
  period: DebugPeriod;
  onClose: () => void;
}

export default function CostDebugPanel({period, onClose}: CostDebugPanelProps) {
  const [meetings, setMeetings] = useState<DebugMeeting[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const data = await getCostBreakdownForPeriod(period);
      setMeetings(data);
    });
  };

  useEffect(() => {
    load();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMeetings = meetings.filter((m) => !m.isExcluded);
  const total = activeMeetings.reduce((s, m) => s + (m.teamCost ?? 0), 0);
  const fullyMatched = activeMeetings.filter(
    (m) => m.teamCost !== null && (m.breakdown?.matched?.length ?? 0) > 0,
  ).length;
  const unmatched = activeMeetings.length - fullyMatched;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col animate-slide-in-right"
        style={{
          width: "min(480px, 100vw)",
          background: "linear-gradient(180deg, hsl(237,56%,10%) 0%, hsl(235,56%,14%) 100%)",
          borderLeft: "1px solid hsla(0,0%,100%,0.10)",
          boxShadow: "-24px 0 80px hsla(232,60%,10%,0.8)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{borderBottom: "1px solid hsla(0,0%,100%,0.08)"}}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{background: "linear-gradient(135deg, hsl(270,60%,50%), hsl(232,60%,55%))"}}
            >
              <FlaskConical size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                Cost Breakdown
              </p>
              <p className="text-xs text-white/40">{periodLabel[period]}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={load}
              disabled={isPending}
              title="Refresh"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-all disabled:opacity-30"
            >
              <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Summary bar ── */}
        {meetings.length > 0 && (
          <div
            className="px-5 py-4 shrink-0"
            style={{borderBottom: "1px solid hsla(0,0%,100%,0.06)"}}
          >
            {/* Total cost hero */}
            <div className="text-center mb-4">
              <p className="text-[11px] uppercase tracking-widest text-white/30 mb-1">Total cost</p>
              <p
                className="text-4xl font-bold tabular-nums"
                style={{
                  background: "linear-gradient(135deg, hsl(232,60%,75%), hsl(190,70%,65%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {fmt(total)}
              </p>
            </div>

            {/* Stat pills */}
            <div
              className="grid grid-cols-3 divide-x rounded-xl overflow-hidden"
              style={{
                background: "hsla(0,0%,100%,0.04)",
                border: "1px solid hsla(0,0%,100%,0.08)",
              }}
            >
              <div className="py-3 flex flex-col items-center gap-0.5"
                style={{borderRight: "1px solid hsla(0,0%,100%,0.06)"}}>
                <span className="text-xl font-bold text-white">{activeMeetings.length}</span>
                <span className="text-[10px] text-white/35 uppercase tracking-wide">
                  {meetings.length > activeMeetings.length
                    ? `${activeMeetings.length}/${meetings.length}`
                    : "Meetings"}
                </span>
              </div>
              <div className="py-3 flex flex-col items-center gap-0.5"
                style={{borderRight: "1px solid hsla(0,0%,100%,0.06)"}}>
                <span className="text-xl font-bold text-emerald-300">{fullyMatched}</span>
                <span className="text-[10px] text-white/35 uppercase tracking-wide">Matched</span>
              </div>
              <div className="py-3 flex flex-col items-center gap-0.5">
                <span className={`text-xl font-bold ${unmatched > 0 ? "text-amber-300" : "text-white/30"}`}>
                  {unmatched}
                </span>
                <span className="text-[10px] text-white/35 uppercase tracking-wide">Unmatched</span>
              </div>
            </div>

            {/* Match quality bar */}
            {meetings.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px] text-white/30">
                  <span>Match quality</span>
                  <span>{activeMeetings.length > 0 ? Math.round((fullyMatched / activeMeetings.length) * 100) : 0}%</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${activeMeetings.length > 0 ? (fullyMatched / activeMeetings.length) * 100 : 0}%`,
                      background: "linear-gradient(90deg, hsl(190,70%,50%), hsl(150,60%,45%))",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Meeting list ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 [scrollbar-width:thin] [scrollbar-color:hsla(232,42%,53%,0.3)_transparent]">
          {isPending && meetings.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 border-secondary/30 border-t-secondary animate-spin"
              />
              <p className="text-xs text-white/30">Loading meetings…</p>
            </div>
          )}

          {!isPending && meetings.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{background: "hsla(0,0%,100%,0.04)", border: "1px solid hsla(0,0%,100%,0.08)"}}
              >
                <Calculator size={20} className="text-white/20" />
              </div>
              <div>
                <p className="text-sm text-white/40 font-medium">No meetings this period</p>
                <p className="text-xs text-white/20 mt-0.5">Sync your calendar to see data</p>
              </div>
            </div>
          )}

          {meetings.map((m, i) => (
            <MeetingRow key={m.id} meeting={m} index={i} />
          ))}
        </div>

        {/* ── Legend footer ── */}
        <div
          className="px-5 py-3 shrink-0 flex flex-wrap gap-x-5 gap-y-1.5"
          style={{borderTop: "1px solid hsla(0,0%,100%,0.06)"}}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-white/30">Matched — real member rates</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] text-white/30">Unmatched — no team members found</span>
          </div>
        </div>
      </div>
    </>
  );
}
