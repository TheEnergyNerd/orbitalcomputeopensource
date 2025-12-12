"use client";

import { useState, useRef } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import MultiScenarioChart from "./MultiScenarioChart";
import {
  buildScenarioCostSeries,
  buildScenarioOpexSeries,
  buildScenarioCarbonSeries,
  buildScenarioAdoptionSeries,
  buildShellOccupancySeries,
  buildCostCrossoverSeries,
  buildComputeEfficiencySeries,
  type ScenarioKey,
} from "../../lib/orbitSim/selectors/scenarios";
import {
  buildCostConeSeries,
  buildCarbonConeSeries,
  buildAdoptionConeSeries,
} from "../../lib/orbitSim/selectors/cones";
import ConeChart from "./ConeChart";
import FuturesConeVisualization from "../futures/FuturesConeVisualization";
import Futures3DScene from "../futures/Futures3DScene";
import FleetGrowthChart from "./FleetGrowthChart";
import CostCrossoverChart from "./CostCrossoverChart";
import ComputeEfficiencyChart from "./ComputeEfficiencyChart";
import { ExportAllChartsButton } from "./ChartExportButton";

/**
 * Futures (Scenarios) View
 * Shows how baseline, bear, and bull scenarios diverge
 */
export default function ScenariosView() {
  const { timeline } = useSimulationStore();
  const futuresForecast = useSimulationStore((s) => s.futuresForecast);
  const [highlightedYear, setHighlightedYear] = useState<number | undefined>(
    timeline.length > 0 ? timeline[timeline.length - 1].year : 2025
  );
  const scene3DRef = useRef<HTMLDivElement>(null);

  const costSeries = buildScenarioCostSeries();
  const opexSeries = buildScenarioOpexSeries();
  const carbonSeries = buildScenarioCarbonSeries();
  const adoptionSeries = buildScenarioAdoptionSeries();
  
  // Cone series for uncertainty bands
  const costConeSeries = buildCostConeSeries();
  const carbonConeSeries = buildCarbonConeSeries();
  const adoptionConeSeries = buildAdoptionConeSeries();
  
  // New Futures tab charts - using BASELINE scenario by default
  const fleetGrowthData = buildShellOccupancySeries("BASELINE");
  const costCrossoverData = buildCostCrossoverSeries("BASELINE");
  const computeEfficiencyData = buildComputeEfficiencySeries("BASELINE");

  if (costSeries.length === 0 && opexSeries.length === 0) {
    return (
      <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 text-center text-slate-400">
        No scenario data available. Run simulations with different scenarios to see comparisons.
      </div>
    );
  }


  return (
    <div className="pt-20 sm:pt-24 px-4 sm:px-6 pb-8 space-y-6 max-w-7xl mx-auto">
      <div className="mb-4 flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white mb-2">Futures (Scenarios)</h1>
          <p className="text-xs sm:text-sm text-slate-400">How do baseline, bear, and bull scenarios diverge?</p>
        </div>
        <div className="flex-shrink-0">
          <ExportAllChartsButton />
        </div>
      </div>

      {/* 1. Cost / Compute */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="cost-compute"> {/* CRITICAL: Expanded panel vertically with more padding (py-3 to py-4) */}
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Scenario: Cost / Compute
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Three lines: baseline (solid), bear (dashed), bull (bright). Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[600px] w-full"> {/* CRITICAL: Increased desktop to 600px to take up more panel space */}
          <MultiScenarioChart
            title="Cost / Compute"
            data={costSeries}
            metric="$ / PFLOP"
            currentYear={highlightedYear}
          />
        </div>
      </div>

      {/* 2. Annual OPEX */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="annual-opex"> {/* CRITICAL: Expanded panel vertically with more padding (py-3 to py-4) */}
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Scenario: Annual OPEX
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Three lines of annual_opex_mix. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[600px] w-full"> {/* CRITICAL: Increased desktop to 600px to take up more panel space */}
          <MultiScenarioChart
            title="Annual OPEX"
            data={opexSeries}
            metric="$ / yr"
            currentYear={highlightedYear}
          />
        </div>
      </div>

      {/* 3. Carbon */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="carbon"> {/* CRITICAL: Expanded panel vertically with more padding (py-3 to py-4) */}
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Scenario: Carbon
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Three lines of annual_carbon_mix. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[600px] w-full"> {/* CRITICAL: Increased desktop to 600px to take up more panel space */}
          <MultiScenarioChart
            title="Carbon"
            data={carbonSeries}
            metric="tCO₂ / yr"
            currentYear={highlightedYear}
          />
        </div>
      </div>

      {/* 4. Adoption Share */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
        <div className="text-xs font-semibold text-slate-100 mb-1">
          Scenario: Adoption Share
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
          Three lines: orbit share vs time for each scenario. Hover to see values.
        </div>
        <div className="h-[300px] sm:h-[600px] w-full"> {/* CRITICAL: Increased desktop to 600px to take up more panel space */}
          <MultiScenarioChart
            title="Orbit Adoption"
            data={adoptionSeries}
            metric="% orbit"
            currentYear={highlightedYear}
          />
        </div>
      </div>

      {/* 5. Fleet Growth (Stacked Area) */}
      {fleetGrowthData.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="fleet-growth">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Fleet Growth by Orbital Shell
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            Stacked area: LOW (cyan), MID (green), SSO (orange). Hover to see values.
          </div>
          <div className="h-[300px] sm:h-[600px] w-full">
            <FleetGrowthChart
              data={fleetGrowthData}
              currentYear={highlightedYear}
            />
          </div>
        </div>
      )}

      {/* 6. Orbit vs Ground Cost Crossover */}
      {costCrossoverData.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="cost-crossover">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Orbit vs Ground Cost Crossover
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            Solid cyan = Orbit, Dashed orange = Ground. Shaded region shows orbit advantage after crossover.
          </div>
          <div className="h-[300px] sm:h-[600px] w-full">
            <CostCrossoverChart
              data={costCrossoverData}
              currentYear={highlightedYear}
            />
          </div>
        </div>
      )}

      {/* 7. Compute Efficiency Trajectory */}
      {computeEfficiencyData.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-4" data-chart="compute-efficiency">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            Compute Efficiency (PFLOPS/kW)
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            Bars show actual efficiency. Orange bars exceed Moore's Law limit. H100 baseline (3 PFLOPS/kW) shown as dashed line.
          </div>
          <div className="h-[300px] sm:h-[600px] w-full">
            <ComputeEfficiencyChart
              data={computeEfficiencyData}
              currentYear={highlightedYear}
            />
          </div>
        </div>
      )}

      {/* Cone Charts - Uncertainty Bands */}
      {costConeSeries.length > 0 && (
        <>
          {/* Cost Cone */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
            <div className="text-xs font-semibold text-slate-100 mb-1">
              Cost / Compute: Uncertainty Band
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
              Band of plausible futures showing min (bear), max (bull), and median (baseline) scenarios.
            </div>
            <div className="h-[450px] sm:h-[700px] w-full"> {/* Expanded desktop height to 700px */}
              <ConeChart
                title="Cost / Compute"
                data={costConeSeries}
                metric="$ / PFLOP"
                currentYear={highlightedYear}
              />
            </div>
          </div>

          {/* Carbon Cone */}
          {carbonConeSeries.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
              <div className="text-xs font-semibold text-slate-100 mb-1">
                Carbon: Uncertainty Band
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
                Band of plausible futures showing min (bear), max (bull), and median (baseline) scenarios.
              </div>
            <div className="h-[450px] sm:h-[700px] w-full"> {/* Expanded desktop height to 700px */}
              <ConeChart
                title="Carbon"
                data={carbonConeSeries}
                metric="tCO₂ / yr"
                currentYear={highlightedYear}
              />
            </div>
            </div>
          )}

          {/* Adoption Cone */}
          {adoptionConeSeries.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
              <div className="text-xs font-semibold text-slate-100 mb-1">
                Adoption Share: Uncertainty Band
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
                Band of plausible futures showing min (bear), max (bull), and median (baseline) scenarios.
              </div>
              <div className="h-[450px] sm:h-[700px] w-full"> {/* Expanded desktop height to 700px */}
                <ConeChart
                  title="Orbit Adoption"
                  data={adoptionConeSeries}
                  metric="% orbit"
                  currentYear={highlightedYear}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* 5. 3D Futures Visualization */}
      {futuresForecast && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
          <div className="text-xs font-semibold text-slate-100 mb-1">
            3D Futures Forecast
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
            Interactive 3D visualization showing cost trajectories, uncertainty cones, and sentiment particles. Rotate and zoom to explore.
          </div>
          <div className="h-[400px] sm:h-[500px] w-full relative" ref={scene3DRef}> {/* Increased height for desktop */}
            <Futures3DScene containerRef={scene3DRef} />
          </div>
        </div>
      )}

      {/* 6. Futures Particle Charts (2D) */}
      {futuresForecast && (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
            <div className="text-xs font-semibold text-slate-100 mb-1">
              Orbit Futures Forecast (2D)
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
              Particle visualization showing market sentiment and volatility. Hover to see forecast values.
            </div>
            <div className="h-[400px] sm:h-[600px] w-full"> {/* Increased height for desktop to show x-axis */}
              <FuturesConeVisualization
                forecast={futuresForecast}
                type="orbit"
                width={800}
                height={600} // Increased height for desktop
                animated={true}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/85 px-3 sm:px-4 py-3">
            <div className="text-xs font-semibold text-slate-100 mb-1">
              Ground Futures Forecast (2D)
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-500 mb-2">
              Particle visualization showing market sentiment and volatility. Hover to see forecast values.
            </div>
            <div className="h-[400px] sm:h-[600px] w-full"> {/* Increased height for desktop to show x-axis */}
              <FuturesConeVisualization
                forecast={futuresForecast}
                type="ground"
                width={800}
                height={600} // Increased height for desktop
                animated={true}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

