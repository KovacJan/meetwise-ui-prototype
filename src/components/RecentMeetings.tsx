"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  getMeetingsForPeriod,
  toggleMeetingExclusion,
  type MeetingRow,
  type FilterPeriod as ExternalFilterPeriod,
} from "@/app/[locale]/(dashboard)/dashboard/actions";
import { buildDashboardPeriodRange } from "@/lib/dashboard-period-range";
import { useLocale, useTranslations } from "next-intl";
import { formatDurationMinutes } from "@/lib/meeting-metrics";
import {
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Calendar,
  CalendarRange,
  Eye,
  EyeOff,
  Pencil,
  ArrowUpDown,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Search,
  X,
} from "lucide-react";
import { AppDatePicker } from "@/components/AppDatePicker";
import EditMeetingDialog from "@/components/EditMeetingDialog";

// ─── types ─────────────────────────────────────────────────────────────────

type FilterPeriod = ExternalFilterPeriod;
type MeetingKindFilter = "all" | "recurring" | "single";
type SortKey = "title" | "date" | "duration" | "participants" | "cost";
type SortDirection = "asc" | "desc";

interface MeetingGroup {
  key: string;
  title: string;
  occurrences: MeetingRow[];
  count: number;
  /** Sorted unique durations in minutes */
  durations: number[];
  participantRange: { min: number; max: number };
  /** Total cost excluding cancelled occurrences */
  totalCost: number;
  avgCost: number;
  firstDate: string;
  lastDate: string;
  cancelledCount: number;
  /** True when all non-cancelled occurrences are excluded from cost calculations */
  isExcluded: boolean;
}

// ─── Date & number formatters (locale-aware) ────────────────────────────────

function dateLocale(locale: string): string {
  return locale === "de" ? "de-DE" : "en-GB";
}

const fmtFull = (loc: string, iso: string) =>
  new Intl.DateTimeFormat(loc, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));

const fmtShort = (loc: string, iso: string) =>
  new Intl.DateTimeFormat(loc, { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );

const fmtWithYear = (loc: string, iso: string) =>
  new Intl.DateTimeFormat(loc, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));

const fmtTime = (loc: string, iso: string) =>
  new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

const fmtDur = (min: number) => {
  if (min <= 0) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

const fmtEur = (loc: string, v: number) =>
  new Intl.NumberFormat(loc, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(v);

function formatDateRange(loc: string, first: string, last: string): string {
  if (first === last) return fmtFull(loc, first);
  const a = new Date(first);
  const b = new Date(last);
  const sep = " – ";
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) {
      return loc === "de-DE"
        ? `${a.getDate()}.${sep}${fmtShort(loc, last)} ${a.getFullYear()}`
        : `${fmtShort(loc, first)}${sep}${fmtShort(loc, last)} ${a.getFullYear()}`;
    }
    return `${fmtShort(loc, first)}${sep}${fmtShort(loc, last)} ${a.getFullYear()}`;
  }
  return `${fmtWithYear(loc, first)}${sep}${fmtWithYear(loc, last)}`;
}

// ─── grouping logic ────────────────────────────────────────────────────────

function countParticipants(m: MeetingRow): number {
  return m.matchedMemberCount;
}

function groupingKey(m: MeetingRow): string {
  // Fallback for recurring occurrences where series_master_id can be missing.
  // Group by stable recurrence-like shape, not by title alone.
  if (m.eventType === "occurrence") {
    const start = new Date(m.startTime);
    const hh = String(start.getUTCHours()).padStart(2, "0");
    const mm = String(start.getUTCMinutes()).padStart(2, "0");
    return `occurrence:${m.title.trim().toLowerCase()}|${hh}:${mm}|${m.durationMinutes}`;
  }

  if (m.seriesMasterId) return `series:${m.seriesMasterId}`;
  if (m.icalUid) return `ical:${m.icalUid}`;
  return `row:${m.id}`;
}

