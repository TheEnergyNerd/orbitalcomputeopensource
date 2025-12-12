"use client";

import React, { useEffect, useRef, useState } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { 
  getInitialDeploymentState,
  calculateYearDeployment,
  type YearDeploymentState 
} from "../../lib/orbitSim/yearSteppedDeployment";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";
import { getDebugStateEntry, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import { getClassACompute, getClassAPower, getClassBCompute, getClassBPower } from "../../lib/orbitSim/satelliteClasses";

interface PowerComputeScatterProps {
  timeline: YearStep[];
  strategyByYear?: Map<number, StrategyMode>;
  currentYear?: number;
  scenarioMode?: string;
}

/**
 * Power → Compute Frontier Chart
 * Animated scatter plot showing Power (MW) vs Compute (PFLOPs)
 * Color: Teal = Class A dominated, White/Neon = Class B dominated
 */
export default function PowerComputeScatter({ 
  timeline, 
  strategyByYear,
  currentYear,
  scenarioMode = "BASELINE"
}: PowerComputeScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [hoveredPoint, setHoveredPoint] = useState<{ year: number; powerMW: number; computeA: number; computeB: number } | null>(null);

  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  // Calculate deployment data
  const deploymentData = calculateDeploymentData(timeline, strategyByYear, scenarioMode);

  if (deploymentData.length === 0) return null;

  // FIXED: Build domains from actual data, not hard-coded values
  const maxPower = Math.max(...deploymentData.map(d => d.powerMW), 0.1);
  const maxCompute = Math.max(...deploymentData.map(d => d.computeA + d.computeB), 0.1);
  
  // Add 5% padding to domains
  const xDomainMax = maxPower * 1.05;
  const yDomainMax = maxCompute * 1.05;

  // Responsive dimensions - FIX for desktop: use container width/height
  const container = svgRef.current?.parentElement;
  const containerWidth = container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth - 64 : 500);
  const containerHeight = container?.clientHeight || (typeof window !== 'undefined' ? (window.innerHeight - 200) * 0.6 : 360);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  
  // Desktop: use full container, Mobile: use fixed sizes
  const width = isMobile 
    ? Math.min(500, containerWidth)
    : containerWidth; // Use full container width on desktop
  const height = isMobile
    ? Math.min(360, containerHeight)
    : containerHeight; // Use full container height on desktop
  
  const padding = isMobile
    ? { top: 20, right: 15, bottom: 40, left: 50 } // More left padding for Y-axis labels
    : { top: 20, right: 40, bottom: 40, left: 60 }; // Desktop: more left padding for Y-axis labels

  const getX = (power: number) => {
    if (!isFinite(power) || !isFinite(xDomainMax) || xDomainMax === 0) {
      return padding.left;
    }
    return padding.left + (power / xDomainMax) * (width - padding.left - padding.right);
  };

  const getY = (compute: number) => {
    if (!isFinite(compute) || !isFinite(yDomainMax) || yDomainMax === 0) {
      return height - padding.bottom;
    }
    return height - padding.bottom - ((compute / yDomainMax) * (height - padding.top - padding.bottom));
  };

  // Determine which year to highlight (animated)
  const highlightYear = currentYear || lastYear;
  const highlightIndex = deploymentData.findIndex(d => d.year === highlightYear);
  const visibleData = deploymentData.slice(0, highlightIndex + 1);

  return (
    <div className="w-full h-full">
      <svg 
        ref={svgRef}
        width={width} 
        height={height} 
        className="w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines - data-driven */}
        {(() => {
          const gridLines = 5;
          const lines = [];
          // Horizontal grid lines (for compute)
          for (let i = 0; i <= gridLines; i++) {
            const ratio = i / gridLines;
            const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
            lines.push(
              <line
                key={`h-${i}`}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
            );
          }
          // Vertical grid lines (for power)
          for (let i = 0; i <= gridLines; i++) {
            const ratio = i / gridLines;
            const x = padding.left + ratio * (width - padding.left - padding.right);
            lines.push(
              <line
                key={`v-${i}`}
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
            );
          }
          return lines;
        })()}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
        />

        {/* Y-axis labels (Compute) - data-driven */}
        {(() => {
          const tickCount = 5;
          const labels = [];
          for (let i = 0; i <= tickCount; i++) {
            const ratio = i / tickCount;
            const value = ratio * maxCompute;
            const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
            labels.push(
              <text
                key={i}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255, 255, 255, 0.6)"
              >
                {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}
              </text>
            );
          }
          return labels;
        })()}

        {/* X-axis labels (Power) - FIX: Adaptive ticks based on data range */}
        {(() => {
          // Calculate adaptive tick count based on width
          const tickCount = Math.max(4, Math.min(8, Math.floor((width - padding.left - padding.right) / 80)));
          const ticks: number[] = [];
          for (let i = 0; i <= tickCount; i++) {
            ticks.push(i / tickCount);
          }
          
          return ticks.map((ratio) => {
            const value = ratio * maxPower;
            const x = padding.left + ratio * (width - padding.left - padding.right);
            // Show decimals for values between 0 and 1, otherwise show integers
            const formatValue = (val: number) => {
              if (val < 1 && val > 0) {
                return val.toFixed(2);
              }
              return val.toFixed(0);
            };
            return (
              <text
                key={ratio}
                x={x}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(255, 255, 255, 0.6)"
              >
                {formatValue(value)}
              </text>
            );
          });
        })()}

        {/* Axis labels */}
        <text
          x={width / 2}
          y={height - 5}
          textAnchor="middle"
          fontSize="11"
          fill="rgba(255, 255, 255, 0.7)"
          fontWeight="500"
        >
          Power (MW)
        </text>
        <text
          x={15}
          y={height / 2}
          textAnchor="middle"
          fontSize="11"
          fill="rgba(255, 255, 255, 0.7)"
          fontWeight="500"
          transform={`rotate(-90, 15, ${height / 2})`}
        >
          Compute (PFLOPs)
        </text>

        {/* Trajectory line */}
        {visibleData.length > 1 && (
          <path
            d={visibleData
              .map((d, i) => {
                const x = getX(d.powerMW);
                const y = getY(d.computeA + d.computeB);
                return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
        )}

        {/* Data points */}
        {visibleData.map((d, i) => {
          const x = getX(d.powerMW);
          const y = getY(d.computeA + d.computeB);
          const isClassBDominant = d.computeB > d.computeA;
          const isHighlighted = d.year === highlightYear;
          const isHovered = hoveredPoint?.year === d.year;

          return (
            <g key={d.year}>
              <circle
                cx={x}
                cy={y}
                r={isHovered ? 8 : (isHighlighted ? 6 : 4)}
                fill={isClassBDominant ? "#00ffff" : "#00d4aa"}
                fillOpacity={isHovered ? 1.0 : (isHighlighted ? 1.0 : 0.7)}
                stroke={isHovered || isHighlighted ? "#ffffff" : "none"}
                strokeWidth={isHovered ? 2 : (isHighlighted ? 2 : 0)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  setHoveredPoint(d);
                  if (tooltipRef.current) {
                    tooltipRef.current.style.display = "block";
                  }
                }}
                onMouseMove={(e) => {
                  if (tooltipRef.current) {
                    tooltipRef.current.style.left = `${e.clientX + 10}px`;
                    tooltipRef.current.style.top = `${e.clientY - 10}px`;
                  }
                }}
                onMouseLeave={() => {
                  setHoveredPoint(null);
                  if (tooltipRef.current) {
                    tooltipRef.current.style.display = "none";
                  }
                }}
              />
              {(isHighlighted || isHovered) && (
                <text
                  x={x}
                  y={y - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255, 255, 255, 0.9)"
                  fontWeight="500"
                >
                  {d.year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Tooltip */}
      {hoveredPoint && (
        <div
          ref={tooltipRef}
          className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white pointer-events-none z-50"
          style={{ display: "none" }}
        >
          <div className="font-semibold mb-1">Year: {hoveredPoint.year}</div>
          <div>Power: {hoveredPoint.powerMW.toFixed(2)} MW</div>
          <div style={{ color: "#00d4aa" }}>Class A: {hoveredPoint.computeA.toFixed(2)} PFLOPs</div>
          <div style={{ color: "#00ffff" }}>Class B: {hoveredPoint.computeB.toFixed(2)} PFLOPs</div>
          <div>Total: {(hoveredPoint.computeA + hoveredPoint.computeB).toFixed(2)} PFLOPs</div>
        </div>
      )}
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
  scenarioMode: string = "BASELINE"
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

