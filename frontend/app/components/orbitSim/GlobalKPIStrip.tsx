"use client";

import React from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { 
  getInitialDeploymentState,
  calculateYearDeployment,
  type YearDeploymentState 
} from "../../lib/orbitSim/yearSteppedDeployment";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";

interface GlobalKPIStripProps {
  timeline: YearStep[];
  currentYear?: number;
  strategyByYear?: Map<number, StrategyMode>;
}

/**
 * Global KPI Strip HUD
 * Fixed top HUD with 5 metrics:
 * - Year
 * - Total Orbital Compute (PFLOPs)
 * - % Compute from Class B
 * - Total Orbital Power (GW)
 * - Carbon Delta vs Ground (%)
 */
export default function GlobalKPIStrip({ 
  timeline, 
  currentYear,
  strategyByYear 
}: GlobalKPIStripProps) {
  if (!timeline || timeline.length === 0) return null;

  const year = currentYear || timeline[timeline.length - 1].year;
  const currentStep = timeline.find(step => step.year === year) || timeline[timeline.length - 1];

  // Calculate deployment metrics for current year
  const deploymentMetrics = calculateDeploymentMetrics(timeline, year, strategyByYear);

  const kpis = [
    {
      label: "Year",
      value: year.toString(),
      unit: "",
    },
    {
      label: "Orbital Compute",
      value: deploymentMetrics.totalComputePFLOPs.toFixed(1),
      unit: "PFLOPs",
    },
    {
      label: "Class B Share",
      value: deploymentMetrics.classBSharePercent.toFixed(1),
      unit: "%",
    },
    {
      label: "Orbital Power",
      value: (deploymentMetrics.totalPowerMW / 1000).toFixed(2),
      unit: "GW",
    },
    {
      label: "Carbon Delta",
      value: deploymentMetrics.carbonDeltaPercent.toFixed(1),
      unit: "%",
    },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-4 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {kpis.map((kpi, i) => (
            <div key={i} className="flex flex-col items-center min-w-[120px]">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
                {kpi.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-white">
                  {kpi.value}
                </span>
                {kpi.unit && (
                  <span className="text-xs text-slate-400">
                    {kpi.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate deployment metrics for a specific year
 */
function calculateDeploymentMetrics(
  timeline: YearStep[],
  targetYear: number,
  strategyByYear?: Map<number, StrategyMode>
): {
  totalComputePFLOPs: number;
  classBSharePercent: number;
  totalPowerMW: number;
  carbonDeltaPercent: number;
} {
  if (timeline.length === 0) {
    return {
      totalComputePFLOPs: 0,
      classBSharePercent: 0,
      totalPowerMW: 0,
      carbonDeltaPercent: 0,
    };
  }

  const firstYear = timeline[0].year;
  const lastYear = Math.min(targetYear, timeline[timeline.length - 1].year);

  // Build strategy map
  const strategyMap = strategyByYear || new Map<number, StrategyMode>();
  timeline.forEach(step => {
    if (!strategyMap.has(step.year)) {
      strategyMap.set(step.year, "BALANCED");
    }
  });

  // Run deployment simulation up to target year
  let state: YearDeploymentState = getInitialDeploymentState();
  let finalResult = null;

  for (let year = firstYear; year <= lastYear; year++) {
    const strategy = strategyMap.get(year) || "BALANCED";
    const result = calculateYearDeployment(state, strategy);
    finalResult = result;

    // Update state for next year
    state = {
      year: year + 1,
      strategy,
      S_A: result.S_A,
      S_A_lowLEO: result.S_A_lowLEO,
      S_A_midLEO: result.S_A_midLEO,
      S_A_sunSync: result.S_A_sunSync,
      S_B: result.S_B,
      deployedByYear_A: new Map(state.deployedByYear_A),
      deployedByYear_B: new Map(state.deployedByYear_B),
      totalComputePFLOPs: result.totalComputePFLOPs,
      totalPowerMW: result.totalPowerMW,
    };
    state.deployedByYear_A.set(year, result.newA);
    state.deployedByYear_B.set(year, result.newB);
  }

  if (!finalResult) {
    return {
      totalComputePFLOPs: 0,
      classBSharePercent: 0,
      totalPowerMW: 0,
      carbonDeltaPercent: 0,
    };
  }

  const computeA = finalResult.S_A * finalResult.computePerA;
  const computeB = finalResult.S_B * finalResult.computePerB;
  const totalCompute = computeA + computeB;
  const classBShare = totalCompute > 0 ? (computeB / totalCompute) * 100 : 0;

  // Get carbon delta from timeline step
  const currentStep = timeline.find(step => step.year === targetYear) || timeline[timeline.length - 1];
  const carbonGround = currentStep.carbonGround || 0;
  const carbonMix = currentStep.carbonMix || 0;
  const carbonDelta = carbonGround > 0 ? ((carbonGround - carbonMix) / carbonGround) * 100 : 0;

  return {
    totalComputePFLOPs: totalCompute,
    classBSharePercent: classBShare,
    totalPowerMW: finalResult.totalPowerMW,
    carbonDeltaPercent: carbonDelta,
  };
}

