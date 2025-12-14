"use client";

import { useMemo, useState, useEffect } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import KpiCard from "./KpiCard";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";

interface ComputePerDollarChartProps {
  timeline: YearStep[];
  scenarioMode?: string;
}

function formatPFLOPsPerBillion(value: number): string {
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  } else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

function calculateComputePerDollar(
  costPerPFLOP: number
): number {
  if (costPerPFLOP <= 0 || !Number.isFinite(costPerPFLOP)) {
    return 0;
  }
  return 1e9 / costPerPFLOP;
}

export default function ComputePerDollarChart({ timeline, scenarioMode }: ComputePerDollarChartProps) {
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey);
  const [sandboxActive, setSandboxActive] = useState(false);
  
  useEffect(() => {
    const checkSandbox = () => {
      if (typeof window !== 'undefined') {
        const params = (window as { __physicsSandboxParams?: unknown }).__physicsSandboxParams;
        setSandboxActive(!!params);
      }
    };
    checkSandbox();
    const interval = setInterval(checkSandbox, 100);
    window.addEventListener('physics-sandbox-applied', checkSandbox);
    return () => {
      clearInterval(interval);
      window.removeEventListener('physics-sandbox-applied', checkSandbox);
    };
  }, []);

  const transformedTimeline = useMemo(() => {
    const entries = getDebugStateEntries(selectedScenarioKey);
    const entryMap = new Map(entries.map(e => [e.year, e]));

    return timeline.map(step => {
      const debugEntry = entryMap.get(step.year);
      if (!debugEntry) {
        const groundCost = step.costPerComputeGround ?? 280;
        const mixCost = step.costPerComputeMix ?? 280;
        return {
          ...step,
          computePerDollarGround: calculateComputePerDollar(groundCost),
          computePerDollarMix: calculateComputePerDollar(mixCost),
        };
      }

      const groundCost = debugEntry.cost_per_compute_ground ?? 280;
      const mixCost = debugEntry.cost_per_compute_mix ?? 280;
      
      return {
        ...step,
        computePerDollarGround: calculateComputePerDollar(groundCost),
        computePerDollarMix: calculateComputePerDollar(mixCost),
      };
    });
  }, [timeline, selectedScenarioKey]);

  return (
    <div className="h-full relative">
      {sandboxActive && (
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded text-xs text-cyan-400 font-semibold">
          Sandbox Active
        </div>
      )}
      <KpiCard
        title="Compute Per Dollar"
        timeline={transformedTimeline}
        groundKey="computePerDollarGround"
        mixKey="computePerDollarMix"
        unitsFormatter={(v) => formatPFLOPsPerBillion(v)}
        isLowerBetter={false}
      />
    </div>
  );
}

