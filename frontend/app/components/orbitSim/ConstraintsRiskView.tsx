"use client";

import { useState, useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import {
  buildUtilizationSeries,
  buildReliabilitySeries,
  buildLaunchMassSeries,
} from "../../lib/orbitSim/selectors/constraints";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";
import { ExportAllChartsButton } from "./ChartExportButton";
import ConstraintUtilizationChart from "./ConstraintUtilizationChart";
import ReliabilityChart from "./ReliabilityChart";
import LaunchMassChart from "./LaunchMassChart";

/**
 * Constraints & Risk View
 * Shows what can break and what's binding
 */
export default function ConstraintsRiskView() {
  const { config, timeline } = useSimulationStore();
  const [highlightedYear, setHighlightedYear] = useState<number | undefined>(
    timeline.length > 0 ? timeline[timeline.length - 1].year : 2025
  );

  // Memoize all data builders with scenarioMode dependency to ensure re-computation on scenario change
  const utilizationData = useMemo(() => buildUtilizationSeries(config.scenarioMode), [config.scenarioMode]);
  const reliabilityData = useMemo(() => buildReliabilitySeries(config.scenarioMode), [config.scenarioMode]);
  const launchMassData = useMemo(() => buildLaunchMassSeries(config.scenarioMode), [config.scenarioMode]);

  if (utilizationData.length === 0) {
    return (
      <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 text-center text-slate-400">
        No constraint data available. Run a simulation to see constraint metrics.
      </div>
    );
  }

  return (
    <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 space-y-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white mb-2">Constraints & Risk</h1>
          <p className="text-xs sm:text-sm text-slate-400">What can break? What's binding?</p>
        </div>
        <div className="flex-shrink-0">
          <ExportAllChartsButton />
        </div>
      </div>

      {/* Charts in 2-column grid on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 1. Constraint Utilization Over Time */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="constraint-utilization">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Constraint Utilization Over Time
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            Lines: utilization_heat, utilization_backhaul, utilization_autonomy. Hover to see values.
          </div>
          <div className="h-[300px] sm:h-[350px] w-full">
            <ConstraintUtilizationChart
              data={utilizationData}
              currentYear={highlightedYear}
              scenarioMode={config.scenarioMode}
            />
          </div>
        </div>

        {/* 2. Headroom to Limits */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="headroom-limits">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Headroom to Limits
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            1 - utilization for each constraint. Hover to see values.
          </div>
          <div className="h-[300px] sm:h-[350px] w-full">
            <ConstraintUtilizationChart
              data={utilizationData.map(d => ({
                year: d.year,
                heat: 1 - d.heat,
                backhaul: 1 - d.backhaul,
                autonomy: 1 - d.autonomy,
              }))}
              currentYear={highlightedYear}
              scenarioMode={config.scenarioMode}
              showHeadroom={true}
            />
          </div>
        </div>

        {/* 3. Fleet Survival / Reliability */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="fleet-survival">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Fleet Survival / Reliability
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            survival_fraction vs year. Hover to see values.
          </div>
          <div className="h-[300px] sm:h-[350px] w-full">
            <ReliabilityChart
              data={reliabilityData}
              currentYear={highlightedYear}
              scenarioMode={config.scenarioMode}
            />
          </div>
        </div>

        {/* 4. Launch Mass vs Ceiling */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="launch-mass">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Launch Mass vs Ceiling
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            launchMassThisYearKg vs launchMassCeiling. Hover to see values.
          </div>
          <div className="h-[300px] sm:h-[350px] w-full">
            <LaunchMassChart
              data={launchMassData}
              currentYear={highlightedYear}
              scenarioMode={config.scenarioMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