function groupMeetings(meetings: MeetingRow[]): MeetingGroup[] {
  // Filter out cancelled meetings entirely – they should not be listed
  const visibleMeetings = meetings.filter((m) => !m.isCancelled);

  const map = new Map<string, MeetingRow[]>();
  for (const m of visibleMeetings) {
    const key = groupingKey(m);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }

  return [...map.values()]
    .map((group) => {
      group.sort((a, b) => a.startTime.localeCompare(b.startTime));

      const durations = [...new Set(group.map((m) => m.durationMinutes))].sort(
        (a, b) => a - b,
      );

      const participants = group.map(countParticipants);
      const nonCancelled = group.filter((m) => !m.isCancelled);
      // Exclude cancelled and explicitly excluded meetings from cost sum
      const totalCost = group
        .filter((m) => !m.isCancelled && !m.isExcluded)
        .reduce((s, m) => s + (m.teamCost ?? 0), 0);
      const activCount = group.filter(
        (m) => !m.isCancelled && !m.isExcluded,
      ).length;
      const isExcluded =
        nonCancelled.length > 0 && nonCancelled.every((m) => m.isExcluded);

      return {
        key: groupingKey(group[0]),
        title: group[group.length - 1].title,
        occurrences: group,
        count: group.length,
        durations,
        participantRange: {
          min: Math.min(...participants),
          max: Math.max(...participants),
        },
        totalCost,
        avgCost: activCount > 0 ? totalCost / activCount : 0,
        firstDate: group[0].startTime,
        lastDate: group[group.length - 1].startTime,
        cancelledCount: group.filter((m) => m.isCancelled).length,
        isExcluded,
      };
    })
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
}

// ─── range helpers ─────────────────────────────────────────────────────────

