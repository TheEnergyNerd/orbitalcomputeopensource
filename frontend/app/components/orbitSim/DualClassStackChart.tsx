"use client";

import React from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { 
  runMultiYearDeployment, 
  getInitialDeploymentState,
  calculateYearDeployment,
  type YearDeploymentState 
} from "../../lib/orbitSim/yearSteppedDeployment";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";

interface DualClassStackChartProps {
  timeline: YearStep[];
  strategyByYear?: Map<number, StrategyMode>;
}

/**
 * Dual-Class Satellite Stack Chart
 * Stacked area chart showing Class A (bottom) and Class B (top) compute over time
 */
export default function DualClassStackChart({ 
  timeline, 
  strategyByYear 
}: DualClassStackChartProps) {
  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  // Calculate Class A/B deployment data
  const deploymentData = calculateDeploymentData(timeline, strategyByYear);

  const maxValue = Math.max(
    ...deploymentData.map(d => d.computeA + d.computeB),
    1
  );
  if (!isFinite(maxValue) || maxValue === 0) {
    return null;
  }

  // Responsive dimensions
  const width = typeof window !== 'undefined' 
    ? Math.min(500, window.innerWidth - 64) 
    : 500;
  const height = typeof window !== 'undefined'
    ? Math.min(360, (window.innerHeight - 200) * 0.6)
    : 360;
  const padding = { top: 20, right: 24, bottom: 35, left: 50 }; // Increased padding to prevent cutoff

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
    <div className="w-full">
      <svg width={width} height={height} className="w-full h-auto">
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

        {/* Class A filled area (bottom, teal) */}
        <path
          d={classAAreaPath}
          fill="#00d4aa"
          fillOpacity="0.6"
          stroke="none"
        />

        {/* Class B filled area (top, cyan) */}
        <path
          d={classBAreaPath}
          fill="#00ffff"
          fillOpacity="0.6"
          stroke="none"
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
    </div>
  );
}

/**
 * Calculate deployment data from timeline
 */
function calculateDeploymentData(
  timeline: YearStep[],
  strategyByYear?: Map<number, StrategyMode>
): Array<{ year: number; computeA: number; computeB: number; powerMW: number }> {
  if (timeline.length === 0) return [];

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;

  // Build strategy map from timeline if not provided
  const strategyMap = strategyByYear || new Map<number, StrategyMode>();
  timeline.forEach(step => {
    // Try to infer strategy from step if available
    // For now, default to BALANCED
    if (!strategyMap.has(step.year)) {
      strategyMap.set(step.year, "BALANCED");
    }
  });

  // Run deployment simulation
  let state: YearDeploymentState = getInitialDeploymentState();
  const results: Array<{ year: number; computeA: number; computeB: number; powerMW: number }> = [];

  for (let year = firstYear; year <= lastYear; year++) {
    const strategy = strategyMap.get(year) || "BALANCED";
    const result = calculateYearDeployment(state, strategy);
    
    // Calculate compute per class
    const computeA = result.S_A * result.computePerA;
    const computeB = result.S_B * result.computePerB;

    results.push({
      year,
      computeA,
      computeB,
      powerMW: result.totalPowerMW,
    });

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

  return results;
}

