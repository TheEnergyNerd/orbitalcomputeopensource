"use client";

import React from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";

interface DeploymentTimelineChartProps {
  timeline: YearStep[];
}

/**
 * Deployment Timeline Chart
 * Shows compute split between ground (red) and orbit (green) over time
 */
export default function DeploymentTimelineChart({ timeline }: DeploymentTimelineChartProps) {
  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  const maxValue = Math.max(
    ...timeline.map(step => Math.max(step.netGroundComputeTwh || 0, step.orbitalComputeTwh || 0))
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
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };

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

  const groundPath = timeline
    .map((step, i) => {
      if (!step || !isFinite(step.year) || !isFinite(step.netGroundComputeTwh)) return null;
      const x = getX(step.year);
      const y = getY(step.netGroundComputeTwh);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .filter(Boolean)
    .join(" ");

  const orbitalPath = timeline
    .map((step, i) => {
      if (!step || !isFinite(step.year) || !isFinite(step.orbitalComputeTwh)) return null;
      const x = getX(step.year);
      const y = getY(step.orbitalComputeTwh);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .filter(Boolean)
    .join(" ");

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
        {timeline.length > 0 && (
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
            {timeline.length > 1 && (
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

        {/* Ground line (red) */}
        {groundPath && (
          <path
            d={groundPath}
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Orbital line (green) */}
        {orbitalPath && (
          <path
            d={orbitalPath}
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {timeline.map((step, i) => {
          if (!step || !isFinite(step.year)) return null;
          const x = getX(step.year);
          return (
            <React.Fragment key={i}>
              {isFinite(step.netGroundComputeTwh) && (
                <circle
                  cx={x}
                  cy={getY(step.netGroundComputeTwh)}
                  r="3"
                  fill="#EF4444"
                />
              )}
              {isFinite(step.orbitalComputeTwh) && (
                <circle
                  cx={x}
                  cy={getY(step.orbitalComputeTwh)}
                  r="3"
                  fill="#10B981"
                />
              )}
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
}
