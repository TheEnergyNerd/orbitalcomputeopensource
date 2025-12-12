"use client";

import React, { useRef, useState, useEffect } from "react";
import type { YearStep, ScenarioMode } from "../../lib/orbitSim/simulationConfig";
import { getDebugStateEntry, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import { getClassACompute, getClassAPower, getClassBCompute, getClassBPower } from "../../lib/orbitSim/satelliteClasses";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";

interface DualClassStackChartProps {
  timeline: YearStep[];
  strategyByYear?: Map<number, StrategyMode>;
  scenarioMode?: ScenarioMode;
}

/**
 * Dual-Class Satellite Stack Chart
 * Stacked area chart showing Class A (bottom) and Class B (top) compute over time
 */
export default function DualClassStackChart({ 
  timeline, 
  strategyByYear,
  scenarioMode = "BASELINE"
}: DualClassStackChartProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  
  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  // Calculate Class A/B deployment data
  const deploymentData = calculateDeploymentData(timeline, strategyByYear, scenarioMode);

  const maxValue = Math.max(
    ...deploymentData.map(d => d.computeA + d.computeB),
    1
  );
  if (!isFinite(maxValue) || maxValue === 0) {
    return null;
  }

  // Responsive dimensions - FIX for desktop: use container width/height
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 500, height: 360 });
  
  useEffect(() => {
    if (containerRef.current) {
      const updateSize = () => {
        if (containerRef.current) {
          setContainerSize({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      };
      updateSize();
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
  }, []);
  
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  
  // Desktop: use container size, Mobile: use fixed sizes
  const width = isMobile 
    ? Math.min(500, typeof window !== 'undefined' ? window.innerWidth - 64 : 500)
    : containerSize.width || 500; // Use container width on desktop
  const height = isMobile
    ? Math.min(360, typeof window !== 'undefined' ? (window.innerHeight - 200) * 0.6 : 360)
    : containerSize.height || 360; // Use container height on desktop
  
  // CRITICAL: Reduced bottom padding to bring x-axis label closer to chart
  const padding = isMobile
    ? { top: 20, right: 20, bottom: 40, left: 20 }
    : { top: 20, right: 40, bottom: 40, left: 50 };

  const getX = (year: number) => {
    if (!isFinite(year) || !isFinite(firstYear) || !isFinite(yearRange) || yearRange === 0) {
      return padding.left;
    }
    return padding.left + ((year - firstYear) / yearRange) * (width - padding.left - padding.right);
  };

  const getY = (value: number) => {
    if (!isFinite(value) || !isFinite(maxValue) || maxValue === 0) {
      return height - padding.bottom;
    }
    return height - padding.bottom - ((value / maxValue) * (height - padding.top - padding.bottom));
  };

  // Generate stacked area paths
  // Class A (bottom layer)
  const classAPath = deploymentData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.computeA);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // Class B (top layer) - stacked on top of Class A
  const classBPath = deploymentData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.computeA + d.computeB);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // Create filled area for Class A
  const classAAreaPath = classAPath + 
    ` L ${getX(lastYear)} ${height - padding.bottom}` +
    ` L ${getX(firstYear)} ${height - padding.bottom} Z`;

  // Create filled area for Class B (stacked)
  const classBAreaPath = classBPath + 
    ` L ${getX(lastYear)} ${getY(deploymentData[deploymentData.length - 1]?.computeA || 0)}` +
    ` L ${getX(firstYear)} ${getY(deploymentData[0]?.computeA || 0)} Z`;

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg width={width} height={height} className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="1"
            />
          );
        })}

        {/* X-axis */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
        />

        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
        />

        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = ratio * maxValue;
          const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
          return (
            <text
              key={ratio}
              x={padding.left - 10}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="rgba(255, 255, 255, 0.6)"
            >
              {value.toFixed(0)}
            </text>
          );
        })}

        {/* X-axis labels */}
        {deploymentData.length > 0 && (
          <>
            <text
              x={getX(firstYear)}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255, 255, 255, 0.6)"
            >
              {firstYear}
            </text>
            {deploymentData.length > 1 && (
              <text
                x={getX(lastYear)}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(255, 255, 255, 0.6)"
              >
                {lastYear}
              </text>
            )}
          </>
        )}

        {/* Invisible overlay for hover detection */}
        <rect
          x={padding.left}
          y={padding.top}
          width={width - padding.left - padding.right}
          height={height - padding.top - padding.bottom}
          fill="transparent"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const yearX = ((x - padding.left) / (width - padding.left - padding.right)) * yearRange + firstYear;
            const closestData = deploymentData.reduce((prev, curr) => 
              Math.abs(curr.year - yearX) < Math.abs(prev.year - yearX) ? curr : prev
            );
            setHoveredYear(closestData.year);
            if (tooltipRef.current) {
              tooltipRef.current.style.display = "block";
              tooltipRef.current.style.left = `${e.clientX + 10}px`;
              tooltipRef.current.style.top = `${e.clientY - 10}px`;
            }
          }}
          onMouseLeave={() => {
            setHoveredYear(null);
            if (tooltipRef.current) {
              tooltipRef.current.style.display = "none";
            }
          }}
        />

        {/* Class A filled area (bottom, teal) */}
        <path
          d={classAAreaPath}
          fill="#00d4aa"
          fillOpacity="0.6"
          stroke="none"
          style={{ cursor: "crosshair" }}
        />

        {/* Class B filled area (top, cyan) */}
        <path
          d={classBAreaPath}
          fill="#00ffff"
          fillOpacity="0.6"
          stroke="none"
          style={{ cursor: "crosshair" }}
        />

        {/* Class A line (teal) */}
        <path
          d={classAPath}
          fill="none"
          stroke="#00d4aa"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Class B line (cyan) */}
        <path
          d={classBPath}
          fill="none"
          stroke="#00ffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 120}, ${padding.top + 10})`}>
          <rect x="0" y="0" width="12" height="12" fill="#00d4aa" fillOpacity="0.6" />
          <text x="18" y="10" fontSize="10" fill="rgba(255, 255, 255, 0.8)">
            Class A (LEO)
          </text>
          <rect x="0" y="18" width="12" height="12" fill="#00ffff" fillOpacity="0.6" />
          <text x="18" y="28" fontSize="10" fill="rgba(255, 255, 255, 0.8)">
            Class B (SSO)
          </text>
        </g>
      </svg>
      
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs pointer-events-none shadow-lg"
        style={{ display: "none" }}
      >
        {hoveredYear !== null && (() => {
          const data = deploymentData.find(d => d.year === hoveredYear);
          if (!data) return null;
          const total = data.computeA + data.computeB;
          const orbitShare = total > 0 ? (data.computeA / total) * 100 : 0;
          return (
            <>
              <div className="font-semibold text-white mb-1">Year: {hoveredYear}</div>
              <div className="text-slate-300">Total Compute: {total.toFixed(2)} PFLOPs</div>
              <div className="text-cyan-300">Class A: {data.computeA.toFixed(2)} PFLOPs</div>
              <div className="text-teal-300">Class B: {data.computeB.toFixed(2)} PFLOPs</div>
              <div className="text-slate-400 mt-1">Orbit Share: {orbitShare.toFixed(1)}%</div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

/**
 * Calculate deployment data from timeline
 * SINGLE SOURCE OF TRUTH: Read directly from debug state
 */
function calculateDeploymentData(
  timeline: YearStep[],
  strategyByYear?: Map<number, StrategyMode>,
  scenarioMode: ScenarioMode = "BASELINE"
): Array<{ year: number; computeA: number; computeB: number; powerMW: number }> {
  if (timeline.length === 0) return [];

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;

  // SINGLE SOURCE OF TRUTH: Read directly from debug state
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const results: Array<{ year: number; computeA: number; computeB: number; powerMW: number }> = [];
  
  for (let year = firstYear; year <= lastYear; year++) {
    const debugEntry = getDebugStateEntry(year, scenarioMode);
    
    if (!debugEntry) {
      // Skip years without debug data
      continue;
    }
    
    // RULE 2: Use compute_exportable_flops (the only real compute)
    // CRITICAL FIX: If compute_exportable_flops is very small (< 0.1 PFLOPs), use satellite counts instead
    // This handles cases where survival_fraction or backhaul constraints make exportable compute tiny
    const computeExportablePFLOPs = debugEntry.compute_exportable_flops !== undefined 
      ? debugEntry.compute_exportable_flops / 1e15 
      : 0;
    const computeEffectivePFLOPs = debugEntry.compute_effective_flops !== undefined 
      ? debugEntry.compute_effective_flops / 1e15 
      : 0;
    const computeRawPFLOPs = debugEntry.compute_raw_flops !== undefined 
      ? debugEntry.compute_raw_flops / 1e15 
      : 0;
    
    // Use exportable if it's meaningful (> 0.1 PFLOPs), otherwise fall back to raw or satellite counts
    let compute_exportable_PFLOPs = 0;
    if (computeExportablePFLOPs > 0.1) {
      compute_exportable_PFLOPs = computeExportablePFLOPs;
    } else if (computeEffectivePFLOPs > 0.1) {
      compute_exportable_PFLOPs = computeEffectivePFLOPs;
    } else if (computeRawPFLOPs > 0.1) {
      compute_exportable_PFLOPs = computeRawPFLOPs;
    }
    
    // Calculate Class A/B split from satellite counts (always use this for accuracy)
    const classASats = debugEntry.classA_satellites_alive ?? 0;
    const classBSats = debugEntry.classB_satellites_alive ?? 0;
    const computePerA = getClassACompute(year);
    const computePerB = getClassBCompute(year);
    const classAComputeFromSats = classASats * computePerA;
    const classBComputeFromSats = classBSats * computePerB;
    const totalComputeFromSats = classAComputeFromSats + classBComputeFromSats;
    
    // If compute_exportable is very small, use satellite-based calculation (actual capacity)
    if (compute_exportable_PFLOPs < 0.1 && totalComputeFromSats > 0) {
      compute_exportable_PFLOPs = totalComputeFromSats;
    }
    
    let computeA = 0;
    let computeB = 0;
    
    if (totalComputeFromSats > 0) {
      // Use satellite-based calculation for accurate split
      // Scale by the ratio of exportable to total capacity (if exportable is constrained)
      const capacityRatio = compute_exportable_PFLOPs > 0 && totalComputeFromSats > 0
        ? Math.min(1.0, compute_exportable_PFLOPs / totalComputeFromSats)
        : 1.0;
      computeA = classAComputeFromSats * capacityRatio;
      computeB = classBComputeFromSats * capacityRatio;
    } else {
      // Fallback: try to use raw compute values if satellite counts are 0
      const classACompute = debugEntry.classA_compute_raw ?? 0;
      const classBCompute = debugEntry.classB_compute_raw ?? 0;
      const totalRawCompute = classACompute + classBCompute;
      
      if (totalRawCompute > 0) {
        computeA = (classACompute / totalRawCompute) * compute_exportable_PFLOPs;
        computeB = (classBCompute / totalRawCompute) * compute_exportable_PFLOPs;
      }
    }
    
    // CRITICAL FIX: Use classA_power_kw and classB_power_kw directly from debug state
    // These values match the actual data and are calculated correctly in yearSteppedDeployment
    // Per user audit: Power vs compute class A/B charts should match the debug data
    const classAPower = debugEntry.classA_power_kw ?? 0;
    const classBPower = debugEntry.classB_power_kw ?? 0;
    const powerMW = (classAPower + classBPower) / 1000; // Convert kW to MW
    
    // If power is still 0, fallback to power_total_kw (shouldn't happen if debug data is correct)
    const powerMW_final = powerMW > 0 ? powerMW : (debugEntry.power_total_kw ?? 0) / 1000;

    results.push({
      year,
      computeA,
      computeB,
      powerMW: powerMW_final,
    });
  }

  return results;
}

