"use client";

import { useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import KpiCard from "./KpiCard";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";

interface LatencyChartProps {
  timeline: YearStep[];
  scenarioMode?: string; // Legacy prop, will be ignored
}

/**
 * Latency Curve Chart
 * Shows Ground vs Orbit (flat vs bending downward)
 */
export default function LatencyChart({ timeline, scenarioMode }: LatencyChartProps) {
  // Use selectedScenarioKey from store (single source of truth)
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey);

  const transformedTimeline = useMemo(() => {
    // Use selectedScenarioKey from store instead of prop
    const entries = getDebugStateEntries(selectedScenarioKey);
    
    const entryMap = new Map(entries.map(e => [e.year, e]));

    return timeline.map(step => {
      const debugEntry = entryMap.get(step.year);
      if (!debugEntry) {
        return {
          ...step,
          latencyGroundMs: step.latencyGroundMs ?? 120,
          latencyMixMs: step.latencyMixMs ?? 120,
        };
      }

      // Use debug entry values (scenario-specific)
      return {
        ...step,
        latencyGroundMs: debugEntry.latency_ground_ms ?? step.latencyGroundMs ?? 120,
        latencyMixMs: debugEntry.latency_mix_ms ?? step.latencyMixMs ?? 120,
      };
    });
  }, [timeline, selectedScenarioKey]);

  return (
    <div className="h-full">
      <KpiCard
        title="Latency"
        timeline={transformedTimeline}
        groundKey="latencyGroundMs"
        mixKey="latencyMixMs"
        unitsFormatter={(v) => `${v.toFixed(1)} ms`}
        isLowerBetter={true}
      />
    </div>
  );
}

