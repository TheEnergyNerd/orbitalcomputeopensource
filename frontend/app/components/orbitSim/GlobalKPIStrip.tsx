"use client";

import React, { useMemo, useState, useEffect } from "react";
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

  // Detect threshold moments for glow/pulse animations
  const thresholdMoments = useMemo(() => {
    const moments: Array<{ type: string; glow: number }> = [];
    
    // 1. Orbit > 50% of world compute
    const orbitalShare = currentStep.orbitalShare || 0;
    if (orbitalShare > 0.5) {
      moments.push({ type: 'orbit_50_percent', glow: 0.8 });
    }
    
    // 2. First >1 TW orbital power
    const totalPowerTW = deploymentMetrics.totalPowerMW / 1000 / 1000; // Convert MW to TW
    if (totalPowerTW >= 1.0) {
      moments.push({ type: 'first_1TW_power', glow: 1.0 });
    }
    
    // 3. First >1 EFLOP orbital compute
    const totalComputeEFLOPs = deploymentMetrics.totalComputePFLOPs / 1000; // Convert PFLOPs to EFLOPs
    if (totalComputeEFLOPs >= 1.0) {
      moments.push({ type: 'first_1EFLOP_compute', glow: 1.0 });
    }
    
    return moments;
  }, [currentStep, deploymentMetrics]);

  // Animate glow intensity
  const [glowIntensity, setGlowIntensity] = useState(0);
  useEffect(() => {
    if (thresholdMoments.length > 0) {
      const maxGlow = Math.max(...thresholdMoments.map(m => m.glow));
      setGlowIntensity(maxGlow);
      
      // Pulse animation
      const interval = setInterval(() => {
        const time = Date.now() / 1000;
        setGlowIntensity(maxGlow * (0.7 + Math.sin(time * 2) * 0.3));
      }, 50);
      return () => clearInterval(interval);
    } else {
      setGlowIntensity(0);
    }
  }, [thresholdMoments]);

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
    <div 
      className="bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-2 sm:px-4 py-2 transition-all duration-300 overflow-x-auto"
      style={{
        boxShadow: glowIntensity > 0.1
          ? `0 0 ${40 * glowIntensity}px rgba(16, 185, 129, ${0.6 * glowIntensity}), 0 0 ${80 * glowIntensity}px rgba(16, 185, 129, ${0.3 * glowIntensity})`
          : 'none',
        borderColor: glowIntensity > 0.1 ? `rgba(16, 185, 129, ${0.5 * glowIntensity})` : undefined,
      }}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto gap-2 sm:gap-4 min-w-max">
        {kpis.map((kpi, i) => {
          // Highlight specific KPIs when thresholds are reached
          const shouldGlow = thresholdMoments.some(m => 
            (m.type === 'orbit_50_percent' && kpi.label === 'Class B Share') ||
            (m.type === 'first_1TW_power' && kpi.label === 'Orbital Power') ||
            (m.type === 'first_1EFLOP_compute' && kpi.label === 'Orbital Compute')
          );
          
          return (
            <div 
              key={i} 
              className="flex flex-col items-center min-w-[100px] sm:min-w-[120px] flex-shrink-0 transition-all duration-300"
              style={{
                textShadow: shouldGlow && glowIntensity > 0.1
                  ? `0 0 ${10 * glowIntensity}px rgba(16, 185, 129, ${glowIntensity})`
                  : 'none',
              }}
            >
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
                {kpi.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span 
                  className="text-lg font-semibold transition-colors duration-300"
                  style={{
                    color: shouldGlow && glowIntensity > 0.1
                      ? `rgba(16, 185, 129, ${1.0})`
                      : 'white',
                  }}
                >
                  {kpi.value}
                </span>
                {kpi.unit && (
                  <span className="text-xs text-slate-400">
                    {kpi.unit}
                  </span>
                )}
              </div>
            </div>
          );
        })}
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

  // Use effective compute (after constraints) instead of raw compute
  const effectiveCompute = finalResult.effectiveComputePFLOPs || finalResult.totalComputePFLOPs;
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
    totalComputePFLOPs: effectiveCompute, // Use effective compute (after constraints)
    classBSharePercent: classBShare,
    totalPowerMW: finalResult.totalPowerMW,
    carbonDeltaPercent: carbonDelta,
  };
}

