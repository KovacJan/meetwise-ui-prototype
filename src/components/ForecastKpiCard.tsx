"use client";

import {useState} from "react";
import {TrendingUp, ChevronRight} from "lucide-react";
import {useTranslations} from "next-intl";
import ForecastPanel from "./ForecastPanel";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

interface ForecastKpiCardProps {
  monthlyCost: number;
  annualCost: number;
}

export default function ForecastKpiCard({
  monthlyCost,
  annualCost,
}: ForecastKpiCardProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("dashboard");

  // Project based on current monthly average (not year-to-date total)
  const projected = monthlyCost > 0 ? monthlyCost * 12 : annualCost;

  return (
    <>
      {/* Same structure as KpiCard (div, not button) so gradient reaches top with no gap */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="glass rounded-2xl overflow-hidden animate-fade-in w-full text-left group transition-all duration-200 hover:ring-1 hover:ring-orange-500/40 cursor-pointer"
      >
        <div className="px-5 py-3 flex items-center gap-2 gradient-orange-red">
          <TrendingUp size={16} className="text-foreground/80" />
          <span className="text-sm font-medium text-foreground/90 flex-1">
            {t("forecastTitle")}
          </span>
          <ChevronRight
            size={14}
            className="text-foreground/40 transition-transform group-hover:translate-x-0.5"
          />
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="text-3xl font-bold text-foreground">
            {fmtCurrency(projected)}
          </div>
          <div className="flex items-center justify-between mt-1 gap-2">
            <div className="text-sm text-muted-foreground">
              {monthlyCost > 0
                ? t("forecastSubtitle", {monthly: fmtCurrency(monthlyCost)})
                : t("forecastSubtitleNoData")}
            </div>
            {/* Animated hint — same line as subtitle */}
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{background: "hsl(30,90%,55%)"}}
              />
              <span className="text-[10px] text-white/25 group-hover:text-white/50 transition-colors whitespace-nowrap">
                {t("forecastOpenHint")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Forecast panel ─────────────────────────────────────── */}
      {open && (
        <ForecastPanel
          onClose={() => setOpen(false)}
          monthlyCost={monthlyCost}
          annualCost={annualCost}
        />
      )}
    </>
  );
}
