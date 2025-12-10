"use client";

import React from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import type { StrategyMode } from "../../lib/orbitSim/satelliteClasses";

interface StrategyPhaseDiagramProps {
  timeline: YearStep[];
  strategyByYear?: Map<number, StrategyMode>;
}

/**
 * Strategy Phase Diagram
 * Horizontal timeline strip showing strategy changes
 * Three synchronized micro-graphs: Cost/Compute, Carbon/Compute, Latency/Compute
 */
export default function StrategyPhaseDiagram({ 
  timeline, 
  strategyByYear 
}: StrategyPhaseDiagramProps) {
  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  // Build strategy timeline
  const strategyTimeline = buildStrategyTimeline(timeline, strategyByYear);

  // Calculate derivative metrics
  const derivativeData = calculateDerivatives(timeline);

  const width = typeof window !== 'undefined' 
    ? Math.min(800, window.innerWidth - 64) 
    : 800;
  const timelineHeight = 60;
  const chartHeight = 80;
  const totalHeight = timelineHeight + chartHeight * 3 + 60; // Increased bottom padding

  const getX = (year: number) => {
    if (!isFinite(year) || !isFinite(firstYear) || !isFinite(yearRange) || yearRange === 0) {
      return 50;
    }
    return 50 + ((year - firstYear) / yearRange) * (width - 100);
  };

  // Get strategy color
  const getStrategyColor = (strategy: StrategyMode): string => {
    switch (strategy) {
      case "COST": return "#f59e0b"; // amber
      case "LATENCY": return "#3b82f6"; // blue
      case "CARBON": return "#10b981"; // green
      case "BALANCED": 
      default: return "#8b5cf6"; // purple
    }
  };

  // Get strategy label
  const getStrategyLabel = (strategy: StrategyMode): string => {
    switch (strategy) {
      case "COST": return "COST";
      case "LATENCY": return "LATENCY";
      case "CARBON": return "CARBON";
      case "BALANCED": 
      default: return "BALANCED";
    }
  };

  return (
    <div className="w-full">
      <svg width={width} height={totalHeight} className="w-full h-auto">
        {/* Strategy Timeline Strip */}
        <g transform={`translate(0, 20)`}>
          <rect
            x="50"
            y="0"
            width={width - 100}
            height={timelineHeight}
            fill="rgba(30, 41, 59, 0.8)"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="1"
            rx="4"
          />

          {/* Strategy segments */}
          {strategyTimeline.map((segment, i) => {
            const x1 = getX(segment.startYear);
            const x2 = getX(segment.endYear);
            const width_seg = x2 - x1;
            const color = getStrategyColor(segment.strategy);

            return (
              <g key={i}>
                <rect
                  x={x1}
                  y="0"
                  width={width_seg}
                  height={timelineHeight}
                  fill={color}
                  fillOpacity="0.3"
                />
                <line
                  x1={x1}
                  y1="0"
                  x2={x1}
                  y2={timelineHeight}
                  stroke={color}
                  strokeWidth="2"
                />
                {i === strategyTimeline.length - 1 && (
                  <line
                    x1={x2}
                    y1="0"
                    x2={x2}
                    y2={timelineHeight}
                    stroke={color}
                    strokeWidth="2"
                  />
                )}
                <text
                  x={x1 + width_seg / 2}
                  y={timelineHeight / 2 + 5}
                  textAnchor="middle"
                  fontSize="11"
                  fill={color}
                  fontWeight="600"
                >
                  {getStrategyLabel(segment.strategy)}
                </text>
                <text
                  x={x1 + width_seg / 2}
                  y={timelineHeight / 2 + 18}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(255, 255, 255, 0.6)"
                >
                  {segment.startYear}
                </text>
              </g>
            );
          })}
        </g>

        {/* Three derivative charts */}
        {/* Cost / Compute */}
        <DerivativeChart
          data={derivativeData}
          label="Cost / Compute"
          yKey="costPerCompute"
          color="#f59e0b"
          yOffset={timelineHeight + 40}
          width={width}
          height={chartHeight}
          getX={getX}
        />

        {/* Carbon / Compute */}
        <DerivativeChart
          data={derivativeData}
          label="Carbon / Compute"
          yKey="carbonPerCompute"
          color="#10b981"
          yOffset={timelineHeight + 40 + chartHeight}
          width={width}
          height={chartHeight}
          getX={getX}
        />

        {/* Latency / Compute */}
        <DerivativeChart
          data={derivativeData}
          label="Latency / Compute"
          yKey="latencyPerCompute"
          color="#3b82f6"
          yOffset={timelineHeight + 40 + chartHeight * 2}
          width={width}
          height={chartHeight}
          getX={getX}
        />
      </svg>
    </div>
  );
}

