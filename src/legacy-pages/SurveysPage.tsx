"use client";

import {useEffect, useState, useTransition} from "react";
import {useTranslations, useLocale} from "next-intl";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import {ClipboardList, CheckCircle2, Loader2, Star} from "lucide-react";
import type {SurveyMeeting, SurveysData} from "@/app/[locale]/(dashboard)/surveys/actions";
import {getDurationOptions} from "@/lib/survey-steps";

// ─── types ───────────────────────────────────────────────────────────────────

type UsefulValue = "yes" | "partially" | "no";
type FocusValue = "high" | "medium" | "low";

function mapStarsToUseful(stars: number): UsefulValue {
  if (stars <= 2) return "no";
  if (stars <= 4) return "partially";
  return "yes";
}

function fmtDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-IE", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export type FormValue = {
  stars: number;
  duration: number;
  focus: FocusValue | null;
};

function getDefaultFormValues(meeting: SurveyMeeting): FormValue {
  const options = getDurationOptions(meeting.durationMinutes || 30);
  const defaultDuration = options.includes(meeting.durationMinutes)
    ? meeting.durationMinutes
    : options[Math.floor(((options.length - 1) * 2) / 3)];
  return { stars: 0, duration: defaultDuration, focus: null };
}

// ─── inline form (pills, no slider); controlled via value + onChange ─────────

