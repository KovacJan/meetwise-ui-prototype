"use client";

import {useEffect, useState, useTransition} from "react";
import {useTranslations} from "next-intl";
import {useParams, useSearchParams} from "next/navigation";
import GlassCard from "@/components/GlassCard";
import {Loader2, Star} from "lucide-react";
import {getDurationOptions} from "@/lib/survey-steps";
import {Slider} from "@/components/ui/slider";

type UsefulValue = "yes" | "partially" | "no";

type PollResponseMeta = {
  wasUseful: UsefulValue;
  actualDurationMinutes: number;
  focusLevel: "high" | "medium" | "low" | null;
  submittedAt: string;
};

type PollMeta = {
  title: string;
  durationMinutes: number;
  startTime?: string | null;
  endTime?: string | null;
  responded?: boolean;
  response?: PollResponseMeta | null;
};

function mapStarsToUseful(stars: number): UsefulValue {
  if (stars <= 2) return "no";
  if (stars <= 4) return "partially";
  return "yes";
}

function formatMetaLine(meta: PollMeta) {
  const iso = meta.startTime || meta.endTime;
  if (!iso) return `${meta.title} • ${meta.durationMinutes} min`;

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return `${meta.title} • ${meta.durationMinutes} min`;
  }

  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${meta.title} • ${day}. ${month}. ${year} • ${hours}:${minutes} • ${meta.durationMinutes} min`;
}

export default function PollPage() {
  const params = useParams<{locale: string; meetingId: string}>();
  const meetingId = Array.isArray(params.meetingId)
    ? params.meetingId[0]
    : params.meetingId;
  const locale = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const searchParams = useSearchParams();
  const linkToken = searchParams.get("t");

  const tPoll = useTranslations("poll");
  const [meta, setMeta] = useState<PollMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [focus, setFocus] = useState<"high" | "medium" | "low" | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams({meetingId: String(meetingId)});
        if (linkToken) params.set("t", linkToken);
        const res = await fetch(
          `/api/meetings/poll-metadata?${params.toString()}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setMetaError("This meeting could not be found.");
          return;
        }
        const json = (await res.json()) as PollMeta;
        if (!cancelled) {
          setMeta(json);
          const baseDuration = json.durationMinutes || 30;
          const opts = getDurationOptions(baseDuration);
          if (opts.length === 0) {
            setIndex(0);
          } else {
            let defaultIdx = opts.findIndex((v) => v === baseDuration);
            if (defaultIdx === -1) {
              // Fall back to roughly 2/3 along the scale, same as Surveys page
              defaultIdx = Math.floor(((opts.length - 1) * 2) / 3);
            }
            setIndex(Math.max(Math.min(defaultIdx, opts.length - 1), 0));
          }
          if (json.responded) {
            setAlreadyResponded(true);
          }
        }
      } catch {
        if (!cancelled) setMetaError("This meeting could not be loaded.");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [meetingId, linkToken]);

  const options = getDurationOptions(meta?.durationMinutes || 30);
  const clampedIndex = Math.min(
    Math.max(index, 0),
    Math.max(options.length - 1, 0),
  );
  const selectedMinutes = options[clampedIndex] ?? 0;

  const isValid = stars > 0 && selectedMinutes > 0 && !metaError;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || isPending) return;

    const useful = mapStarsToUseful(stars);
    const duration = selectedMinutes;

    startTransition(async () => {
      setError(null);
      try {
            const res = await fetch("/api/poll/submit", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
              body: JSON.stringify({
                meetingId: String(meetingId),
                useful,
                duration,
                focus: focus ?? undefined,
                ...(linkToken ? {t: linkToken} : {}),
              }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(
            json.error ??
              "We couldn’t save your response. Please try again.",
          );
          return;
        }
        setSubmitted(true);
      } catch {
        setError("We couldn’t save your response. Please try again.");
      }
    });
  }

  if (alreadyResponded) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <GlassCard className="max-w-md mx-auto animate-scale-in py-8 px-6 text-center space-y-3">
          <h2 className="text-xl font-bold text-foreground">
            {tPoll("alreadyAnsweredTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tPoll("alreadyAnsweredBody")}
          </p>
        </GlassCard>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <GlassCard className="max-w-md mx-auto animate-scale-in text-center py-8 px-6">
          <h2 className="text-xl font-bold text-foreground mb-2">
            Thank you!
          </h2>
          <p className="text-sm text-muted-foreground">
            Your feedback helps make future meetings more focused and efficient.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md"
      >
        <GlassCard className="w-full animate-scale-in p-5">
          <h3 className="text-base font-semibold text-foreground mb-1">
            Meeting poll
          </h3>
          {meta && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground">
                {formatMetaLine(meta)}
              </p>
              <div className="mt-1 h-px bg-white/10" />
            </div>
          )}

          {!meta && !metaError && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading meeting…</span>
            </div>
          )}

          {metaError && (
            <p className="text-xs text-destructive-foreground bg-destructive/15 border border-destructive/40 rounded-xl px-3 py-2 mb-3">
              {metaError}
            </p>
          )}

          {/* Useful stars */}
          <div className="mb-5 text-xs">
            <p className="font-medium text-foreground/80 mb-1">
              {tPoll("useful")}
            </p>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStars(value)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors touch-manipulation"
                >
                  <Star
                    size={20}
                    className={
                      value <= stars
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-muted-foreground"
                    }
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Duration slider */}
          <div className="mb-5 text-xs">
            <p className="font-medium text-foreground/80 mb-1">
              {tPoll("duration")}
            </p>
            <div className="flex flex-col gap-1.5">
              <div className="w-full flex items-center gap-3">
                <Slider
                  min={0}
                  max={Math.max(options.length - 1, 0)}
                  step={1}
                  value={[clampedIndex]}
                  onValueChange={(vals) =>
                    setIndex(
                      Math.min(
                        Math.max(vals[0] ?? 0, 0),
                        Math.max(options.length - 1, 0),
                      ),
                    )
                  }
                  className="w-full"
                />
                <span className="text-xs font-medium text-foreground min-w-[40px]">
                  {selectedMinutes} min
                </span>
              </div>
            </div>
          </div>

          {/* Optional focus question */}
          <div className="mb-5 text-xs">
            <p className="font-medium text-foreground/80 mb-1">
              {tPoll("focus")}{" "}
              <span className="text-muted-foreground/70">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                {value: "high" as const, label: tPoll("focus_high")},
                {value: "medium" as const, label: tPoll("focus_medium")},
                {value: "low" as const, label: tPoll("focus_low")},
              ].map(({value, label}) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setFocus((prev) => (prev === value ? null : value))
                  }
                  className={
                    "px-3 py-1 rounded-xl border text-[11px] transition-colors " +
                    (focus === value
                      ? value === "high"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : value === "medium"
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-red-500/15 border-red-500/40 text-red-300"
                      : "border-white/10 text-muted-foreground hover:text-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-2 text-xs text-destructive-foreground bg-destructive/15 border border-destructive/40 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!isValid || isPending}
            className="w-full mt-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            <span>Submit</span>
          </button>
        </GlassCard>
      </form>
    </div>
  );
}

