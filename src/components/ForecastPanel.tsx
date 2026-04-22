"use client";

import {useState, useTransition} from "react";
import {
  X,
  TrendingUp,
  Calendar,
  Calculator,
  Minus,
  Plus,
} from "lucide-react";
import {useTranslations} from "next-intl";
import {calculateCustomRangeCost} from "@/app/[locale]/(dashboard)/dashboard/actions";
import {AppDatePicker} from "@/components/AppDatePicker";

// ─── formatters ────────────────────────────────────────────────────────────

const fmtEur = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const fmtEurFull = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(v);

// ─── types ─────────────────────────────────────────────────────────────────

type ForecastTab = "projection" | "custom";

const PROJECTION_YEARS = [1, 3, 5, 10] as const;

// ─── projection bar card ───────────────────────────────────────────────────

function ProjectionCard({
  years,
  cost,
  maxCost,
  index,
}: {
  years: number;
  cost: number;
  maxCost: number;
  index: number;
}) {
  const t = useTranslations("forecast");
  const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
  const gradients = [
    "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
    "linear-gradient(135deg, hsl(270,60%,50%), hsl(232,60%,55%))",
    "linear-gradient(135deg, hsl(190,70%,50%), hsl(150,60%,45%))",
    "linear-gradient(135deg, hsl(30,90%,55%), hsl(0,75%,55%))",
  ];

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        background: "hsla(0,0%,100%,0.04)",
        border: "1px solid hsla(0,0%,100%,0.08)",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">
            {years} {t(years === 1 ? "year_one" : "year_other")}
          </p>
          <p className="text-2xl font-bold text-white tabular-nums leading-none">
            {fmtEur(cost)}
          </p>
        </div>
        <div
          className="text-[9px] font-bold px-2 py-1 rounded-full"
          style={{
            background: gradients[index],
            color: "white",
          }}
        >
          ×{years}
        </div>
      </div>

      {/* progress bar */}
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{background: "hsla(0,0%,100%,0.06)"}}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: gradients[index],
          }}
        />
      </div>
    </div>
  );
}

// ─── main panel ────────────────────────────────────────────────────────────

interface ForecastPanelProps {
  onClose: () => void;
  monthlyCost: number;
  annualCost: number;
}

