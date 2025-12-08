"use client";

import type { YearSeries } from "../../lib/orbitSim/scenarioTypes";

interface YearComputeChartProps {
  series: YearSeries;
}

/**
 * YearComputeChart - Line chart showing compute over time
 * Shows ground-only vs ground+orbit compute over 10-year horizon
 * Shows ALL years and both curves clearly
 */
export default function YearComputeChart({ series }: YearComputeChartProps) {
  const width = 400; // Wider
  const height = 120; // Taller
  const padding = { top: 10, right: 20, bottom: 25, left: 40 };

  // Calculate max value for Y-axis scaling
  const maxValue = Math.max(
    ...series.groundTFLOPyr,
    ...series.orbitTFLOPyr.map((o, i) => o + series.mixGroundTFLOPyr[i])
  );

  // Helper to map year to X position
  const getX = (year: number) => {
    const xRange = width - padding.left - padding.right;
    return padding.left + (year / (series.years.length - 1)) * xRange;
  };

  // Helper to map value to Y position (inverted, so higher values are higher on chart)
  const getY = (value: number) => {
    const yRange = height - padding.top - padding.bottom;
    return padding.top + (1 - value / maxValue) * yRange;
  };

  // Generate path for ground-only (red line)
  const groundPath = series.years
    .map((year, i) => {
      const x = getX(year);
      const y = getY(series.groundTFLOPyr[i]);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // Generate path for ground+orbit (green line)
  const mixPath = series.years
    .map((year, i) => {
      const x = getX(year);
      const y = getY(series.orbitTFLOPyr[i] + series.mixGroundTFLOPyr[i]);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="w-full">
      <svg width={width} height={height} className="overflow-visible">
        {/* Y-axis label */}
        <text
          x={padding.left - 10}
          y={height / 2}
          className="text-[10px] fill-gray-400"
          textAnchor="end"
          dominantBaseline="middle"
          transform={`rotate(-90 ${padding.left - 10} ${height / 2})`}
        >
          TFLOP-yr
        </text>

        {/* X-axis label */}
        <text
          x={width / 2}
          y={height - 5}
          className="text-[10px] fill-gray-400"
          textAnchor="middle"
        >
          Years
        </text>

        {/* X-axis ticks - Show ALL years */}
        {series.years.map((year) => {
          const x = getX(year);
          return (
            <g key={year}>
              <line
                x1={x}
                y1={height - padding.bottom}
                x2={x}
                y2={height - padding.bottom + 4}
                stroke="#4B5563"
                strokeWidth={1}
              />
              <text
                x={x}
                y={height - padding.bottom + 12}
                className="text-[9px] fill-gray-500"
                textAnchor="middle"
              >
                {year}
              </text>
            </g>
          );
        })}

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * (height - padding.top - padding.bottom);
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#374151"
              strokeWidth={0.5}
              strokeDasharray="2,2"
            />
          );
        })}

        {/* Y-axis value labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = ratio * maxValue;
          const y = padding.top + (1 - ratio) * (height - padding.top - padding.bottom);
          return (
            <text
              key={ratio}
              x={padding.left - 5}
              y={y + 3}
              className="text-[8px] fill-gray-500"
              textAnchor="end"
            >
              {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}
            </text>
          );
        })}

        {/* Ground-only line (red) */}
        <path
          d={groundPath}
          fill="none"
          stroke="#EF4444"
          strokeWidth={2}
          className="opacity-80"
        />

        {/* Ground+Orbit line (green) */}
        <path
          d={mixPath}
          fill="none"
          stroke="#10B981"
          strokeWidth={2}
          className="opacity-80"
        />

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 80}, ${padding.top + 5})`}>
          <line x1={0} y1={0} x2={20} y2={0} stroke="#EF4444" strokeWidth={2} className="opacity-80" />
          <text x={25} y={3} className="text-[9px] fill-gray-400">Ground</text>
          <line x1={0} y1={12} x2={20} y2={12} stroke="#10B981" strokeWidth={2} className="opacity-80" />
          <text x={25} y={15} className="text-[9px] fill-gray-400">Mix</text>
        </g>
      </svg>
    </div>
  );
}
