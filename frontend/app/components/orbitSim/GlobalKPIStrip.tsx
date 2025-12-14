"use client";

import React, { useMemo, useState, useEffect } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { getDebugStateEntry, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import { getClassACompute, getClassAPower, getClassBCompute, getClassBPower } from "../../lib/orbitSim/satelliteClasses";
import { useSimulationStore } from "../../store/simulationStore";

interface GlobalKPIStripProps {
  timeline: YearStep[];
  currentYear?: number;
  strategyByYear?: Map<number, string>;
}

/**
 * Global KPI Strip HUD
 * SINGLE SOURCE OF TRUTH: All metrics come from debug state
 * Fixed top HUD with 5 metrics:
 * - Year
 * - Total Orbital Compute (PFLOPs) - from compute_exportable_flops
 * - % Compute from Class B - from classA_compute_raw / classB_compute_raw
 * - Total Orbital Power (GW) - from power_total_kw
 * - Carbon Delta vs Ground (%) - from timeline
 */
export default function GlobalKPIStrip({ 
  timeline, 
  currentYear,
  strategyByYear 
}: GlobalKPIStripProps) {
  if (!timeline || timeline.length === 0) return null;

  const { config } = useSimulationStore();
  const year = currentYear || timeline[timeline.length - 1].year;
  const currentStep = timeline.find(step => step.year === year) || timeline[timeline.length - 1];
  
  // Get scenario key for current scenario mode
  const scenarioKey = scenarioModeToKey(config.scenarioMode);
  
  // Force re-render when debug state changes
  const [forceUpdate, setForceUpdate] = useState(0);
  
  useEffect(() => {
    // Poll debug state periodically to catch updates
    const interval = setInterval(() => {
      setForceUpdate(prev => prev + 1);
    }, 250); // Check every 250ms for more responsive updates
    
    return () => clearInterval(interval);
  }, [year, scenarioKey]); // Depend on year and scenario to catch updates

  // Calculate metrics from debug state (ground truth)
  // ALWAYS read directly from debug state to ensure we get latest values
  const metrics = useMemo(() => {
    // Get debug entry for current year and scenario
    let currentDebugEntry = getDebugStateEntry(year, config.scenarioMode);
    let searchYear = year;
    
    // If no entry for exact year, find closest year (prefer earlier years)
    if (!currentDebugEntry) {
      const { getDebugState } = require("../../lib/orbitSim/debugState");
      const debugState = getDebugState();
      const perYear = debugState.perScenario[scenarioKey] || {};
      const availableYears = Object.keys(perYear)
        .map(Number)
        .sort((a, b) => b - a); // Sort descending to prefer recent years
      
      if (availableYears.length > 0) {
        // Find closest year (prefer years <= current year, then closest after)
        const earlierYears = availableYears.filter(y => y <= year);
        const laterYears = availableYears.filter(y => y > year);
        
        if (earlierYears.length > 0) {
          searchYear = earlierYears[0]; // Most recent year <= current
        } else if (laterYears.length > 0) {
          searchYear = laterYears[laterYears.length - 1]; // Earliest year > current
        } else {
          searchYear = availableYears[0];
        }
        
        currentDebugEntry = getDebugStateEntry(searchYear, config.scenarioMode);
      }
    } else {
      searchYear = year;
    }
    
    // Default values
    let totalComputePFLOPs = 0;
    let classBSharePercent = 0;
    let totalPowerMW = 0;
    let carbonDeltaPercent = 0;

    if (currentDebugEntry) {
      // RULE 2: EXPORTABLE COMPUTE IS THE ONLY REAL COMPUTE
      // compute_exportable_flops is in FLOPS, convert to PFLOPs
      // CRITICAL FIX: If compute_exportable_flops is very small (< 0.1 PFLOPs), use satellite counts instead
      // This handles cases where survival_fraction or backhaul constraints make exportable compute tiny
      const computeExportablePFLOPs = currentDebugEntry.compute_exportable_flops !== undefined 
        ? currentDebugEntry.compute_exportable_flops / 1e15 
        : 0;
      const computeEffectivePFLOPs = currentDebugEntry.compute_effective_flops !== undefined 
        ? currentDebugEntry.compute_effective_flops / 1e15 
        : 0;
      const computeRawPFLOPs = currentDebugEntry.compute_raw_flops !== undefined 
        ? currentDebugEntry.compute_raw_flops / 1e15 
        : 0;
      
      // Use exportable if it's meaningful (> 0.1 PFLOPs), otherwise fall back to raw or satellite counts
      if (computeExportablePFLOPs > 0.1) {
        totalComputePFLOPs = computeExportablePFLOPs;
      } else if (computeEffectivePFLOPs > 0.1) {
        totalComputePFLOPs = computeEffectivePFLOPs;
      } else if (computeRawPFLOPs > 0.1) {
        totalComputePFLOPs = computeRawPFLOPs;
      }
      
      // If compute is still 0 or very small, calculate from satellite counts (actual capacity)
      // This shows the true compute capacity, not the constrained/exportable value
      if (totalComputePFLOPs < 0.1) {
        const classASats = currentDebugEntry.classA_satellites_alive ?? 0;
        const classBSats = currentDebugEntry.classB_satellites_alive ?? 0;
        
        if (classASats > 0 || classBSats > 0) {
          // Calculate compute from satellite counts using tech curves
          // Use the actual year from debug entry, not searchYear
          const entryYear = currentDebugEntry.year ?? searchYear;
          const computePerA = getClassACompute(entryYear);
          const computePerB = getClassBCompute(entryYear);
          totalComputePFLOPs = (classASats * computePerA) + (classBSats * computePerB);
          
          // Debug logging removed for production
        }
      }

      // Class B share from debug state
      // Use classA_compute_raw and classB_compute_raw (in PFLOPs)
      const classACompute = currentDebugEntry.classA_compute_raw ?? 0;
      const classBCompute = currentDebugEntry.classB_compute_raw ?? 0;
      const totalComputeRaw = classACompute + classBCompute;
      
      if (totalComputeRaw > 0) {
        classBSharePercent = (classBCompute / totalComputeRaw) * 100;
      } else {
        // Fallback: calculate from satellite counts if compute is 0
        const classASats = currentDebugEntry.classA_satellites_alive ?? 0;
        const classBSats = currentDebugEntry.classB_satellites_alive ?? 0;
        const totalSats = classASats + classBSats;
        
        if (totalSats > 0) {
          classBSharePercent = (classBSats / totalSats) * 100;
        } else if (totalComputePFLOPs > 0) {
          // If we calculated compute from sats, calculate share from that
          const entryYear = currentDebugEntry.year ?? searchYear;
          const computePerA = getClassACompute(entryYear);
          const computePerB = getClassBCompute(entryYear);
          const classAComputeFromSats = classASats * computePerA;
          const classBComputeFromSats = classBSats * computePerB;
          const totalComputeFromSats = classAComputeFromSats + classBComputeFromSats;
          if (totalComputeFromSats > 0) {
            classBSharePercent = (classBComputeFromSats / totalComputeFromSats) * 100;
          }
        }
      }

      // Power from debug state (convert kW to MW)
      // PREFERRED: Use power_total_kw from debug state (this uses the actual power progression)
      // This is the most accurate as it comes from yearSteppedDeployment which uses the progression curve
      if (currentDebugEntry.power_total_kw !== undefined && currentDebugEntry.power_total_kw > 0) {
        totalPowerMW = currentDebugEntry.power_total_kw / 1000;
      } else {
        // Fallback: Calculate from satellite counts using tech curves
        const classASats = currentDebugEntry.classA_satellites_alive ?? 0;
        const classBSats = currentDebugEntry.classB_satellites_alive ?? 0;
        
        if (classASats > 0 || classBSats > 0) {
          // Calculate power from satellite counts using tech curves (this is the ground truth)
          // Use the actual year from debug entry, not searchYear
          const entryYear = currentDebugEntry.year ?? searchYear;
          const powerPerA = getClassAPower(entryYear);
          const powerPerB = getClassBPower(entryYear);
          const totalPowerKW = (classASats * powerPerA) + (classBSats * powerPerB);
          totalPowerMW = totalPowerKW / 1000;
        } else {
          // Fallback 2: Try class power values if still 0
          const classAPower = currentDebugEntry.classA_power_kw ?? 0;
          const classBPower = currentDebugEntry.classB_power_kw ?? 0;
          totalPowerMW = (classAPower + classBPower) / 1000;
        }
      }
    }

    // Carbon delta from timeline (this is the only metric not in debug state)
    // Use explicit values to ensure updates when timeline changes
    const carbonGround = currentStep?.carbonGround ?? 0;
    const carbonMix = currentStep?.carbonMix ?? 0;
    carbonDeltaPercent = carbonGround > 0 ? ((carbonGround - carbonMix) / carbonGround) * 100 : 0;

    return {
      totalComputePFLOPs,
      classBSharePercent,
      totalPowerMW,
      carbonDeltaPercent,
    };
  }, [year, currentStep, timeline.length, forceUpdate, config.scenarioMode, scenarioKey]); // Depend on scenario to catch updates

  // Detect threshold moments for glow/pulse animations
  const thresholdMoments = useMemo(() => {
    const moments: Array<{ type: string; glow: number }> = [];
    
    // 1. Orbit > 50% of world compute
    const orbitalShare = currentStep.orbitalShare || 0;
    if (orbitalShare > 0.5) {
      moments.push({ type: 'orbit_50_percent', glow: 0.8 });
    }
    
    // 2. First >1 TW orbital power
    const totalPowerTW = metrics.totalPowerMW / 1000 / 1000; // Convert MW to TW
    if (totalPowerTW >= 1.0) {
      moments.push({ type: 'first_1TW_power', glow: 1.0 });
    }
    
    // 3. First >1 EFLOP orbital compute
    const totalComputeEFLOPs = metrics.totalComputePFLOPs / 1000; // Convert PFLOPs to EFLOPs
    if (totalComputeEFLOPs >= 1.0) {
      moments.push({ type: 'first_1EFLOP_compute', glow: 1.0 });
    }
    
    return moments;
  }, [currentStep, metrics]);

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
      value: metrics.totalComputePFLOPs.toFixed(1),
      unit: "PFLOPs",
    },
    {
      label: "Class B Share",
      value: metrics.classBSharePercent.toFixed(1),
      unit: "%",
    },
    {
      label: "Orbital Power",
      value: (metrics.totalPowerMW / 1000).toFixed(2),
      unit: "GW",
    },
    {
      label: "Carbon Delta",
      value: metrics.carbonDeltaPercent.toFixed(1),
      unit: "%",
      suppressHydration: true, // Carbon delta depends on client-side timeline state
    },
  ];

  return (
    <div 
      className="bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-2 sm:px-4 py-2 transition-all duration-300"
      style={{
        boxShadow: glowIntensity > 0.1
          ? `0 0 ${40 * glowIntensity}px rgba(16, 185, 129, ${0.6 * glowIntensity}), 0 0 ${80 * glowIntensity}px rgba(16, 185, 129, ${0.3 * glowIntensity})`
          : 'none',
        borderColor: glowIntensity > 0.1 ? `rgba(16, 185, 129, ${0.5 * glowIntensity})` : undefined,
      }}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto gap-2 sm:gap-4 overflow-x-auto">
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
              className="flex flex-col items-center min-w-[100px] sm:min-w-[120px] flex-shrink-0 transition-all duration-300 px-2"
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
                  suppressHydrationWarning={kpi.suppressHydration}
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