export default function ForecastPanel({
  onClose,
  monthlyCost,
  annualCost,
}: ForecastPanelProps) {
  const t = useTranslations("forecast");
  const [tab, setTab] = useState<ForecastTab>("projection");

  // Projection state
  const [monthlyInput, setMonthlyInput] = useState(
    Math.round(monthlyCost || annualCost / 12),
  );

  // Custom range state
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeCost, setRangeCost] = useState<number | null>(null);
  const [rangeDays, setRangeDays] = useState(0);
  const [isPending, startTransition] = useTransition();

  const annual = monthlyInput * 12;
  const projections = PROJECTION_YEARS.map((years) => ({
    years,
    cost: annual * years,
  }));
  const maxProjection = projections[projections.length - 1].cost;

  const adjust = (delta: number) => {
    setMonthlyInput((v) => Math.max(0, Math.round(v + delta)));
  };

  const handleCalculate = () => {
    if (!from || !to) return;
    const fromDate = new Date(from + "T00:00:00");
    const toDate = new Date(to + "T23:59:59");
    const days =
      Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    setRangeDays(days);
    setRangeCost(null);
    startTransition(async () => {
      const cost = await calculateCustomRangeCost(
        fromDate.toISOString(),
        toDate.toISOString(),
      );
      setRangeCost(cost);
    });
  };

  const fmtRangeLabel = () => {
    if (!from || !to) return "";
    const a = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(from + "T12:00:00"));
    const b = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(to + "T12:00:00"));
    return `${a} – ${b}`;
  };

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
          width: "min(460px, 100vw)",
          background:
            "linear-gradient(180deg, hsl(237,56%,10%) 0%, hsl(235,56%,14%) 100%)",
          borderLeft: "1px solid hsla(0,0%,100%,0.10)",
          boxShadow: "-24px 0 80px hsla(232,60%,10%,0.8)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{borderBottom: "1px solid hsla(0,0%,100%,0.08)"}}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(30,90%,55%), hsl(0,75%,55%))",
              }}
            >
              <TrendingUp size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                {t("title")}
              </p>
              <p className="text-xs text-white/35">
                {t("subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div
          className="flex gap-1 px-5 py-3 shrink-0"
          style={{
            borderBottom: "1px solid hsla(0,0%,100%,0.06)",
            background: "hsla(232,45%,14%,1)",
          }}
        >
          {(
            [
              {id: "projection" as const, icon: <TrendingUp size={13} />, label: t("tabProjection")},
              {id: "custom" as const, icon: <Calendar size={13} />, label: t("tabRange")},
            ] as const
          ).map(({id, icon, label}) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                tab === id
                  ? "text-white"
                  : "text-white/30 hover:text-white/55"
              }`}
              style={
                tab === id
                  ? {
                      background: "hsla(232,65%,30%,1)",
                      border: "1px solid hsla(232,65%,45%,1)",
                    }
                  : {
                      background: "hsla(232,45%,18%,1)",
                      border: "1px solid hsla(232,45%,28%,1)",
                    }
              }
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-5 py-5 space-y-5 [scrollbar-width:thin] [scrollbar-color:hsla(30,70%,50%,0.3)_transparent]"
        >
          {tab === "projection" && (
            <>
              {/* Monthly cost input */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2.5">
                  {t("assumedMonthly")}
                </p>
                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: "hsla(0,0%,100%,0.04)",
                    border: "1px solid hsla(0,0%,100%,0.10)",
                  }}
                >
                  {/* Quick reduce */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjust(-monthlyInput * 0.1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] transition-all text-[10px] font-bold"
                      title="-10%"
                    >
                      −10%
                    </button>
                    <button
                      onClick={() => adjust(-100)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] transition-all"
                    >
                      <Minus size={12} />
                    </button>
                  </div>

                  {/* Input */}
                  <div className="flex-1 flex items-center gap-1.5 justify-center">
                    <span className="text-white/40 text-sm">€</span>
                    <input
                      type="number"
                      min={0}
                      value={monthlyInput}
                      onChange={(e) =>
                        setMonthlyInput(Math.max(0, Number(e.target.value)))
                      }
                      className="bg-transparent text-xl font-bold text-white text-center w-32 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-white/30 text-xs">{t("perMonthSuffix")}</span>
                  </div>

                  {/* Quick increase */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjust(100)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] transition-all"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => adjust(monthlyInput * 0.1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] transition-all text-[10px] font-bold"
                      title="+10%"
                    >
                      +10%
                    </button>
                  </div>
                </div>

                {/* Reset to actual */}
                {monthlyCost > 0 && monthlyInput !== Math.round(monthlyCost) && (
                  <button
                    onClick={() => setMonthlyInput(Math.round(monthlyCost))}
                    className="text-[11px] text-white/25 hover:text-white/50 mt-1.5 transition-colors"
                  >
                    {t("resetToActual", {value: fmtEur(monthlyCost)})}
                  </button>
                )}
              </div>

              {/* Annual rate summary */}
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{
                  background: "hsla(232,45%,18%,1)",
                  border: "1px solid hsla(232,45%,32%,1)",
                }}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30">
                    {t("annualValue")}
                  </p>
                  <p
                    className="text-2xl font-bold mt-0.5 tabular-nums"
                    style={{
                      background:
                        "linear-gradient(90deg, hsl(30,90%,65%), hsl(0,75%,65%))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {fmtEur(annual)}
                  </p>
                </div>
                <Calculator size={24} className="text-white/10" />
              </div>

              {/* Projection cards */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">
                  {t("multiYear")}
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {projections.map((p, i) => (
                    <ProjectionCard
                      key={p.years}
                      years={p.years}
                      cost={p.cost}
                      maxCost={maxProjection}
                      index={i}
                    />
                  ))}
                </div>
              </div>

              {/* Disclaimer */}
              <p className="text-[10px] text-white/20 leading-relaxed">
                {t("disclaimer")}
              </p>
            </>
          )}

          {tab === "custom" && (
            <>
              {/* Date inputs */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2.5">
                  {t("selectRange")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <AppDatePicker
                    label={t("from")}
                    value={from}
                    onChange={(v) => {
                      setFrom(v);
                      setRangeCost(null);
                    }}
                    placeholder={t("from")}
                  />
                  <AppDatePicker
                    label={t("to")}
                    value={to}
                    onChange={(v) => {
                      setTo(v);
                      setRangeCost(null);
                    }}
                    placeholder={t("to")}
                  />
                </div>
              </div>

              {/* Calculate button */}
              <button
                type="button"
                onClick={handleCalculate}
                disabled={!from || !to || isPending}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(30,90%,55%), hsl(0,75%,55%))",
                  boxShadow: "0 4px 16px hsla(30,90%,55%,0.25)",
                }}
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full border-2 animate-spin inline-block"
                      style={{
                        borderColor: "hsla(0,0%,100%,0.3)",
                        borderTopColor: "white",
                      }}
                    />
                    {t("calculating")}
                  </span>
                ) : (
                  t("calculateBtn")
                )}
              </button>

              {/* Result */}
              {rangeCost !== null && (
                <div
                  className="rounded-2xl p-5 text-center animate-scale-in"
                  style={{
                    background: "hsla(0,0%,100%,0.04)",
                    border: "1px solid hsla(0,0%,100%,0.10)",
                  }}
                >
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
                    {t("totalCost")}
                  </p>
                  <p
                    className="text-4xl font-bold tabular-nums mb-2"
                    style={{
                      background:
                        "linear-gradient(90deg, hsl(30,90%,65%), hsl(0,75%,65%))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {fmtEurFull(rangeCost)}
                  </p>
                  <p className="text-xs text-white/30">{fmtRangeLabel()}</p>
                  <p className="text-xs text-white/20 mt-1">
                    {rangeDays}d
                  </p>

                  {rangeCost > 0 && rangeDays > 0 && (
                    <div
                      className="mt-4 pt-4 grid grid-cols-3 gap-3"
                      style={{borderTop: "1px solid hsla(0,0%,100%,0.07)"}}
                    >
                      {[
                        {
                          label: t("perDay"),
                          value: rangeCost / rangeDays,
                        },
                        {
                          label: t("perWeek"),
                          value: (rangeCost / rangeDays) * 7,
                        },
                        {
                          label: t("perMonth"),
                          value: (rangeCost / rangeDays) * 30.44,
                        },
                      ].map(({label, value}) => (
                        <div key={label}>
                          <p className="text-[10px] text-white/25">{label}</p>
                          <p className="text-sm font-bold text-white/70 tabular-nums mt-0.5">
                            {fmtEur(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {rangeCost === 0 && !isPending && from && to && (
                <div className="text-center text-sm text-white/30 py-4">
                  {t("empty")}
                  <br />
                  <span className="text-xs text-white/20">
                    {t("emptyHint")}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