/**
 * Build strategy timeline from year steps
 */
function buildStrategyTimeline(
  timeline: YearStep[],
  strategyByYear?: Map<number, StrategyMode>
): Array<{ startYear: number; endYear: number; strategy: StrategyMode }> {
  const segments: Array<{ startYear: number; endYear: number; strategy: StrategyMode }> = [];
  
  if (timeline.length === 0) return segments;

  const strategyMap = strategyByYear || new Map<number, StrategyMode>();
  timeline.forEach(step => {
    if (!strategyMap.has(step.year)) {
      strategyMap.set(step.year, "BALANCED");
    }
  });

  let currentStrategy: StrategyMode | null = null;
  let segmentStart = timeline[0].year;

  for (let i = 0; i < timeline.length; i++) {
    const year = timeline[i].year;
    const strategy = strategyMap.get(year) || "BALANCED";

    if (currentStrategy === null) {
      currentStrategy = strategy;
    } else if (strategy !== currentStrategy) {
      // End current segment, start new one
      segments.push({
        startYear: segmentStart,
        endYear: year - 1,
        strategy: currentStrategy,
      });
      segmentStart = year;
      currentStrategy = strategy;
    }
  }

  // Add final segment
  if (currentStrategy !== null) {
    segments.push({
      startYear: segmentStart,
      endYear: timeline[timeline.length - 1].year,
      strategy: currentStrategy,
    });
  }

  return segments;
}

/**
 * Calculate derivative metrics (rate of change per compute unit)
 */
function calculateDerivatives(
  timeline: YearStep[]
): Array<{
  year: number;
  costPerCompute: number;
  carbonPerCompute: number;
  latencyPerCompute: number;
}> {
  return timeline.map(step => {
    const compute = step.orbitalComputeTwh || 0.001; // Avoid division by zero
    return {
      year: step.year,
      costPerCompute: (step.costPerComputeMix || 0) / compute,
      carbonPerCompute: (step.carbonMix || 0) / compute,
      latencyPerCompute: (step.latencyMixMs || 0) / compute,
    };
  });
}

/**
 * Mini derivative chart component
 */
function DerivativeChart({
  data,
  label,
  yKey,
  color,
  yOffset,
  width,
  height,
  getX,
}: {
  data: Array<{ year: number; [key: string]: number }>;
  label: string;
  yKey: string;
  color: string;
  yOffset: number;
  width: number;
  height: number;
  getX: (year: number) => number;
}) {
  if (data.length === 0) return null;

  const values = data.map(d => d[yKey] as number).filter(v => isFinite(v));
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);

  const padding = { left: 50, right: 20, top: 5, bottom: 20 };

  const getY = (value: number) => {
    if (!isFinite(value) || maxValue === minValue) {
      return yOffset + height - padding.bottom;
    }
    const ratio = (value - minValue) / (maxValue - minValue);
    return yOffset + height - padding.bottom - (ratio * (height - padding.top - padding.bottom));
  };

  const path = data
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d[yKey] as number);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  return (
    <g>
      {/* Background */}
      <rect
        x={padding.left}
        y={yOffset}
        width={width - padding.left - padding.right}
        height={height}
        fill="rgba(15, 23, 42, 0.5)"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth="1"
        rx="4"
      />

      {/* Label */}
      <text
        x={padding.left + 5}
        y={yOffset + 15}
        fontSize="10"
        fill={color}
        fontWeight="500"
      >
        {label}
      </text>

      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {data.map((d, i) => {
        const x = getX(d.year);
        const y = getY(d[yKey] as number);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2"
            fill={color}
            fillOpacity="0.8"
          />
        );
      })}
    </g>
  );
}