function parseCurrency(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function getGroupSortValue(group: MeetingGroup, key: SortKey): number | string {
  switch (key) {
    case "title":
      return group.title;
    case "date":
      return new Date(group.firstDate).getTime();
    case "duration":
      return group.durations[0] ?? 0;
    case "participants":
      return group.participantRange.min;
    case "cost":
      return parseCurrency(group.totalCost);
  }
}

// ─── occurrence row (single meeting inside a group) ────────────────────────

function OccurrenceRow({
  loc,
  m,
  showCost,
  cancelledLabel,
  showEdit,
  onEdit,
}: {
  loc: string;
  m: MeetingRow;
  showCost: boolean;
  cancelledLabel: string;
  showEdit?: boolean;
  onEdit?: (occurrenceId: string) => void;
}) {
  const participants = countParticipants(m);
  const cost = m.isCancelled || m.isExcluded ? null : (m.teamCost ?? 0);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-xs transition-colors ${
        m.isCancelled || m.isExcluded ? "opacity-40" : "hover:bg-white/[0.03]"
      }`}
      style={{
        background: "hsla(0,0%,100%,0.02)",
        border: "1px solid hsla(0,0%,100%,0.04)",
      }}
    >
      {/* indent spacer */}
      <div className="w-4 shrink-0" />

      {/* date + time */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="font-medium text-white/75">
          {fmtFull(loc, m.startTime)}
        </span>
        <span
          className="px-1.5 py-0.5 rounded-md font-mono text-[11px]"
          style={{
            background: "hsla(232,42%,53%,0.12)",
            color: "hsl(232,70%,75%)",
          }}
        >
          {fmtTime(loc, m.startTime)}
        </span>
        {/* Status badge placeholder to keep row height stable */}
        <span
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${
            m.isCancelled || m.isExcluded ? "" : "invisible"
          }`}
          style={
            m.isCancelled
              ? {
                  background: "hsla(0,75%,55%,0.15)",
                  color: "hsl(0,75%,70%)",
                }
              : m.isExcluded
                ? {
                    background: "hsla(38,90%,50%,0.18)",
                    color: "hsl(38,90%,78%)",
                  }
                : {}
          }
        >
          {m.isCancelled ? cancelledLabel : m.isExcluded ? "Excluded" : ""}
        </span>
      </div>

      {/* duration */}
      <div className="w-24 text-right text-white/45 shrink-0 font-mono text-[11px]">
        {fmtDur(m.durationMinutes)}
      </div>

      {/* participants */}
      <div className="w-14 text-right text-white/45 shrink-0">
        {participants}
      </div>

      {/* cost – single line, vertically centered within the cell */}
      {showCost && (
        <div className="w-24 text-right shrink-0 flex flex-col justify-center h-10">
          <span className="font-bold font-mono text-white/80">
            {cost !== null && cost > 0 ? fmtEur(loc, cost) : "—"}
          </span>
        </div>
      )}

      {showEdit && !m.isCancelled && (
        <button
          type="button"
          onClick={() => onEdit?.(m.id)}
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
}

// ─── group row ─────────────────────────────────────────────────────────────

function GroupRow({
  loc,
  group,
  showCost,
  showExclusionToggle,
  cancelledLabel,
  colDateTimeLabel,
  colDurationLabel,
  colPeopleLabel,
  colCostLabel,
  onToggleGroupExclusion,
  showEdit,
  onEdit,
}: {
  loc: string;
  group: MeetingGroup;
  showCost: boolean;
  showExclusionToggle: boolean;
  cancelledLabel: string;
  colDateTimeLabel: string;
  colDurationLabel: string;
  colPeopleLabel: string;
  colCostLabel: string;
  onToggleGroupExclusion: (group: MeetingGroup) => void;
  showEdit?: boolean;
  onEdit?: (occurrenceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isRecurring = group.count > 1;
  const participantsVary =
    group.participantRange.min !== group.participantRange.max;
  const durationsVary = group.durations.length > 1;

  const durationLabel = durationsVary
    ? `${fmtDur(group.durations[0])} – ${fmtDur(group.durations[group.durations.length - 1])}`
    : fmtDur(group.durations[0] ?? 0);

  const participantsLabel = participantsVary
    ? `${group.participantRange.min}–${group.participantRange.max}`
    : String(group.participantRange.min);

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        group.isExcluded
          ? "border-white/[0.05] bg-white/[0.015] opacity-60"
          : open
            ? "border-secondary/25 bg-white/[0.04]"
            : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.04]"
      }`}
    >
      {/* ── Main row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 pr-3">
        <div
          role={isRecurring ? "button" : undefined}
          tabIndex={isRecurring ? 0 : undefined}
          onClick={() => isRecurring && setOpen((v) => !v)}
          onKeyDown={(e) =>
            isRecurring && e.key === "Enter" && setOpen((v) => !v)
          }
          className={`flex-1 flex items-center gap-3 px-4 py-3.5 ${
            isRecurring ? "cursor-pointer" : ""
          }`}
        >
          {/* Expand chevron */}
          <span className="w-4 shrink-0 text-white/15">
            {isRecurring ? (
              open ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )
            ) : null}
          </span>

          {/* Title + badges */}
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white/90 truncate">
              {group.title}
            </span>

            {isRecurring && (
              <span
                className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{
                  background: "hsla(232,42%,53%,0.22)",
                  color: "hsl(232,70%,80%)",
                  border: "1px solid hsla(232,42%,53%,0.3)",
                }}
              >
                <CalendarRange size={9} />
                {group.count}×
              </span>
            )}

            {group.cancelledCount > 0 && (
              <span
                className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  background: "hsla(0,75%,55%,0.13)",
                  color: "hsl(0,75%,72%)",
                  border: "1px solid hsla(0,75%,55%,0.22)",
                }}
              >
                {group.cancelledCount}× {cancelledLabel}
              </span>
            )}
          </div>

          {/* Date range */}
          <div className="w-44 text-xs text-white/35 text-right shrink-0 leading-snug">
            {formatDateRange(loc, group.firstDate, group.lastDate)}
          </div>

          {/* Duration */}
          <div className="w-24 text-right shrink-0">
            <span
              className={`text-xs font-mono ${
                durationsVary ? "text-amber-300/75" : "text-white/45"
              }`}
            >
              {durationLabel}
            </span>
            {durationsVary && (
              <AlertTriangle
                size={9}
                className="inline ml-1 text-amber-400/50 -mt-0.5"
              />
            )}
          </div>

          {/* Participants */}
          <div className="w-14 flex items-center justify-end gap-1 shrink-0">
            <span
              className={`text-xs ${
                participantsVary ? "text-amber-300/75" : "text-white/45"
              }`}
            >
              {participantsLabel}
            </span>
            {participantsVary && (
              <AlertTriangle size={10} className="text-amber-400/55 shrink-0" />
            )}
          </div>

          {/* Cost – value (and optional average) vertically centered */}
          {showCost && (
            <div className="w-24 text-right shrink-0 flex flex-col justify-center h-10">
              <p
                className="text-sm font-bold tabular-nums"
                style={
                  group.totalCost > 0
                    ? {
                        background:
                          "linear-gradient(90deg, hsl(232,60%,72%), hsl(190,70%,62%))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }
                    : {}
                }
              >
                {group.totalCost > 0 ? fmtEur(loc, group.totalCost) : "—"}
              </p>
              {isRecurring && group.avgCost > 0 && (
                <p className="text-[10px] text-white/22 tabular-nums font-mono">
                  ø {fmtEur(loc, group.avgCost)}
                </p>
              )}
            </div>
          )}
        </div>

        {showExclusionToggle ? (
          <button
            type="button"
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
              group.isExcluded
                ? "text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10"
                : "text-white/25 hover:text-white/70 hover:bg-white/[0.06]"
            }`}
            title={
              group.isExcluded
                ? "Include this meeting series in calculations"
                : "Exclude this meeting series from all calculations"
            }
            onClick={() => onToggleGroupExclusion(group)}
          >
            {group.isExcluded ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )}

        {showEdit && !isRecurring && group.occurrences[0] && !group.occurrences[0].isCancelled ? (
          <button
            type="button"
            onClick={() => onEdit?.(group.occurrences[0].id)}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
        ) : showEdit ? (
          <div className="w-8 shrink-0" />
        ) : null}
      </div>

      {/* ── Expanded occurrences ───────────────────────────────────── */}
      {open && (
        <div
          className="px-4 pb-3 space-y-1"
          style={{ borderTop: "1px solid hsla(0,0%,100%,0.05)" }}
        >
          {/* Sub-header */}
          <div className="flex items-center gap-3 px-4 py-1.5 text-[9px] uppercase tracking-widest text-white/18">
            <div className="w-4 shrink-0" />
            <div className="flex-1">{colDateTimeLabel}</div>
            <div className="w-24 text-right shrink-0">{colDurationLabel}</div>
            <div className="w-14 text-right shrink-0">{colPeopleLabel}</div>
            {showCost && (
              <div className="w-24 text-right shrink-0">{colCostLabel}</div>
            )}
            {showEdit && <div className="w-8 shrink-0" />}
          </div>

          {group.occurrences.map((m) => (
            <OccurrenceRow
              key={m.id}
              loc={loc}
              m={m}
              showCost={showCost}
              cancelledLabel={cancelledLabel}
              showEdit={showEdit}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile card layout for groups (no horizontal scroll) ───────────────────

function MobileGroupRow({
  loc,
  group,
  showCost,
  showExclusionToggle,
  cancelledLabel,
  onToggleGroupExclusion,
}: {
  loc: string;
  group: MeetingGroup;
  showCost: boolean;
  showExclusionToggle: boolean;
  cancelledLabel: string;
  onToggleGroupExclusion: (group: MeetingGroup) => void;
}) {
  const participantsLabel =
    group.participantRange.min === group.participantRange.max
      ? String(group.participantRange.min)
      : `${group.participantRange.min}–${group.participantRange.max}`;

  const durationLabel =
    group.durations.length <= 1
      ? fmtDur(group.durations[0] ?? 0)
      : `${fmtDur(group.durations[0])} – ${fmtDur(
          group.durations[group.durations.length - 1],
        )}`;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {group.title}
          </p>
          <p className="text-[11px] text-white/35 mt-0.5">
            {formatDateRange(loc, group.firstDate, group.lastDate)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {group.count > 1 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/20 text-secondary-foreground/90">
              {group.count}×
            </span>
          )}
          {group.cancelledCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-300 border border-red-500/35">
              {group.cancelledCount}× {cancelledLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 text-xs text-white/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-white/35">Duration:</span>
            <span className="font-mono">{durationLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/35">People:</span>
            <span>{participantsLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showCost && (
            <div className="text-right">
              <p
                className="text-sm font-bold tabular-nums"
                style={
                  group.totalCost > 0
                    ? {
                        background:
                          "linear-gradient(90deg, hsl(232,60%,72%), hsl(190,70%,62%))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }
                    : {}
                }
              >
                {group.totalCost > 0 ? fmtEur(loc, group.totalCost) : "—"}
              </p>
            </div>
          )}
          {showExclusionToggle && (
            <button
              type="button"
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                group.isExcluded
                  ? "text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10"
                  : "text-white/25 hover:text-white/70 hover:bg-white/[0.06]"
              }`}
              title={
                group.isExcluded
                  ? "Include this meeting series in calculations"
                  : "Exclude this meeting series from all calculations"
              }
              onClick={() => onToggleGroupExclusion(group)}
            >
              {group.isExcluded ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────

interface RecentMeetingsProps {
  showCost?: boolean;
  /** When provided, hides the internal filter and uses these values */
  externalPeriod?: FilterPeriod;
  externalCustomFrom?: string;
  externalCustomTo?: string;
  /** Team leaders: toggle meeting exclusion from cost totals (independent of showCost) */
  showExclusionToggle?: boolean;
  /** Bump this to force a reload after calendar sync/clear */
  refreshToken?: number;
  /** Optional callback when exclusions change so parent can refresh KPIs */
  onAfterToggleExclusion?: () => void;
}

export default function RecentMeetings({
  showCost = true,
  externalPeriod,
  externalCustomFrom,
  externalCustomTo,
  refreshToken,
  showExclusionToggle,
  onAfterToggleExclusion,
}: RecentMeetingsProps) {
  const canToggleExclusion = showExclusionToggle ?? showCost;
  const t = useTranslations("meetings");
  const locale = useLocale();
  const loc = dateLocale(locale);
  const isControlled = !!externalPeriod;
  const [internalPeriod, setInternalPeriod] = useState<FilterPeriod>("week");

  const TABS: { id: FilterPeriod; label: string }[] = [
    { id: "week", label: t("filterWeek") },
    { id: "month", label: t("filterMonth") },
    { id: "year", label: t("filterYear") },
    { id: "custom", label: t("filterCustom") },
  ];

  // When externally controlled, use provided values; otherwise use internal state
  const period = isControlled ? externalPeriod! : internalPeriod;
  const [internalFrom, setInternalFrom] = useState("");
  const [internalTo, setInternalTo] = useState("");
  const customFrom = isControlled ? (externalCustomFrom ?? "") : internalFrom;
  const customTo = isControlled ? (externalCustomTo ?? "") : internalTo;
  const [searchTerm, setSearchTerm] = useState("");
  const [meetingKindFilter, setMeetingKindFilter] =
    useState<MeetingKindFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [groups, setGroups] = useState<MeetingGroup[]>([]);
  const [editOccurrenceId, setEditOccurrenceId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "date" ? "desc" : "asc");
  };

  const load = useCallback(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;
    const [from, to] = buildDashboardPeriodRange(period, customFrom, customTo);
    startTransition(async () => {
      const rows = await getMeetingsForPeriod(from, to);
      setGroups(groupMeetings(rows));
    });
  }, [period, customFrom, customTo]);

  const handleToggleGroupExclusion = async (group: MeetingGroup) => {
    const nonCancelled = group.occurrences.filter((m) => !m.isCancelled);
    if (nonCancelled.length === 0) return;

    const currentlyExcluded = nonCancelled.every((m) => m.isExcluded);
    const next = !currentlyExcluded;

    const ids = nonCancelled.map((m) => m.id);

    // Optimistic local update for snappy UI – only eye + local numbers change
    setGroups((prev) =>
      prev.map((g) =>
        g.key === group.key
          ? (() => {
              const updatedOccurrences = g.occurrences.map((m) =>
                ids.includes(m.id) ? { ...m, isExcluded: next } : m,
              );
              const visible = updatedOccurrences; // cancelled already filtered earlier
              const isExcludedGroup =
                visible.length > 0 && visible.every((m) => m.isExcluded);
              const totalCost = visible
                .filter((m) => !m.isExcluded)
                .reduce((s, m) => s + (m.teamCost ?? 0), 0);
              const activeCount = visible.filter((m) => !m.isExcluded).length;
              const avgCost = activeCount > 0 ? totalCost / activeCount : 0;

              return {
                ...g,
                isExcluded: isExcludedGroup,
                occurrences: updatedOccurrences,
                totalCost,
                avgCost,
              };
            })()
          : g,
      ),
    );

    // Persist on server in a single bulk call (no extra UI loading state)
    const { success } = await toggleMeetingExclusion(ids, next);
    if (!success) {
      // Revert optimistically applied change on failure
      setGroups((prev) =>
        prev.map((g) =>
          g.key === group.key
            ? {
                ...g,
                isExcluded: !next,
                occurrences: g.occurrences.map((m) =>
                  ids.includes(m.id) ? { ...m, isExcluded: !next } : m,
                ),
              }
            : g,
        ),
      );
    } else if (onAfterToggleExclusion) {
      onAfterToggleExclusion();
    }
  };

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const searchQuery = searchTerm.trim().toLowerCase();
  const filteredGroups = groups.filter((group) => {
    const matchesSearch =
      !searchQuery ||
      group.title.toLowerCase().includes(searchQuery) ||
      group.occurrences.some((m) => {
        const dateText = fmtFull(loc, m.startTime).toLowerCase();
        const timeText = fmtTime(loc, m.startTime).toLowerCase();
        const durationText = fmtDur(m.durationMinutes).toLowerCase();
        const participantsText = String(countParticipants(m));
        return (
          m.title.toLowerCase().includes(searchQuery) ||
          dateText.includes(searchQuery) ||
          timeText.includes(searchQuery) ||
          durationText.includes(searchQuery) ||
          participantsText.includes(searchQuery)
        );
      });

    const matchesKind =
      meetingKindFilter === "all" ||
      (meetingKindFilter === "recurring" ? group.count > 1 : group.count === 1);

    return matchesSearch && matchesKind;
  });

  const sortedGroups = [...filteredGroups].sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1;

    switch (sortKey) {
      case "title":
        return compareStrings(a.title, b.title) * direction;
      case "date":
        return (
          (new Date(a.firstDate).getTime() - new Date(b.firstDate).getTime()) *
          direction
        );
      case "duration":
        return ((a.durations[0] ?? 0) - (b.durations[0] ?? 0)) * direction;
      case "participants":
        return (a.participantRange.min - b.participantRange.min) * direction;
      case "cost":
        return (a.totalCost - b.totalCost) * direction;
    }
  });

  const hasActiveFilters =
    searchQuery.length > 0 || meetingKindFilter !== "all";
  const totalOccurrences = sortedGroups.reduce((s, g) => s + g.count, 0);
  const activeOccurrences = sortedGroups.reduce(
    (s, g) => s + g.count - g.cancelledCount,
    0,
  );
  const totalCost = sortedGroups.reduce((s, g) => s + g.totalCost, 0);
  const totalMinutes = sortedGroups.reduce(
    (s, g) =>
      s +
      g.occurrences
        .filter((m) => !m.isExcluded)
        .reduce((ss, m) => ss + m.durationMinutes, 0),
    0,
  );

  return (
    <div className="glass rounded-2xl overflow-hidden animate-fade-in w-full min-w-0">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        className="px-4 sm:px-5 py-3 sm:py-4"
        style={{ borderBottom: "1px solid hsla(0,0%,100%,0.08)" }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-semibold text-foreground text-sm">
            {t("title")}
          </h3>

          {/* Filter tabs — hidden when externally controlled */}
          {!isControlled && (
            <div
              className="flex items-center gap-0.5 rounded-xl p-1"
              style={{
                background: "hsla(0,0%,100%,0.04)",
                border: "1px solid hsla(0,0%,100%,0.08)",
              }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInternalPeriod(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
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
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25"
            />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-10 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-secondary/40 focus:bg-white/[0.05]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
                aria-label={t("clearSearch")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div
            className="flex items-center gap-0.5 rounded-xl p-1"
            style={{
              background: "hsla(0,0%,100%,0.04)",
              border: "1px solid hsla(0,0%,100%,0.08)",
            }}
          >
            {(
              [
                ["all", t("filterAll")],
                ["recurring", t("filterRecurring")],
                ["single", t("filterSingle")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMeetingKindFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  meetingKindFilter === id
                    ? "text-white"
                    : "text-white/30 hover:text-white/55"
                }`}
                style={
                  meetingKindFilter === id
                    ? {
                        background: "hsla(232,42%,53%,0.45)",
                        boxShadow: "0 1px 5px hsla(232,42%,53%,0.35)",
                      }
                    : {}
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers — only shown in standalone mode; match dashboard style */}
        {!isControlled && period === "custom" && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <AppDatePicker
              label={t("filterFrom")}
              value={internalFrom}
              onChange={setInternalFrom}
              placeholder="From"
              className="shrink-0"
            />
            <span className="text-white/20 text-xs">→</span>
            <AppDatePicker
              label={t("filterTo")}
              value={internalTo}
              onChange={setInternalTo}
              placeholder="To"
              className="shrink-0"
            />
          </div>
        )}
      </div>

      {/* ── Summary strip ───────────────────────────────────────── */}
      {!isPending && sortedGroups.length > 0 && (
        <div
          className="flex items-center gap-3 sm:gap-5 px-4 sm:px-5 py-2 sm:py-2.5 flex-wrap"
          style={{
            background: "hsla(0,0%,100%,0.02)",
            borderBottom: "1px solid hsla(0,0%,100%,0.05)",
          }}
        >
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-white/25">{t("summaryGroups")}</span>
            <span className="text-white/65 font-semibold">
              {sortedGroups.length}
            </span>
          </div>
          <div className="text-white/10">·</div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-white/25">{t("summaryMeetings")}</span>
            <span className="text-white/65 font-semibold">
              {activeOccurrences}
            </span>
            {totalOccurrences !== activeOccurrences && (
              <span className="text-white/25">
                (
                {t("summaryCancelled", {
                  count: totalOccurrences - activeOccurrences,
                })}
                )
              </span>
            )}
          </div>
          {!showCost && totalMinutes > 0 && (
            <>
              <div className="text-white/10">·</div>
              <div className="flex items-center gap-1.5 text-xs ml-auto">
                <span className="text-white/25">{t("summaryTotalTime")}</span>
                <span className="text-white/65 font-semibold">
                  {formatDurationMinutes(totalMinutes, locale)}
                </span>
              </div>
            </>
          )}
          {showCost && totalCost > 0 && (
            <>
              <div className="text-white/10">·</div>
              <div className="flex items-center gap-1.5 text-xs ml-auto">
                <span className="text-white/25">{t("summaryTotal")}</span>
                <span
                  className="font-bold tabular-nums text-sm"
                  style={{
                    background:
                      "linear-gradient(90deg, hsl(232,60%,72%), hsl(190,70%,62%))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {fmtEur(loc, totalCost)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Desktop / tablet table ────────────────────────────────── */}
      {!isPending && sortedGroups.length > 0 && (
        <div className="hidden sm:block">
          <div className="table-scroll-mobile">
            <div className="min-w-[520px]">
              {/* Header row – same structure & widths as GroupRow for perfect alignment */}
              <div className="px-4">
                <div
                  className="flex items-center gap-1 pr-3"
                  style={{
                    borderBottom: "1px solid hsla(0,0%,100%,0.04)",
                    fontSize: "9px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "hsla(0,0%,100%,0.45)",
                  }}
                >
                  <div className="flex-1 flex items-center gap-3 px-4 py-3.5 text-white pt-5">
                    <div className="w-4 shrink-0" />
                    <button
                      type="button"
                      onClick={() => handleSort("title")}
                      className="flex-1 flex items-center gap-1 text-left hover:text-white transition-colors"
                    >
                      <span>{t("colMeeting")}</span>
                      {sortKey === "title" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp size={11} />
                        ) : (
                          <ChevronDownIcon size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-white/25" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSort("date")}
                      className="w-44 text-right shrink-0 flex items-center justify-end gap-1 hover:text-white transition-colors"
                    >
                      <span>{t("colDate")}</span>
                      {sortKey === "date" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp size={11} />
                        ) : (
                          <ChevronDownIcon size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-white/25" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSort("duration")}
                      className="w-24 text-right shrink-0 flex items-center justify-end gap-1 hover:text-white transition-colors"
                    >
                      <span>{t("colDuration")}</span>
                      {sortKey === "duration" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp size={11} />
                        ) : (
                          <ChevronDownIcon size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-white/25" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSort("participants")}
                      className="w-14 text-right shrink-0 flex items-center justify-end gap-1 hover:text-white transition-colors"
                    >
                      <span>{t("colPeople")}</span>
                      {sortKey === "participants" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp size={11} />
                        ) : (
                          <ChevronDownIcon size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-white/25" />
                      )}
                    </button>
                    {showCost && (
                      <button
                        type="button"
                        onClick={() => handleSort("cost")}
                        className="w-24 text-right shrink-0 flex items-center justify-end gap-1 hover:text-white transition-colors"
                      >
                        <span>{t("colCost")}</span>
                        {sortKey === "cost" ? (
                          sortDirection === "asc" ? (
                            <ChevronUp size={11} />
                          ) : (
                            <ChevronDownIcon size={11} />
                          )
                        ) : (
                          <ArrowUpDown size={11} className="text-white/25" />
                        )}
                      </button>
                    )}
                  </div>
                  {canToggleExclusion && <div className="w-8 shrink-0" />}
                  {canToggleExclusion && <div className="w-8 shrink-0" />}
                </div>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {sortedGroups.map((group) => (
                  <GroupRow
                    key={group.key}
                    loc={loc}
                    group={group}
                    showCost={showCost}
                    showExclusionToggle={canToggleExclusion}
                    cancelledLabel={t("cancelled")}
                    colDateTimeLabel={t("colDateTime")}
                    colDurationLabel={t("colDuration")}
                    colPeopleLabel={t("colPeople")}
                    colCostLabel={t("colCost")}
                    onToggleGroupExclusion={handleToggleGroupExclusion}
                    showEdit={canToggleExclusion}
                    onEdit={setEditOccurrenceId}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile card list (no horizontal scroll) ──────────────── */}
      {!isPending && sortedGroups.length > 0 && (
        <div className="sm:hidden px-4 py-3 space-y-2">
          {sortedGroups.map((group) => (
            <MobileGroupRow
              key={group.key}
              loc={loc}
              group={group}
              showCost={showCost}
              showExclusionToggle={canToggleExclusion}
              cancelledLabel={t("cancelled")}
              onToggleGroupExclusion={handleToggleGroupExclusion}
            />
          ))}
        </div>
      )}

      {/* ── Loading / empty (no scroll) ───────────────────────────── */}
      {(isPending || groups.length === 0 || sortedGroups.length === 0) && (
        <div className="px-4 py-3 space-y-1.5">
          {isPending && (
            <div className="flex items-center justify-center h-36 gap-3">
              <div
                className="w-5 h-5 rounded-full border-2 animate-spin"
                style={{
                  borderColor: "hsla(232,42%,53%,0.25)",
                  borderTopColor: "hsl(232,42%,53%)",
                }}
              />
              <span className="text-xs text-white/25">{t("loading")}</span>
            </div>
          )}
          {!isPending && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-36 gap-2.5 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: "hsla(0,0%,100%,0.03)",
                  border: "1px solid hsla(0,0%,100%,0.07)",
                }}
              >
                <Calendar size={20} className="text-white/15" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/30">
                  {t("empty")}
                </p>
                <p className="text-xs text-white/15 mt-0.5">{t("emptyHint")}</p>
              </div>
            </div>
          )}
          {!isPending && groups.length > 0 && sortedGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center h-36 gap-2.5 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: "hsla(0,0%,100%,0.03)",
                  border: "1px solid hsla(0,0%,100%,0.07)",
                }}
              >
                <Search size={18} className="text-white/35" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/70">
                  {t("searchEmpty")}
                </p>
                <p className="text-xs text-white/25 mt-0.5">
                  {hasActiveFilters ? t("searchEmptyHint") : t("emptyHint")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <EditMeetingDialog
        occurrenceId={editOccurrenceId}
        open={!!editOccurrenceId}
        onOpenChange={(open) => {
          if (!open) setEditOccurrenceId(null);
        }}
        onSaved={() => {
          load();
          onAfterToggleExclusion?.();
        }}
      />
    </div>
  );
}
