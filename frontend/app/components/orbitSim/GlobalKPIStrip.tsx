"use client";

import React, { useMemo, useState, useEffect } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { getDebugStateEntry, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import { getClassACompute, getClassAPower, getClassBCompute, getClassBPower } from "../../lib/orbitSim/satelliteClasses";
import { useSimulationStore } from "../../store/simulationStore";
import { DEFAULT_RADIATION_MODEL } from "../../lib/orbitSim/radiationModel";
import { DEFAULT_THERMAL_MODEL, calculateMaxPowerFromThermal } from "../../lib/orbitSim/thermalModel";

interface GlobalKPIStripProps {
  timeline: YearStep[];
  currentYear?: number;
  strategyByYear?: Map<number, string>;
}

export default function GlobalKPIStrip({ 
  timeline, 
  currentYear,
  strategyByYear 
}: GlobalKPIStripProps) {
  const [mounted, setMounted] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [glowIntensity, setGlowIntensity] = useState(0);
  
  const { config } = useSimulationStore();
  
  const year = timeline && timeline.length > 0 
    ? (currentYear || timeline[timeline.length - 1].year)
    : (currentYear || 2025);
  const currentStep = timeline && timeline.length > 0
    ? (timeline.find(step => step.year === year) || timeline[timeline.length - 1])
    : null;
  const scenarioKey = scenarioModeToKey(config.scenarioMode);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    if (!mounted) return;
    
    const interval = setInterval(() => {
      setForceUpdate(prev => prev + 1);
    }, 250);
    
    return () => clearInterval(interval);
  }, [mounted, year, scenarioKey]);

  const metrics = useMemo(() => {
    if (!timeline || timeline.length === 0 || !currentStep) {
      return {
        totalComputePFLOPs: 0,
        classBSharePercent: 0,
        totalPowerMW: 0,
        carbonDeltaPercent: 0,
        radiationLossPercent: 0,
        thermalLimitPercent: 0,
        maxPowerPerSatKw: 0,
      };
    }
    let currentDebugEntry = getDebugStateEntry(year, config.scenarioMode);
    let searchYear = year;
    
    if (!currentDebugEntry) {
      const { getDebugState } = require("../../lib/orbitSim/debugState");
      const debugState = getDebugState();
      const perYear = debugState.perScenario[scenarioKey] || {};
      const availableYears = Object.keys(perYear)
        .map(Number)
        .sort((a, b) => b - a);
      
      if (availableYears.length > 0) {
        const earlierYears = availableYears.filter(y => y <= year);
        const laterYears = availableYears.filter(y => y > year);
        
        if (earlierYears.length > 0) {
          searchYear = earlierYears[0];
        } else if (laterYears.length > 0) {
          searchYear = laterYears[laterYears.length - 1];
        } else {
          searchYear = availableYears[0];
        }
        
        currentDebugEntry = getDebugStateEntry(searchYear, config.scenarioMode);
      }
    } else {
      searchYear = year;
    }
    
    let totalComputePFLOPs = 0;
    let classBSharePercent = 0;
    let totalPowerMW = 0;
    let carbonDeltaPercent = 0;

    if (currentDebugEntry) {
      const computeExportablePFLOPs = currentDebugEntry.compute_exportable_flops !== undefined 
        ? currentDebugEntry.compute_exportable_flops / 1e15 
        : 0;
      const computeEffectivePFLOPs = currentDebugEntry.compute_effective_flops !== undefined 
        ? currentDebugEntry.compute_effective_flops / 1e15 
        : 0;
      const computeRawPFLOPs = currentDebugEntry.compute_raw_flops !== undefined 
        ? currentDebugEntry.compute_raw_flops / 1e15 
        : 0;
      
      if (computeExportablePFLOPs > 0.1) {
        totalComputePFLOPs = computeExportablePFLOPs;
      } else if (computeEffectivePFLOPs > 0.1) {
        totalComputePFLOPs = computeEffectivePFLOPs;
      } else if (computeRawPFLOPs > 0.1) {
        totalComputePFLOPs = computeRawPFLOPs;
      }
      
      if (totalComputePFLOPs < 0.1) {
        const classASats = currentDebugEntry.classA_satellites_alive ?? 0;
        const classBSats = currentDebugEntry.classB_satellites_alive ?? 0;
        
        if (classASats > 0 || classBSats > 0) {
          const entryYear = currentDebugEntry.year ?? searchYear;
          const computePerA = getClassACompute(entryYear);
          const computePerB = getClassBCompute(entryYear);
          totalComputePFLOPs = (classASats * computePerA) + (classBSats * computePerB);
        }
      }

      const classACompute = currentDebugEntry.classA_compute_raw ?? 0;
      const classBCompute = currentDebugEntry.classB_compute_raw ?? 0;
      const totalComputeRaw = classACompute + classBCompute;
      
      if (totalComputeRaw > 0) {
        classBSharePercent = (classBCompute / totalComputeRaw) * 100;
      } else {
        const classASats = currentDebugEntry.classA_satellites_alive ?? 0;
        const classBSats = currentDebugEntry.classB_satellites_alive ?? 0;
        const totalSats = classASats + classBSats;
        
        if (totalSats > 0) {
          classBSharePercent = (classBSats / totalSats) * 100;
        } else if (totalComputePFLOPs > 0) {
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

      if (currentDebugEntry.power_total_kw !== undefined && currentDebugEntry.power_total_kw > 0) {
        totalPowerMW = currentDebugEntry.power_total_kw / 1000;
      } else {
        const classASats = currentDebugEntry.classA_satellites_alive ?? 0;
        const classBSats = currentDebugEntry.classB_satellites_alive ?? 0;
        
        if (classASats > 0 || classBSats > 0) {
          const entryYear = currentDebugEntry.year ?? searchYear;
          const powerPerA = getClassAPower(entryYear);
          const powerPerB = getClassBPower(entryYear);
          const totalPowerKW = (classASats * powerPerA) + (classBSats * powerPerB);
          totalPowerMW = totalPowerKW / 1000;
        } else {
          const classAPower = currentDebugEntry.classA_power_kw ?? 0;
          const classBPower = currentDebugEntry.classB_power_kw ?? 0;
          totalPowerMW = (classAPower + classBPower) / 1000;
        }
      }
    }

    const carbonGround = currentStep?.carbonGround ?? 0;
    const carbonMix = currentStep?.carbonMix ?? 0;
    carbonDeltaPercent = carbonGround > 0 ? ((carbonGround - carbonMix) / carbonGround) * 100 : 0;

    const radiationLossPercent = DEFAULT_RADIATION_MODEL.eccOverhead * 100;
    
    const hasDeployableRadiators = year >= 2028;
    const maxPowerPerSatKw = calculateMaxPowerFromThermal(hasDeployableRadiators, DEFAULT_THERMAL_MODEL);
    const currentPowerPerSatKw = currentDebugEntry && currentDebugEntry.satellitesTotal > 0
      ? (currentDebugEntry.power_total_kw || 0) / currentDebugEntry.satellitesTotal
      : 0;
    const thermalLimitPercent = maxPowerPerSatKw > 0 
      ? Math.min(100, (currentPowerPerSatKw / maxPowerPerSatKw) * 100)
      : 0;

    return {
      totalComputePFLOPs,
      classBSharePercent,
      totalPowerMW,
      carbonDeltaPercent,
      radiationLossPercent,
      thermalLimitPercent,
      maxPowerPerSatKw,
    };
  }, [year, currentStep, timeline.length, forceUpdate, config.scenarioMode, scenarioKey]);

  const thresholdMoments = useMemo(() => {
    const moments: Array<{ type: string; glow: number }> = [];
    
    if (!currentStep) return moments;
    
    const orbitalShare = currentStep.orbitalShare || 0;
    if (orbitalShare > 0.5) {
      moments.push({ type: 'orbit_50_percent', glow: 0.8 });
    }
    
    const totalPowerTW = metrics.totalPowerMW / 1000 / 1000;
    if (totalPowerTW >= 1.0) {
      moments.push({ type: 'first_1TW_power', glow: 1.0 });
    }
    
    const totalComputeEFLOPs = metrics.totalComputePFLOPs / 1000;
    if (totalComputeEFLOPs >= 1.0) {
      moments.push({ type: 'first_1EFLOP_compute', glow: 1.0 });
    }
    
    return moments;
  }, [currentStep, metrics]);

  useEffect(() => {
    if (thresholdMoments.length > 0) {
      const maxGlow = Math.max(...thresholdMoments.map(m => m.glow));
      setGlowIntensity(maxGlow);
      
      const interval = setInterval(() => {
        const time = Date.now() / 1000;
        setGlowIntensity(maxGlow * (0.7 + Math.sin(time * 2) * 0.3));
      }, 50);
      return () => clearInterval(interval);
    } else {
      setGlowIntensity(0);
    }
  }, [thresholdMoments]);
  
  if (!mounted) {
    return (
      <div className="bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-2 sm:px-4 py-2">
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center items-center text-xs sm:text-sm">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (!timeline || timeline.length === 0) return null;

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
      suppressHydration: true,
    },
    {
      label: "Radiation Loss",
      value: metrics.radiationLossPercent.toFixed(0),
      unit: "% ECC",
      tooltip: "15% compute overhead for error correction",
    },
    {
      label: "Thermal Limit",
      value: metrics.thermalLimitPercent.toFixed(0),
      unit: "%",
      tooltip: `${metrics.maxPowerPerSatKw.toFixed(1)} kW/sat max`,
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
              <div 
                className="text-[10px] text-slate-400 uppercase tracking-wide mb-1"
                title={(kpi as any).tooltip || ""}
              >
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
                  title={(kpi as any).tooltip || ""}
                >
                  {kpi.value}
                </span>
                {kpi.unit && (
                  <span className="text-xs text-slate-400" title={(kpi as any).tooltip || ""}>
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
