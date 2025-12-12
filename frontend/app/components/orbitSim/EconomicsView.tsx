"use client";

import { useState } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import OpexStreamgraph from "./OpexStreamgraph";
import CarbonRiver from "./CarbonRiver";
import DualClassStackChart from "./DualClassStackChart";
import { getStrategyByYear } from "./SimpleModeView";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";

export default function EconomicsView() {
  const { timeline, yearPlans, config } = useSimulationStore();
  const currentYear = timeline.length > 0 ? timeline[timeline.length - 1].year : config.startYear;
  const [highlightedYear, setHighlightedYear] = useState<number | undefined>(currentYear);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 text-center text-slate-400">
        No simulation data available. Run a simulation to see economics charts.
      </div>
    );
  }

  return (
    <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 space-y-6 max-w-7xl mx-auto">
      {/* OPEX Streamgraph */}
      <div 
        id="opex-streamgraph"
        className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3 transition-all duration-300"
      >
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Annual OPEX Streamgraph
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Stacked: Launch (red), Orbit OPEX (orange), Ground (blue). Green band = savings
        </div>
        <div className="h-[400px]">
          <OpexStreamgraph 
            currentYear={highlightedYear || currentYear}
            onYearClick={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* Carbon River */}
      <div 
        id="carbon-river"
        className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3 transition-all duration-300"
      >
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Carbon Draining River
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Wide red river = all-ground, green band = mix, teal gap = avoided carbon
        </div>
        <div className="h-[400px]">
          <CarbonRiver 
            currentYear={highlightedYear || currentYear}
            onYearClick={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* Adoption Dynamics */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Adoption Dynamics
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Orbit vs Ground compute share over time
        </div>
        <div className="h-[300px]">
          <DualClassStackChart timeline={timeline} strategyByYear={getStrategyByYear(timeline, yearPlans)} />
        </div>
      </div>
    </div>
  );
}

