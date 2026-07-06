"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {CalendarPlus, Loader2} from "lucide-react";
import {toast} from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {resolveApiErrorMessage} from "@/lib/rate-limit-ui";
import {estimateSchedulingCost} from "@/lib/meeting-scheduling/cost-preview";
import type {WorkingHoursConfig} from "@/lib/meeting-scheduling/working-hours";

type Attendee = { id: string; email: string; name: string; hourlyRate?: number };

type Slot = {
  start: string;
  end: string;
  confidence: number;
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const WINDOW_OPTIONS = [7, 14] as const;
const WORK_WEEKDAY_OPTIONS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;
const WEEKDAY_OPTIONS = [
  ...WORK_WEEKDAY_OPTIONS,
  "saturday",
  "sunday",
] as const;
type Weekday = (typeof WEEKDAY_OPTIONS)[number];
type WorkWeekday = (typeof WORK_WEEKDAY_OPTIONS)[number];
type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";
type RecurrenceEndType = "date" | "count";

type ScheduleMeetingDialogProps = {
  disabled?: boolean;
  calendarWriteEnabled?: boolean;
  onCreated?: () => void;
};

export default function ScheduleMeetingDialog({
  disabled,
  calendarWriteEnabled = false,
  onCreated,
}: ScheduleMeetingDialogProps) {
  const t = useTranslations("scheduling");
  const tErrors = useTranslations("errors");
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [searchWindowDays, setSearchWindowDays] = useState(7);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [findingSlots, setFindingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] =
    useState<RecurrenceFrequency>("weekly");
  const [recurrenceDays, setRecurrenceDays] = useState<Set<WorkWeekday>>(
    new Set(),
  );
  const [recurrenceEndType, setRecurrenceEndType] =
    useState<RecurrenceEndType>("count");
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [contextWriteEnabled, setContextWriteEnabled] = useState(
    calendarWriteEnabled,
  );
  const [workingHours, setWorkingHours] = useState<WorkingHoursConfig | null>(
    null,
  );
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null);

  const writeEnabled = contextWriteEnabled || calendarWriteEnabled;
  const dateLoc = locale === "de" ? "de-DE" : "en-GB";

  const fmtCurrency = useMemo(() => {
    const loc = locale === "de" ? "de-DE" : "en-GB";
    return (value: number) =>
      new Intl.NumberFormat(loc, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
  }, [locale]);

  const costMembers = useMemo(
    () =>
      attendees.map((a) => ({
        email: a.email,
        hourlyRate: a.hourlyRate ?? 0,
      })),
    [attendees],
  );

  const slotCostByKey = useMemo(() => {
    if (selectedEmails.size === 0) {
      return new Map<string, ReturnType<typeof estimateSchedulingCost>>();
    }
    const emails = [...selectedEmails];
    const map = new Map<string, ReturnType<typeof estimateSchedulingCost>>();
    for (const slot of slots) {
      const key = `${slot.start}-${slot.end}`;
      const mins = Math.round(
        (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000,
      );
      map.set(
        key,
        estimateSchedulingCost(mins || durationMinutes, emails, costMembers),
      );
    }
    return map;
  }, [slots, selectedEmails, costMembers, durationMinutes]);

  const formatSlotCostTooltip = useCallback(
    (preview: ReturnType<typeof estimateSchedulingCost>) => {
      const parts = [
        t("costPreviewDetail", {
          matched: preview.matchedCount,
          minutes: preview.durationMinutes,
        }),
        fmtCurrency(preview.totalEur),
      ];
      if (preview.unmatchedCount > 0) {
        parts.push(t("costPreviewUnmatched", {count: preview.unmatchedCount}));
      }
      return parts.join(" · ");
    },
    [t, fmtCurrency],
  );

  const workHoursHint = useMemo(() => {
    if (!workingHours) return null;
    const dayKeys = workingHours.workDays
      .map((d) => WEEKDAY_OPTIONS[d - 1])
      .filter(Boolean)
      .map((day) => t(`weekday.${day}`));
    return t("workHoursHint", {
      start: workingHours.workStart,
      end: workingHours.workEnd,
      days: dayKeys.join(", "),
      timezone: workingHours.timezone,
    });
  }, [workingHours, t]);

  const fmtSlot = useMemo(() => {
    const loc = locale === "de" ? "de-DE" : "en-GB";
    return (iso: string) =>
      new Intl.DateTimeFormat(loc, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
  }, [locale]);

  const fmtSlotRange = useMemo(() => {
    const timeFmt = new Intl.DateTimeFormat(dateLoc, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (start: string, end: string) =>
      `${fmtSlot(start)} – ${timeFmt.format(new Date(end))}`;
  }, [dateLoc, fmtSlot]);

  const fmtTimeOnly = useMemo(
    () => (iso: string) =>
      new Intl.DateTimeFormat(dateLoc, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso)),
    [dateLoc],
  );

  const slotDayGroups = useMemo(
    () => groupSlotsByDay(slots, dateLoc),
    [slots, dateLoc],
  );

  const workdayTabs = useMemo(
    () => mergeWorkdayTabs(slotDayGroups, dateLoc, searchWindowDays),
    [slotDayGroups, dateLoc, searchWindowDays],
  );

  const availableDayTabs = useMemo(
    () => workdayTabs.filter((g) => g.slots.length > 0),
    [workdayTabs],
  );

  const activeDaySlots = useMemo(() => {
    if (!activeDayKey) return [];
    return availableDayTabs.find((g) => g.dayKey === activeDayKey)?.slots ?? [];
  }, [activeDayKey, availableDayTabs]);

  useEffect(() => {
    if (availableDayTabs.length === 0) {
      setActiveDayKey(null);
      return;
    }
    if (availableDayTabs.some((g) => g.dayKey === activeDayKey)) return;
    setActiveDayKey(availableDayTabs[0].dayKey);
  }, [availableDayTabs, activeDayKey]);

  const weekdayFromIso = useCallback((iso: string): Weekday => {
    const days: Weekday[] = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[new Date(iso).getDay()] ?? "monday";
  }, []);

  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const res = await fetch("/api/meetings/scheduling-context");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          resolveApiErrorMessage(json, tErrors, t("contextLoadFailed")),
        );
        setOpen(false);
        return;
      }
      const list = (json.attendees ?? []) as Attendee[];
      setAttendees(list);
      setContextWriteEnabled(json.calendarWriteEnabled === true);
      setWorkingHours(json.workingHours ?? null);
      setSelectedEmails(new Set(list.map((a) => a.email)));
    } catch {
      toast.error(t("contextLoadFailed"));
      setOpen(false);
    } finally {
      setLoadingContext(false);
    }
  }, [t, tErrors]);

  useEffect(() => {
    if (open) void loadContext();
  }, [open, loadContext]);

  useEffect(() => {
    if (!selectedSlot) return;
    const day = weekdayFromIso(selectedSlot.start);
    if ((WORK_WEEKDAY_OPTIONS as readonly string[]).includes(day)) {
      setRecurrenceDays(new Set([day as WorkWeekday]));
    }
    const start = new Date(selectedSlot.start);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    const pad = (n: number) => String(n).padStart(2, "0");
    setRecurrenceEndDate(
      `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
    );
  }, [selectedSlot, weekdayFromIso]);

  useEffect(() => {
    if (!open) {
      setSlots([]);
      setSelectedSlot(null);
      setFindingSlots(false);
      return;
    }

    if (attendees.length === 0) {
      return;
    }

    setFindingSlots(true);
    const timer = setTimeout(async () => {
      setSlotsError(null);
      setEmptyReason(null);
      try {
        const res = await fetch("/api/meetings/find-slots", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            attendeeEmails: attendees.map((a) => a.email),
            durationMinutes,
            searchWindowDays,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = schedulingErrorMessage(json.code, t, tErrors, json);
          setSlotsError(msg ?? t("findSlotsFailed"));
          setSlots([]);
          return;
        }
        setSlots(json.slots ?? []);
        setEmptyReason(json.emptyReason ?? null);
        setSelectedSlot(null);
      } catch {
        setSlotsError(t("findSlotsFailed"));
        setSlots([]);
      } finally {
        setFindingSlots(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [open, attendees, durationMinutes, searchWindowDays, t, tErrors]);

  function toggleAttendee(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        if (next.size > 1) next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  }

  function toggleRecurrenceDay(day: WorkWeekday) {
    setRecurrenceDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        if (next.size > 1) next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!selectedSlot) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error(t("titleRequired"));
      return;
    }
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        start: selectedSlot.start,
        end: selectedSlot.end,
        attendeeEmails: [...selectedEmails],
      };
      const trimmedDescription = description.trim();
      if (trimmedDescription) {
        payload.description = trimmedDescription;
      }
      if (isRecurring) {
        payload.recurrence = {
          frequency: recurrenceFrequency,
          daysOfWeek: [...recurrenceDays],
          endType: recurrenceEndType,
          ...(recurrenceEndType === "count"
            ? {occurrenceCount: recurrenceCount}
            : {endDate: recurrenceEndDate}),
        };
      }
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && json.code === "CALENDAR_WRITE_REQUIRED") {
          toast.error(t("CALENDAR_WRITE_REQUIRED"));
          return;
        }
        toast.error(
          schedulingErrorMessage(json.code, t, tErrors, json) ??
            t("createFailed"),
        );
        return;
      }
      toast.success(isRecurring ? t("createRecurringSuccess") : t("createSuccess"));
      onCreated?.();
      setOpen(false);
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="px-3 py-2 sm:py-1 rounded-xl bg-white/10 border border-white/15 text-xs font-medium text-white/90 hover:bg-white/15 transition-colors disabled:opacity-50 flex items-center gap-1.5 touch-manipulation min-h-[40px] sm:min-h-0"
        >
          <CalendarPlus size={14} />
          {t("newMeeting")}
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(90vh,720px)] w-[min(100vw-1.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden border-white/10 bg-background p-0 sm:max-w-none">
        <div className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>{t("newMeeting")}</DialogTitle>
          </DialogHeader>
        </div>

        {loadingContext ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            {t("loading")}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("titleLabel")}{" "}
                      <span className="text-destructive-foreground">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("titlePlaceholder")}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("descriptionLabel")}
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("descriptionPlaceholder")}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {t("attendees")}
                    </p>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                      {attendees.map((a) => {
                        const on = selectedEmails.has(a.email);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAttendee(a.email)}
                            className={
                              "px-2.5 py-1 rounded-lg text-xs border transition-colors " +
                              (on
                                ? "bg-secondary/40 border-secondary/60 text-foreground"
                                : "border-white/10 text-muted-foreground hover:border-white/25")
                            }
                          >
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {t("duration")}
                      </p>
                      <Select
                        value={String(durationMinutes)}
                        onValueChange={(v) => setDurationMinutes(Number(v))}
                      >
                        <SelectTrigger className="h-9 w-full border-white/10 bg-white/5 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-popover text-popover-foreground">
                          {DURATION_OPTIONS.map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {t("durationMinutes", {minutes: m})}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        {t("searchWindow")}
                      </p>
                      <div className="flex rounded-lg border border-white/10 p-0.5 bg-white/[0.03]">
                        {WINDOW_OPTIONS.map((d) => {
                          const on = searchWindowDays === d;
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setSearchWindowDays(d)}
                              className={
                                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors " +
                                (on
                                  ? "bg-secondary/50 text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground")
                              }
                            >
                              {t("searchWindowDays", {days: d})}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("availableSlots")}
                      </p>
                      {slots.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t("slotsCount", {
                            count: slots.length,
                            days: searchWindowDays,
                          })}
                        </p>
                      )}
                    </div>
                    {workHoursHint && (
                      <p className="max-w-[14rem] text-right text-[10px] leading-snug text-muted-foreground/90">
                        {workHoursHint}
                      </p>
                    )}
                  </div>

                  {findingSlots && (
                    <div className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 size={16} className="animate-spin" />
                      {t("findingSlots")}
                    </div>
                  )}

                  {slotsError && (
                    <p className="text-sm text-destructive-foreground py-4">
                      {slotsError}
                    </p>
                  )}

                  {!findingSlots &&
                    !slotsError &&
                    selectedEmails.size > 0 &&
                    availableDayTabs.length > 0 && (
                    <>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("pickDay")}
                      </p>
                      <div
                        className="mb-2 flex gap-1 overflow-x-auto border-b border-white/10 py-0.5"
                        role="tablist"
                        aria-label={t("pickDay")}
                      >
                        {availableDayTabs.map((group) => {
                          const active = activeDayKey === group.dayKey;
                          return (
                            <button
                              key={group.dayKey}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setActiveDayKey(group.dayKey)}
                              className={
                                "shrink-0 min-w-[3.5rem] rounded-t-md border-b-2 px-2 pb-2 pt-1 text-center transition-colors " +
                                (active
                                  ? "border-b-secondary bg-white/[0.06] text-foreground"
                                  : "border-b-white/10 text-muted-foreground hover:border-b-white/25 hover:bg-white/[0.03] hover:text-foreground")
                              }
                            >
                              <span className="block text-[10px] font-semibold uppercase tracking-wide">
                                {group.weekday}
                              </span>
                              <span className="block text-xs font-medium leading-tight mt-0.5">
                                {group.dayLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div role="tabpanel">
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t("pickTime")}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3">
                          {activeDaySlots.map((slot) => {
                            const selected =
                              selectedSlot?.start === slot.start &&
                              selectedSlot?.end === slot.end;
                            const slotKey = `${slot.start}-${slot.end}`;
                            const cost = slotCostByKey.get(slotKey);
                            const tooltip = cost
                              ? `${fmtTimeOnly(slot.start)} – ${fmtTimeOnly(slot.end)} · ${formatSlotCostTooltip(cost)}`
                              : fmtSlotRange(slot.start, slot.end);
                            return (
                              <button
                                key={slotKey}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                title={tooltip}
                                className={
                                  "flex flex-col items-center rounded-lg border px-1.5 py-1.5 transition-colors " +
                                  (selected
                                    ? "border-secondary bg-secondary/20 text-foreground"
                                    : "border-white/12 bg-white/[0.07] text-foreground/90 hover:border-white/30 hover:bg-white/[0.11]")
                                }
                              >
                                <span className="text-xs font-bold tabular-nums leading-none">
                                  {fmtTimeOnly(slot.start)}
                                </span>
                                <span className="mt-0.5 text-[9px] text-muted-foreground tabular-nums leading-none">
                                  {fmtTimeOnly(slot.end)}
                                </span>
                                {cost && cost.matchedCount > 0 && (
                                  <span className="mt-1 rounded border border-amber-400/40 bg-amber-500/15 px-1 py-px text-[9px] font-semibold leading-none text-amber-100 tabular-nums">
                                    {fmtCurrency(cost.totalEur)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {!findingSlots &&
                    !slotsError &&
                    selectedEmails.size > 0 &&
                    availableDayTabs.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {formatEmptyReason(emptyReason, t) ?? t("noSlots")}
                      </p>
                    )}
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 space-y-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  <span>{t("recurringToggle")}</span>
                </label>

                {isRecurring && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-4">
                      {t("recurringFirstOccurrenceHint")}
                    </p>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {t("recurrenceFrequency")}
                      </p>
                      <Select
                        value={recurrenceFrequency}
                        onValueChange={(v) =>
                          setRecurrenceFrequency(v as RecurrenceFrequency)
                        }
                      >
                        <SelectTrigger className="h-9 w-full border-white/10 bg-white/5 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-popover text-popover-foreground">
                          <SelectItem value="weekly">
                            {t("frequencyWeekly")}
                          </SelectItem>
                          <SelectItem value="biweekly">
                            {t("frequencyBiweekly")}
                          </SelectItem>
                          <SelectItem value="monthly">
                            {t("frequencyMonthly")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {recurrenceFrequency !== "monthly" && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t("recurrenceDays")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {WORK_WEEKDAY_OPTIONS.map((day) => {
                            const on = recurrenceDays.has(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleRecurrenceDay(day)}
                                className={
                                  "px-2 py-1 rounded-md text-[11px] border transition-colors " +
                                  (on
                                    ? "bg-secondary/40 border-secondary/60 text-foreground"
                                    : "border-white/10 text-muted-foreground")
                                }
                              >
                                {t(`weekday.${day}`)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {t("recurrenceEnd")}
                      </p>
                      <Select
                        value={recurrenceEndType}
                        onValueChange={(v) =>
                          setRecurrenceEndType(v as RecurrenceEndType)
                        }
                      >
                        <SelectTrigger className="h-9 w-full border-white/10 bg-white/5 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-popover text-popover-foreground">
                          <SelectItem value="count">
                            {t("endAfterCount")}
                          </SelectItem>
                          <SelectItem value="date">{t("endOnDate")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {recurrenceEndType === "count" ? (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t("occurrenceCountLabel")}
                        </p>
                        <input
                          type="number"
                          min={2}
                          max={999}
                          value={recurrenceCount}
                          onChange={(e) =>
                            setRecurrenceCount(Number(e.target.value))
                          }
                          className="w-full max-w-[8rem] rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t("endDateLabel")}
                        </p>
                        <input
                          type="date"
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 space-y-3 border-t border-white/10 px-5 py-4 sm:px-6">
            {!writeEnabled && (
              <p className="text-xs text-amber-200/90 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                {t("writeRequiredHint")}{" "}
                <a
                  href="/api/auth/microsoft?upgrade=write"
                  className="underline font-medium"
                >
                  {t("enableWriteLink")}
                </a>
              </p>
            )}

            <button
              type="button"
              disabled={!selectedSlot || !title.trim() || creating}
              onClick={handleCreate}
              className="w-full py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {creating ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <Loader2 size={14} className="animate-spin" />
                  {t("creating")}
                </span>
              ) : writeEnabled ? (
                isRecurring ? t("createRecurringMeeting") : t("createMeeting")
              ) : (
                t("createMeetingPreview")
              )}
            </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_REASON_KEYS: Record<string, string> = {
  attendeesunavailable: "emptyReasonAttendeesUnavailable",
  attendeesunavailableorunknown: "emptyReasonAttendeesUnavailableOrUnknown",
  organizerunavailable: "emptyReasonOrganizerUnavailable",
  locationsunavailable: "emptyReasonUnknown",
  unknown: "emptyReasonUnknown",
};

function formatEmptyReason(
  reason: string | null,
  t: ReturnType<typeof useTranslations<"scheduling">>,
): string | null {
  if (!reason) return null;
  const key = EMPTY_REASON_KEYS[reason.toLowerCase()];
  if (key) {
    try {
      return t(key as "emptyReasonAttendeesUnavailable");
    } catch {
      // fall through
    }
  }
  return t("emptyReason", {reason});
}

type SlotDayGroup = {
  dayKey: string;
  weekday: string;
  dayLabel: string;
  slots: Slot[];
};

function dayKeyFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function mergeWorkdayTabs(
  slotGroups: SlotDayGroup[],
  locale: string,
  windowDays: number,
): SlotDayGroup[] {
  const slotMap = new Map(slotGroups.map((g) => [g.dayKey, g.slots]));
  return getWorkdaysInWindow(windowDays, locale).map((tab) => ({
    ...tab,
    slots: slotMap.get(tab.dayKey) ?? [],
  }));
}

function getWorkdaysInWindow(
  windowDays: number,
  locale: string,
): SlotDayGroup[] {
  const result: SlotDayGroup[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  const limit = new Date(cursor);
  limit.setDate(limit.getDate() + windowDays);

  while (cursor < limit) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      result.push({
        dayKey: dateToDayKey(cursor),
        weekday: new Intl.DateTimeFormat(locale, {weekday: "short"}).format(
          cursor,
        ),
        dayLabel: new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
        }).format(cursor),
        slots: [],
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function dateToDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function groupSlotsByDay(slots: Slot[], locale: string): SlotDayGroup[] {
  const sorted = [...slots].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const groups = new Map<string, Slot[]>();

  for (const slot of sorted) {
    const key = dayKeyFromIso(slot.start);
    const list = groups.get(key) ?? [];
    list.push(slot);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([dayKey, daySlots]) => {
    const sample = new Date(daySlots[0].start);
    return {
      dayKey,
      weekday: new Intl.DateTimeFormat(locale, {weekday: "short"}).format(
        sample,
      ),
      dayLabel: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
      }).format(sample),
      slots: daySlots,
    };
  });
}

function schedulingErrorMessage(
  code: string | undefined,
  t: ReturnType<typeof useTranslations<"scheduling">>,
  tErrors: ReturnType<typeof useTranslations<"errors">>,
  payload: {error?: string; retryAfterSeconds?: number},
): string | null {
  if (code === "CALENDAR_WRITE_REQUIRED") return t("CALENDAR_WRITE_REQUIRED");
  if (code === "OUTLOOK_NOT_CONNECTED") return t("OUTLOOK_NOT_CONNECTED");
  if (code === "OUTLOOK_TOKEN_FAILED") return t("OUTLOOK_TOKEN_FAILED");
  if (code === "SCHEDULING_FIND_FAILED") return t("findSlotsFailed");
  if (code === "SCHEDULING_CREATE_FAILED") return t("createFailed");
  if (code === "TITLE_REQUIRED") return t("titleRequired");
  if (code === "RATE_LIMIT_SCHEDULING") {
    return resolveApiErrorMessage(
      {code, retryAfterSeconds: payload.retryAfterSeconds},
      tErrors,
      t("findSlotsFailed"),
    );
  }
  if (payload.error) return payload.error;
  return null;
}
