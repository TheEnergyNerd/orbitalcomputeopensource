"use client";

import { useMemo, useState, useEffect } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import KpiCard from "./KpiCard";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";

interface CostComputeChartProps {
  timeline: YearStep[];
  scenarioMode?: string; // Legacy prop, will be ignored
}

/**
 * Cost / Compute Curve Chart
 * Shows Ground vs Orbit vs Mix with crossover point
 */
export default function CostComputeChart({ timeline, scenarioMode }: CostComputeChartProps) {
  // Use selectedScenarioKey from store (single source of truth)
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
    // Use selectedScenarioKey from store instead of prop
    const entries = getDebugStateEntries(selectedScenarioKey);
    
    // Create a map for quick lookup
    const entryMap = new Map(entries.map(e => [e.year, e]));

    return timeline.map(step => {
      const debugEntry = entryMap.get(step.year);
      if (!debugEntry) {
        // If no matching debug entry for this scenario, return step with defaults
        return {
          ...step,
          costPerComputeGround: step.costPerComputeGround ?? 340,
          costPerComputeMix: step.costPerComputeMix ?? 340,
          costPerComputeOrbit: (step as any).costPerComputeOrbit ?? step.costPerComputeMix ?? 340,
        };
      }

      return {
        ...step,
        costPerComputeGround: debugEntry.cost_per_compute_ground ?? 340,
        costPerComputeMix: debugEntry.cost_per_compute_mix ?? 340,
        costPerComputeOrbit: debugEntry.cost_per_compute_orbit ?? 340,
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
        title="Cost / Compute"
        timeline={transformedTimeline}
        groundKey="costPerComputeGround"
        mixKey="costPerComputeMix"
        unitsFormatter={(v) => `$${v.toFixed(0)}`}
        isLowerBetter={true}
      />
    </div>
  );
}

