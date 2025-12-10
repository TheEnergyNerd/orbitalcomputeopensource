"use client";

import React, { useEffect, useRef } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { 
  getInitialDeploymentState,
  calculateYearDeployment,
  type YearDeploymentState 
} from "../../lib/orbitSim/yearSteppedDeployment";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";

interface PowerComputeScatterProps {
  timeline: YearStep[];
  strategyByYear?: Map<number, StrategyMode>;
  currentYear?: number;
}

/**
 * Power → Compute Frontier Chart
 * Animated scatter plot showing Power (MW) vs Compute (PFLOPs)
 * Color: Teal = Class A dominated, White/Neon = Class B dominated
 */
export default function PowerComputeScatter({ 
  timeline, 
  strategyByYear,
  currentYear 
}: PowerComputeScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationFrameRef = useRef<number>();

  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  // Calculate deployment data
  const deploymentData = calculateDeploymentData(timeline, strategyByYear);

  if (deploymentData.length === 0) return null;

  const maxPower = Math.max(...deploymentData.map(d => d.powerMW), 1);
  const maxCompute = Math.max(...deploymentData.map(d => d.computeA + d.computeB), 1);

  // Responsive dimensions
  const width = typeof window !== 'undefined' 
    ? Math.min(500, window.innerWidth - 64) 
    : 500;
  const height = typeof window !== 'undefined'
    ? Math.min(360, (window.innerHeight - 200) * 0.6)
    : 360;
  const padding = { top: 20, right: 24, bottom: 35, left: 50 }; // Increased padding to prevent cutoff

  const getX = (power: number) => {
    if (!isFinite(power) || !isFinite(maxPower) || maxPower === 0) {
      return padding.left;
    }
    return padding.left + (power / maxPower) * (width - padding.left - padding.right);
  };

  const getY = (compute: number) => {
    if (!isFinite(compute) || !isFinite(maxCompute) || maxCompute === 0) {
      return height - padding.bottom;
    }
    return height - padding.bottom - ((compute / maxCompute) * (height - padding.top - padding.bottom));
  };

  // Determine which year to highlight (animated)
  const highlightYear = currentYear || lastYear;
  const highlightIndex = deploymentData.findIndex(d => d.year === highlightYear);
  const visibleData = deploymentData.slice(0, highlightIndex + 1);

  return (
    <div className="w-full">
      <svg 
        ref={svgRef}
        width={width} 
        height={height} 
        className="w-full h-auto"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
          const x = padding.left + ratio * (width - padding.left - padding.right);
          return (
            <React.Fragment key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
            </React.Fragment>
          );
        })}

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

        {/* Y-axis labels (Compute) */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = ratio * maxCompute;
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

        {/* X-axis labels (Power) */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = ratio * maxPower;
          const x = padding.left + ratio * (width - padding.left - padding.right);
          return (
            <text
              key={ratio}
              x={x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255, 255, 255, 0.6)"
            >
              {value.toFixed(0)}
            </text>
          );
        })}

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

          return (
            <g key={d.year}>
              <circle
                cx={x}
                cy={y}
                r={isHighlighted ? 6 : 4}
                fill={isClassBDominant ? "#00ffff" : "#00d4aa"}
                fillOpacity={isHighlighted ? 1.0 : 0.7}
                stroke={isHighlighted ? "#ffffff" : "none"}
                strokeWidth={isHighlighted ? 2 : 0}
              />
              {isHighlighted && (
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

