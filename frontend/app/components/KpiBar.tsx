"use client";

import { useSimStore } from "../store/simStore";
import { useEffect, useState } from "react";

function AnimatedMetric({ value, unit, label }: { value: number; unit: string; label: string }) {
  const safeValue = value ?? 0;
  const [displayValue, setDisplayValue] = useState(safeValue);

  useEffect(() => {
    const startValue = displayValue ?? 0;
    const targetValue = safeValue ?? 0;
    const diff = targetValue - startValue;
    const steps = 20;
    const stepSize = diff / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(targetValue);
        clearInterval(interval);
      } else {
        setDisplayValue(startValue + stepSize * currentStep);
      }
    }, 15);

    return () => clearInterval(interval);
  }, [safeValue]);

  const displayNum = displayValue ?? 0;

  return (
    <div className="panel-glass rounded-xl p-4 min-w-[160px] hover:border-accent-blue/40 transition-all">
      <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold text-accent-blue metric-value">
        {displayNum.toFixed(1)}
        <span className="text-sm text-gray-400 ml-1.5 font-normal">{unit}</span>
      </div>
    </div>
  );
}

export default function KpiBar() {
  const state = useSimStore((s) => s.state);

  if (!state || !state.metrics) return null;

  const metrics = state.metrics;

  const totalEnergyCost = (metrics.energyCostGround ?? 0) + (metrics.energyCostOrbit ?? 0);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 flex gap-4 z-20 flex-wrap justify-center">
      <AnimatedMetric value={metrics.avgLatencyMs ?? 0} unit="ms" label="Avg Latency" />
      <AnimatedMetric value={metrics.orbitSharePercent ?? 0} unit="%" label="Orbit Share" />
      <AnimatedMetric value={totalEnergyCost ?? 0} unit="$" label="Energy Cost" />
    </div>
  );
}

