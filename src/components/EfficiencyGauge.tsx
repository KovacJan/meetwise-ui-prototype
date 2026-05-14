"use client";

import React from "react";
// @ts-expect-error - third-party library without TS types
import GaugeChart from "react-gauge-chart";

type Props = {
  score: number | null;
};

export function EfficiencyGauge({score}: Props) {
  const clamped =
    score == null ? 0 : Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div className="w-full flex flex-col items-center">
      <GaugeChart
        id="efficiency-gauge"
        nrOfLevels={20}
        arcsLength={[0.4, 0.3, 0.3]}
        colors={["#FACC15", "#FB923C", "#EF4444"]}
        arcPadding={0.02}
        arcWidth={0.3} 
        percent={clamped / 100}
        needleColor="#E5E7EB"
        needleBaseColor="#020617"
        hideText
        style={{width: "100%"}}
      />
      <div className="mt-1 text-xs font-semibold text-foreground">
        {score == null ? "—" : `${Math.round(clamped)}/100`}
      </div>
    </div>
  );
}


