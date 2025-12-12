"use client";

import { useState, useEffect } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import { debugScenarioData } from "../../lib/orbitSim/selectors/scenarioHelpers";
import OpexStreamgraph from "./OpexStreamgraph";
import CarbonRiver from "./CarbonRiver";
import PowerComputeFrontier from "./PowerComputeFrontier";
import CostComputeChart from "./CostComputeChart";
import LatencyChart from "./LatencyChart";
import CrossoverChart from "./CrossoverChart";

export default function SystemOverviewView() {
  const { timeline, yearPlans, config } = useSimulationStore();
  const [highlightedYear, setHighlightedYear] = useState<number | undefined>(
    timeline.length > 0 ? timeline[timeline.length - 1].year : 2025
  );
  const [chartsExpanded, setChartsExpanded] = useState<boolean>(false);

  // Debug: Log scenario data when scenarioMode changes
  useEffect(() => {
    debugScenarioData(config.scenarioMode);
  }, [config.scenarioMode]);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 text-center text-slate-400">
        No simulation data available. Run a simulation to see overview metrics.
      </div>
    );
  }

  return (
    <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 space-y-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white mb-2">System Overview</h1>
          <p className="text-xs sm:text-sm text-slate-400">Executive fast-read: four macro-economics axes + the frontier</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setChartsExpanded(!chartsExpanded)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition-colors"
          >
            {chartsExpanded ? "Collapse Charts" : "Expand Charts"}
          </button>
        </div>
      </div>

      {!chartsExpanded && (
        <div className="text-center py-8 text-slate-400">
          <p>Click "Expand Charts" to view detailed visualizations</p>
        </div>
      )}

      {chartsExpanded && (
        <>
      {/* 0. Crossover Chart - Economic Singularity */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="crossover">
        <div className="text-[10px] sm:text-xs font-semibold text-slate-100 mb-1">
          Economic Singularity (Cost Crossover)
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Ground (red) stays flat/rises. Orbit (blue) crashes through. Intersection marked as "ECONOMIC SINGULARITY".
        </div>
        <div className="h-[300px] sm:h-[600px] w-full" key={`crossover-${config.scenarioMode}`}>
          <CrossoverChart timeline={timeline} scenarioMode={config.scenarioMode} />
        </div>
      </div>

      {/* 1. Cost / Compute Curve */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="cost-compute">
        <div className="text-[10px] sm:text-xs font-semibold text-slate-100 mb-1">
          Cost / Compute Curve
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Ground vs Orbit vs Mix - Shows crossover point and cost trajectory. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[600px] w-full" key={`cost-${config.scenarioMode}`}>
          <CostComputeChart timeline={timeline} scenarioMode={config.scenarioMode} />
        </div>
      </div>

      {/* 2. Latency Curve */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="latency">
        <div className="text-[10px] sm:text-xs font-semibold text-slate-100 mb-1">
          Latency Curve
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Ground vs Orbit (flat vs bending downward). Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[600px] w-full" key={`latency-${config.scenarioMode}`}>
          <LatencyChart timeline={timeline} scenarioMode={config.scenarioMode} />
        </div>
      </div>

      {/* 3. Annual OPEX */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="annual-opex">
        <div className="text-[10px] sm:text-xs font-semibold text-slate-100 mb-1">
          Annual OPEX
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Ground vs Orbit vs Mix - Reflects learning curves + saturation
        </div>
        <div className="h-[300px] sm:h-[600px] w-full" key={`opex-${config.scenarioMode}`}>
          <OpexStreamgraph 
            currentYear={highlightedYear || timeline[timeline.length - 1].year}
            onYearClick={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 4. Carbon Curve */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="carbon-curve">
        <div className="text-[10px] sm:text-xs font-semibold text-slate-100 mb-1">
          Carbon Curve
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Ground vs Orbit vs Mix - Mix crosses below ground once orbital solar savings dominate
        </div>
        <div className="h-[300px] sm:h-[600px] w-full" key={`carbon-${config.scenarioMode}`}>
          <CarbonRiver 
            currentYear={highlightedYear || timeline[timeline.length - 1].year}
            onYearClick={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 5. Power → Compute Frontier */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="power-compute-frontier-overview">
        <div className="text-[10px] sm:text-xs font-semibold text-slate-100 mb-1">
          Power → Compute Frontier
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Compute-per-kW vs year - Exponential for bull, logistic for baseline, flattened for bear
        </div>
        <div className="h-[300px] sm:h-[600px] w-full overflow-visible" key={`frontier-${config.scenarioMode}`}>
          <PowerComputeFrontier 
            currentYear={highlightedYear || timeline[timeline.length - 1].year}
            onYearClick={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

        </>
      )}
    </div>
  );
}

