"use client";



import {useCallback, useEffect, useMemo, useState} from "react";

import {useLocale, useTranslations} from "next-intl";

import {Loader2, Trash2} from "lucide-react";

import {toast} from "sonner";

import {

  Dialog,

  DialogContent,

  DialogHeader,

  DialogTitle,

} from "@/components/ui/dialog";

import {resolveApiErrorMessage} from "@/lib/rate-limit-ui";

import type {RecurrenceEditScope} from "@/lib/meeting-scheduling/recurrence-scope";



type TeamAttendee = {email: string; name: string};



type MeetingDetails = {

  title: string;

  start: string;

  end: string;

  attendeeEmails: string[];

  canEdit: boolean;

  editBlockedCode: string | null;

  calendarWriteEnabled: boolean;

  teamAttendees: TeamAttendee[];

  isRecurring: boolean;

  recurrenceScopes: RecurrenceEditScope[];

};



function toDatetimeLocalValue(iso: string): string {

  const d = new Date(iso);

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

}



function fromDatetimeLocalValue(value: string): string {

  return new Date(value).toISOString();

}



type EditMeetingDialogProps = {

  occurrenceId: string | null;

  open: boolean;

  onOpenChange: (open: boolean) => void;

  onSaved?: () => void;

};



export default function EditMeetingDialog({

  occurrenceId,

  open,

  onOpenChange,

  onSaved,

}: EditMeetingDialogProps) {

  const t = useTranslations("scheduling");

  const tErrors = useTranslations("errors");

  const locale = useLocale();



  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [cancelling, setCancelling] = useState(false);

  const [details, setDetails] = useState<MeetingDetails | null>(null);

  const [title, setTitle] = useState("");

  const [startLocal, setStartLocal] = useState("");

  const [endLocal, setEndLocal] = useState("");

  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  const [editScope, setEditScope] = useState<RecurrenceEditScope>("occurrence");
  const [costPreview, setCostPreview] = useState<{
    totalEur: number;
    matchedCount: number;
    unmatchedCount: number;
    durationMinutes: number;
  } | null>(null);

  const fmtCurrency = useMemo(() => {
    const loc = locale === "de" ? "de-DE" : "en-GB";
    return (value: number) =>
      new Intl.NumberFormat(loc, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
  }, [locale]);



  const load = useCallback(async () => {

    if (!occurrenceId) return;

    setLoading(true);

    try {

      const res = await fetch(`/api/meetings/${occurrenceId}`);

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {

        toast.error(

          resolveApiErrorMessage(json, tErrors, t("editLoadFailed")),

        );

        onOpenChange(false);

        return;

      }

      const d = json as MeetingDetails;

      setDetails(d);

      setTitle(d.title);

      setStartLocal(toDatetimeLocalValue(d.start));

      setEndLocal(toDatetimeLocalValue(d.end));

      setSelectedEmails(new Set(d.attendeeEmails));

      setEditScope(d.recurrenceScopes?.[0] ?? "occurrence");

    } catch {

      toast.error(t("editLoadFailed"));

      onOpenChange(false);

    } finally {

      setLoading(false);

    }

  }, [occurrenceId, onOpenChange, t, tErrors]);



  useEffect(() => {

    if (open && occurrenceId) void load();

  }, [open, occurrenceId, load]);



  useEffect(() => {
    if (!open || !details || selectedEmails.size === 0) {
      setCostPreview(null);
      return;
    }

    const startMs = new Date(fromDatetimeLocalValue(startLocal)).getTime();
    const endMs = new Date(fromDatetimeLocalValue(endLocal)).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      setCostPreview(null);
      return;
    }

    const durationMinutes = Math.round((endMs - startMs) / 60000);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/meetings/cost-preview", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            durationMinutes,
            attendeeEmails: [...selectedEmails],
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) setCostPreview(json.preview ?? null);
      } catch {
        setCostPreview(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open, details, selectedEmails, startLocal, endLocal]);

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



  const writeBlocked = !details?.calendarWriteEnabled;

  const editBlocked = details && !details.canEdit;

  const showScopePicker =

    details?.isRecurring && (details.recurrenceScopes?.length ?? 0) > 1;

  const canSubmit =

    details?.canEdit && details.calendarWriteEnabled && !saving && !cancelling;



  function cancelConfirmMessage(): string {

    if (!details?.isRecurring || editScope === "occurrence") {

      return t("cancelConfirm");

    }

    if (editScope === "following") return t("cancelConfirmFollowing");

    return t("cancelConfirmSeries");

  }



  async function handleSave() {

    if (!occurrenceId || !canSubmit) return;

    setSaving(true);

    try {

      const res = await fetch(`/api/meetings/${occurrenceId}`, {

        method: "PATCH",

        headers: {"Content-Type": "application/json"},

        body: JSON.stringify({

          title,

          start: fromDatetimeLocalValue(startLocal),

          end: fromDatetimeLocalValue(endLocal),

          attendeeEmails: [...selectedEmails],

          scope: editScope,

        }),

      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {

        toast.error(schedulingError(json, t, tErrors) ?? t("updateFailed"));

        return;

      }

      toast.success(t("updateSuccess"));

      onSaved?.();

      onOpenChange(false);

    } catch {

      toast.error(t("updateFailed"));

    } finally {

      setSaving(false);

    }

  }



  async function handleCancelMeeting() {

    if (!occurrenceId || !canSubmit) return;

    if (!window.confirm(cancelConfirmMessage())) return;

    setCancelling(true);

    try {

      const res = await fetch(`/api/meetings/${occurrenceId}`, {

        method: "DELETE",

        headers: {"Content-Type": "application/json"},

        body: JSON.stringify({scope: editScope}),

      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {

        toast.error(schedulingError(json, t, tErrors) ?? t("cancelFailed"));

        return;

      }

      toast.success(t("cancelSuccess"));

      onSaved?.();

      onOpenChange(false);

    } catch {

      toast.error(t("cancelFailed"));

    } finally {

      setCancelling(false);

    }

  }



  const teamList =

    details?.teamAttendees?.length

      ? details.teamAttendees

      : (details?.attendeeEmails ?? []).map((email) => ({email, name: email}));



  return (

    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background border-white/10">

        <DialogHeader>

          <DialogTitle>{t("editMeeting")}</DialogTitle>

        </DialogHeader>



        {loading || !details ? (

          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">

            <Loader2 className="animate-spin" size={18} />

            {t("loading")}

          </div>

        ) : (

          <div className="space-y-4">

            {editBlocked && details.editBlockedCode && (

              <p className="text-xs text-amber-200/90 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">

                {t(details.editBlockedCode as "NOT_ORGANIZER")}

              </p>

            )}



            {writeBlocked && (

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



            {showScopePicker && (

              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 space-y-2">

                <p className="text-xs font-medium text-muted-foreground">

                  {t("scopeLabel")}

                </p>

                {(

                  [

                    ["occurrence", t("scopeOccurrence")],

                    ["following", t("scopeFollowing")],

                    ["series", t("scopeSeries")],

                  ] as const

                ).map(([value, label]) => {

                  if (!details.recurrenceScopes.includes(value)) return null;

                  return (

                    <label

                      key={value}

                      className="flex items-start gap-2 text-sm cursor-pointer"

                    >

                      <input

                        type="radio"

                        name="editScope"

                        value={value}

                        checked={editScope === value}

                        onChange={() => setEditScope(value)}

                        disabled={!!editBlocked}

                        className="mt-1"

                      />

                      <span>{label}</span>

                    </label>

                  );

                })}

                {editScope === "occurrence" && (

                  <p className="text-[11px] text-muted-foreground pl-5">

                    {t("scopeOccurrenceHint")}

                  </p>

                )}

              </div>

            )}



            <div>

              <label className="text-xs font-medium text-muted-foreground">

                {t("titleLabel")}

              </label>

              <input

                type="text"

                value={title}

                onChange={(e) => setTitle(e.target.value)}

                disabled={!!editBlocked}

                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"

              />

            </div>



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <div>

                <label className="text-xs font-medium text-muted-foreground">

                  {t("startLabel")}

                </label>

                <input

                  type="datetime-local"

                  value={startLocal}

                  onChange={(e) => setStartLocal(e.target.value)}

                  disabled={!!editBlocked}

                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"

                />

              </div>

              <div>

                <label className="text-xs font-medium text-muted-foreground">

                  {t("endLabel")}

                </label>

                <input

                  type="datetime-local"

                  value={endLocal}

                  onChange={(e) => setEndLocal(e.target.value)}

                  disabled={!!editBlocked}

                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"

                />

              </div>

            </div>



            <div>

              <p className="text-xs font-medium text-muted-foreground mb-2">

                {t("attendees")}

              </p>

              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">

                {teamList.map((a) => {

                  const on = selectedEmails.has(a.email);

                  return (

                    <button

                      key={a.email}

                      type="button"

                      disabled={!!editBlocked}

                      onClick={() => toggleAttendee(a.email)}

                      className={

                        "px-2.5 py-1 rounded-lg text-xs border transition-colors disabled:opacity-50 " +

                        (on

                          ? "bg-secondary/40 border-secondary/60 text-foreground"

                          : "border-white/10 text-muted-foreground")

                      }

                    >

                      {a.name}

                    </button>

                  );

                })}

              </div>

            </div>



            {costPreview && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t("costPreviewLabel")}
                </p>
                <p className="font-semibold">{fmtCurrency(costPreview.totalEur)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("costPreviewDetail", {
                    matched: costPreview.matchedCount,
                    minutes: costPreview.durationMinutes,
                  })}
                  {costPreview.unmatchedCount > 0
                    ? ` ${t("costPreviewUnmatched", {count: costPreview.unmatchedCount})}`
                    : ""}
                </p>
              </div>
            )}



            <div className="flex flex-col sm:flex-row gap-2 pt-2">

              <button

                type="button"

                disabled={!canSubmit}

                onClick={handleSave}

                className="flex-1 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40"

              >

                {saving ? t("saving") : t("saveChanges")}

              </button>

              <button

                type="button"

                disabled={!canSubmit || cancelling}

                onClick={handleCancelMeeting}

                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-destructive/40 text-destructive-foreground text-sm font-medium hover:bg-destructive/10 disabled:opacity-40"

              >

                {cancelling ? (

                  <Loader2 size={14} className="animate-spin" />

                ) : (

                  <Trash2 size={14} />

                )}

                {t("cancelMeeting")}

              </button>

            </div>

          </div>

        )}

      </DialogContent>

    </Dialog>

  );

}



function schedulingError(

  json: {code?: string; error?: string; retryAfterSeconds?: number},

  t: ReturnType<typeof useTranslations<"scheduling">>,

  tErrors: ReturnType<typeof useTranslations<"errors">>,

): string | null {

  if (json.code === "CALENDAR_WRITE_REQUIRED") return t("CALENDAR_WRITE_REQUIRED");

  if (json.code === "NOT_ORGANIZER") return t("NOT_ORGANIZER");

  if (json.code === "SERIES_SCOPE_UNAVAILABLE") return t("SERIES_SCOPE_UNAVAILABLE");

  if (json.code === "SCHEDULING_UPDATE_FAILED") return t("updateFailed");

  if (json.code === "SCHEDULING_CANCEL_FAILED") return t("cancelFailed");

  if (json.code === "RATE_LIMIT_SCHEDULING") {

    return resolveApiErrorMessage(json, tErrors, t("updateFailed"));

  }

  if (json.error) return json.error;

  return null;

}