function SurveyForm({
  meeting,
  value,
  onChange,
  onSubmitted,
  onValidityChange,
}: {
  meeting: SurveyMeeting;
  value: FormValue;
  onChange: (v: FormValue) => void;
  onSubmitted: (id: string, useful: UsefulValue, duration: number) => void;
  onValidityChange?: (id: string, isValid: boolean) => void;
}) {
  const t = useTranslations("surveys");
  const tPoll = useTranslations("poll");

  const options = getDurationOptions(meeting.durationMinutes || 30);
  const { stars, duration, focus } = value;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = stars > 0 && duration > 0;

  useEffect(() => {
    if (!onValidityChange) return;
    onValidityChange(meeting.id, isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, meeting.id]);

  function handleSubmit() {
    if (!isValid || isPending) return;
    const useful = mapStarsToUseful(stars);
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/poll/submit", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            meetingId: meeting.id,
            useful,
            duration,
            focus: focus ?? undefined,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error ?? t("submitError"));
          return;
        }
        onSubmitted(meeting.id, useful, duration);
      } catch {
        setError(t("submitError"));
      }
    });
  }

  const update = (next: Partial<FormValue>) =>
    onChange({ ...value, ...next });

  const divider = (
    <div className="hidden sm:block h-14 w-px shrink-0 bg-white/[0.12] self-stretch" aria-hidden />
  );

  return (
    <div className="mt-2 pt-6 border-t border-white/[0.06] space-y-1.5">
      {/* Three questions: each column = label on top, controls below */}
      <div className="flex items-start gap-3 sm:gap-6 flex-wrap">
        {/* 1. Useful (stars) */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-[11px] text-white-foreground/80">
            {tPoll("useful")}
          </span>
          <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => update({ stars: v })}
              className="p-1.5 sm:p-0.5 cursor-pointer touch-manipulation min-h-[44px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
            >
              <Star
                size={17}
                className={
                  v <= stars
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-white/25 hover:text-white/40 transition-colors"
                }
              />
            </button>
          ))}
          </div>
        </div>
        {divider}
        {/* 2. Duration pills */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-[11px] text-white-foreground/80">
            {tPoll("duration")}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
          {options.map((v) => {
            const isOver = v > meeting.durationMinutes;
            const selected = v === duration;
            return (
              <button
                key={v}
                type="button"
                onClick={() => update({ duration: v })}
                className={
                  "px-2 py-0.5 rounded-md text-xs font-medium border transition-all leading-5 " +
                  (selected
                    ? "bg-secondary/40 border-secondary/70 text-foreground"
                    : isOver
                    ? "border-white/10 text-amber-400/70 hover:text-amber-300 hover:border-amber-400/40"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/25")
                }
              >
                {v}
              </button>
            );
          })}
          </div>
        </div>
        {divider}
        {/* 3. Focus chips */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-[11px] text-white-foreground/80">
            {tPoll("focus")} <span className="opacity-60">(opt.)</span>
          </span>
          <div className="flex items-center gap-1 flex-wrap">
          {(
            [
              {v: "high" as FocusValue, label: tPoll("focus_high"), on: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"},
              {v: "medium" as FocusValue, label: tPoll("focus_medium"), on: "bg-amber-500/15 border-amber-500/40 text-amber-300"},
              {v: "low" as FocusValue, label: tPoll("focus_low"), on: "bg-red-500/15 border-red-500/40 text-red-300"},
            ] as const
          ).map(({v, label, on}) => (
            <button
              key={v}
              type="button"
              onClick={() => update({ focus: focus === v ? null : v })}
              className={
                "px-2 py-0.5 rounded-md text-xs border transition-all leading-5 " +
                (focus === v
                  ? on
                  : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/25")
              }
            >
              {label}
            </button>
          ))}
          </div>
        </div>
        {/* Per-row submit */}
        <button
          type="button"
          disabled={!isValid || isPending}
          onClick={handleSubmit}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity self-end"
        >
          {isPending && <Loader2 size={12} className="animate-spin" />}
          {isPending ? t("submitting") : t("submit")}
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive-foreground">{error}</p>
      )}
    </div>
  );
}

// ─── single survey row ────────────────────────────────────────────────────────

type Phase = "idle" | "leaving";

function SurveyRow({
  meeting,
  value,
  onChange,
  onSubmitted,
  showDivider,
  onValidityChange,
}: {
  meeting: SurveyMeeting;
  value: FormValue;
  onChange: (v: FormValue) => void;
  onSubmitted: (id: string, useful: UsefulValue, duration: number) => void;
  showDivider?: boolean;
  onValidityChange?: (id: string, isValid: boolean) => void;
}) {
  const t = useTranslations("surveys");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("idle");
  const [gone, setGone] = useState(false);

  const usefulColors: Record<UsefulValue, string> = {
    yes: "text-green-400 bg-green-500/10 border-green-500/25",
    partially: "text-amber-400 bg-amber-500/10 border-amber-500/25",
    no: "text-red-400 bg-red-500/10 border-red-500/25",
  };
  const usefulLabels: Record<UsefulValue, string> = {
    yes: t("useful_yes"),
    partially: t("useful_partially"),
    no: t("useful_no"),
  };

  function handleSubmitted(id: string, useful: UsefulValue, dur: number) {
    setPhase("leaving");
    setTimeout(() => {
      setGone(true);
      onSubmitted(id, useful, dur);
    }, 320);
  }

  if (gone) return null;

  return (
    <div
      style={{
        maxHeight: phase === "leaving" ? 0 : 400,
        opacity: phase === "leaving" ? 0 : 1,
        overflow: "hidden",
        transition:
          "max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease",
      }}
    >
      <div className="px-4 sm:px-5 py-3 sm:py-4 relative">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-snug">
              {meeting.title}
            </p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
              {fmtDate(meeting.endTime, locale)} ·{" "}
              {meeting.durationMinutes} {t("min")}
            </p>
          </div>

          {/* Completed: show response inline */}
          {meeting.responded && meeting.response && (
            <div className="shrink-0 flex items-center gap-2 mt-0.5">
              <span
                className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${
                  usefulColors[meeting.response.wasUseful]
                }`}
              >
                {usefulLabels[meeting.response.wasUseful]}
              </span>
              <span className="text-xs text-muted-foreground/70">
                {meeting.response.actualDurationMinutes} {t("min")}
              </span>
            </div>
          )}
        </div>

        {/* Inline form for pending */}
        {!meeting.responded && (
          <SurveyForm
            meeting={meeting}
            value={value}
            onChange={onChange}
            onSubmitted={handleSubmitted}
            onValidityChange={onValidityChange}
          />
        )}
      </div>
      {showDivider && (
        <div className="mx-4 sm:mx-5 h-px bg-white/[0.06]" />
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SurveysPage({
  pending: initialPending,
  completed: initialCompleted,
  windowDays,
  isEmployee,
}: SurveysData & {isEmployee?: boolean}) {
  const t = useTranslations("surveys");

  // We only show pending surveys in the UI
  const [meetings, setMeetings] = useState<SurveyMeeting[]>(initialPending);
  const [formData, setFormData] = useState<Record<string, FormValue>>({});
  const [validMap, setValidMap] = useState<Record<string, boolean>>({});
  const [isTriggeringEmails, setIsTriggeringEmails] = useState(false);
  const [isSubmittingAll, startSubmitAllTransition] = useTransition();

  function handleSubmitted(
    meetingId: string,
    wasUseful: UsefulValue,
    actualDurationMinutes: number,
  ) {
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              responded: true,
              response: {
                wasUseful,
                actualDurationMinutes,
                submittedAt: new Date().toISOString(),
              },
            }
          : m,
      ),
    );

    // Notify sidebar/badges to refresh pending poll count
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("polls:refresh"));
    }
  }

  const pendingMeetings = meetings.filter((m) => !m.responded);
  const pendingCount = pendingMeetings.length;
  const hasAny = pendingCount > 0;
  const allValid =
    pendingCount > 0 &&
    pendingMeetings.every((m) => validMap[m.id]);

  function handleSubmitAll() {
    if (!allValid || isSubmittingAll) return;
    startSubmitAllTransition(async () => {
      const responses = pendingMeetings
        .filter((m) => validMap[m.id])
        .map((m) => {
          const v = formData[m.id] ?? getDefaultFormValues(m);
          return {
            meetingId: m.id,
            useful: mapStarsToUseful(v.stars),
            duration: v.duration,
            focus: v.focus ?? undefined,
          };
        });
      if (responses.length === 0) return;
      try {
        const res = await fetch("/api/poll/submit-batch", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ responses }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          console.error(json.error ?? "Submit all failed");
          return;
        }
        responses.forEach((r) => {
          handleSubmitted(
            r.meetingId,
            r.useful,
            r.duration,
          );
        });
      } catch (e) {
        console.error(e);
      }
    });
  }

  async function handleTriggerEmailsNow() {
    if (isTriggeringEmails) return;
    setIsTriggeringEmails(true);
    try {
      await fetch("/api/cron/check-polls-for-user");
    } catch {
      // swallow – this is only a manual test helper
    } finally {
      setIsTriggeringEmails(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar isEmployee={isEmployee} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 w-full min-w-0 px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto pb-28 md:pb-5 overflow-x-hidden">
          {/* Page header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
                }}
              >
                <ClipboardList size={19} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate">
                  {t("title")}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {t("subtitle", {days: windowDays})}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {pendingCount > 0 && (
                <span className="text-xs font-bold px-2.5 py-1.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                  {pendingCount} {t("pending")}
                </span>
              )}
              <button
                type="button"
                onClick={handleTriggerEmailsNow}
                disabled={isTriggeringEmails}
                className="text-[11px] px-3 py-2 rounded-lg border border-white/15 text-muted-foreground hover:text-foreground hover:border-white/40 disabled:opacity-50 transition-colors touch-manipulation min-h-[40px]"
              >
                {t("sendEmailNow")}
              </button>
            </div>
          </div>

          {/* Empty state */}
          {!hasAny && (
            <div className="text-center py-16">
              <CheckCircle2
                size={32}
                className="mx-auto mb-3 text-green-400/60"
              />
              <p className="text-sm font-medium text-foreground">
                {t("emptyTitle")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("emptyHint", {days: windowDays})}
              </p>
            </div>
          )}

          {/* Single unified list */}
          {hasAny && (
            <div className="glass rounded-2xl overflow-hidden w-full min-w-0">
              {pendingMeetings.map((m, idx) => (
                <SurveyRow
                  key={m.id}
                  meeting={m}
                  value={formData[m.id] ?? getDefaultFormValues(m)}
                  onChange={(v) =>
                    setFormData((prev) => ({ ...prev, [m.id]: v }))
                  }
                  onSubmitted={handleSubmitted}
                  showDivider={idx < pendingMeetings.length - 1}
                  onValidityChange={(id, v) =>
                    setValidMap((prev) => ({ ...prev, [id]: v }))
                  }
                />
              ))}
            </div>
          )}

          {/* Global submit-all button — single request to DB for all responses */}
          {hasAny && (
            <div className="mt-4 flex justify-end pb-2">
              <button
                type="button"
                disabled={!allValid || pendingCount === 0 || isSubmittingAll}
                onClick={handleSubmitAll}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 sm:py-1.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity touch-manipulation min-h-[48px]"
              >
                {isSubmittingAll && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {isSubmittingAll ? t("submitting") : t("submitAll")}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
