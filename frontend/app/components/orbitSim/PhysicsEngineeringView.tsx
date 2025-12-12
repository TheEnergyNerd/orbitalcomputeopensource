"use client";

import { useState, useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import PowerComputeFrontier from "./PowerComputeFrontier";
import {
  buildMassBreakdownSeries,
  buildRadiatorComputeSeries,
  buildThermalSeries,
  buildSolarUptimeSeries,
} from "../../lib/orbitSim/selectors/physics";
import MassBreakdownChart from "./MassBreakdownChart";
import RadiatorComputeChart from "./RadiatorComputeChart";
import ThermalChart from "./ThermalChart";
import SolarUptimeChart from "./SolarUptimeChart";
import ConstraintDial from "./ConstraintDial";
import PowerComputeScatter from "./PowerComputeScatter";
import DualClassStackChart from "./DualClassStackChart";
import { getStrategyByYear } from "./SimpleModeView";
import MassEfficiencyWaterfall from "./MassEfficiencyWaterfall";
import MooresLawOfMass from "./MooresLawOfMass";

/**
 * Physics & Limits View
 * Shows what the actual physics looks like
 */
export default function PhysicsEngineeringView() {
  const { timeline, config, yearPlans } = useSimulationStore();
  const [highlightedYear, setHighlightedYear] = useState<number | undefined>(
    timeline.length > 0 ? timeline[timeline.length - 1].year : 2025
  );

  // Memoize all data builders with scenarioMode dependency to ensure re-computation on scenario change
  const massData = useMemo(() => buildMassBreakdownSeries(config.scenarioMode), [config.scenarioMode]);
  const radiatorData = useMemo(() => buildRadiatorComputeSeries(config.scenarioMode), [config.scenarioMode]);
  const thermalData = useMemo(() => buildThermalSeries(config.scenarioMode), [config.scenarioMode]);
  const solarData = useMemo(() => buildSolarUptimeSeries(config.scenarioMode), [config.scenarioMode]);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 text-center text-slate-400">
        No simulation data available. Run a simulation to see physics metrics.
      </div>
    );
  }

  return (
    <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 space-y-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white mb-2">Physics & Limits</h1>
          <p className="text-xs sm:text-sm text-slate-400">What does the actual physics look like?</p>
        </div>
        <div className="flex-shrink-0">
        </div>
      </div>

      {/* 1. Power → Compute Frontier */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="power-compute-frontier">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Power → Compute Frontier
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          power_total_kw vs compute_effective_flops
        </div>
        <div className="h-[300px] sm:h-[600px] w-full overflow-visible"> {/* CRITICAL: Increased desktop height to 600px to fill panel more, overflow-visible for right side */}
          <PowerComputeFrontier 
            currentYear={highlightedYear || timeline[timeline.length - 1].year}
            onYearClick={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 2. Mass Breakdown per Satellite */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="mass-breakdown">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Mass Breakdown per Satellite
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Stacked area: solar, radiator, silicon, shielding, structure
        </div>
        <div className="h-[300px] sm:h-[500px] w-full"> {/* CRITICAL: Increased desktop height to 500px to fill panel */}
          <MassBreakdownChart
            data={massData}
            currentYear={highlightedYear}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 3. Radiator Area vs Compute */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="radiator-compute">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Radiator Area vs Compute
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          radiator_area_m2 vs compute_effective_flops. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[500px] w-full"> {/* CRITICAL: Increased desktop height to 500px to fill panel */}
          <RadiatorComputeChart
            data={radiatorData}
            currentYear={highlightedYear}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 4. Temperatures and Heat Ceiling */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="thermal">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Temperatures and Heat Ceiling
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          temp_core_C and temp_radiator_C vs year, plus heatCeiling. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[500px] w-full"> {/* CRITICAL: Increased desktop height to 500px to fill panel */}
          <ThermalChart
            data={thermalData}
            currentYear={highlightedYear}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 5. Solar Uptime / Irradiance */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="solar-uptime">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Solar Uptime / Irradiance
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          space_solar_uptime_percent vs ground_solar_plus_storage_uptime_percent. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[500px] w-full"> {/* CRITICAL: Increased desktop height to 500px to fill panel */}
          <SolarUptimeChart
            data={solarData}
            currentYear={highlightedYear}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 6. Constraint Dial (Interactive Radial Chart) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="constraint-dial">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Constraint Dial
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Radial: Mass fractions (blue) and utilizations (green dashed). Scroll to change year. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[500px] w-full overflow-hidden"> {/* CRITICAL: Increased desktop height to 500px to fill panel */}
          <ConstraintDial 
            currentYear={highlightedYear || timeline[timeline.length - 1].year}
            onYearChange={(year) => setHighlightedYear(year)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* 7. Power vs Compute Scatter (Class A/B) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="power-compute-scatter">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Power vs Compute (Class A/B)
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Animated scatter: Teal = Class A dominated, Cyan = Class B dominated. Hover to see values.
        </div>
        <div className="h-[400px] sm:h-[800px] w-full overflow-visible"> {/* Full panel height on desktop */}
          <PowerComputeScatter 
            timeline={timeline} 
            currentYear={highlightedYear || timeline[timeline.length - 1].year}
            strategyByYear={getStrategyByYear(timeline, yearPlans)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* Extra spacing between Power vs Compute and Compute Over Time charts */}
      <div className="h-4 sm:h-6"></div>

      {/* 8. Dual Class Stack Chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="dual-class-stack">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Compute Over Time (Class A + Class B)
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Stacked area: Class A (teal, bottom) + Class B (cyan, top). Hover to see values.
        </div>
        <div className="h-[400px] sm:h-[800px] w-full overflow-visible"> {/* Full panel height on desktop */}
          <DualClassStackChart 
            timeline={timeline} 
            strategyByYear={getStrategyByYear(timeline, yearPlans)}
            scenarioMode={config.scenarioMode}
          />
        </div>
      </div>

      {/* C. Mass Efficiency Waterfall */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="mass-efficiency-waterfall">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Mass Efficiency Waterfall
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Comparing 1 MW Datacenter: Earth (huge infrastructure) vs Class A (batteries) vs Class B (minimal - "the best part is no part").
        </div>
        <div className="h-[300px] sm:h-[500px] w-full">
          <MassEfficiencyWaterfall scenarioMode={config.scenarioMode} />
        </div>
      </div>

      {/* D. Moore's Law of Mass (TFLOPS per kg) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3" data-chart="moores-law-mass">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Moore's Law of Mass (TFLOPS per kg)
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Compute density of launched payload over time. We aren't just launching chips; we're making the support structure disappear.
        </div>
        <div className="h-[300px] sm:h-[500px] w-full">
          <MooresLawOfMass scenarioMode={config.scenarioMode} />
        </div>
      </div>
    </div>
  );
}
