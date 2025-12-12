"use client";

import React from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ConePoint } from "../../lib/orbitSim/selectors/cones";

interface ConeChartProps {
  title: string;
  data: ConePoint[];
  metric: string;
  currentYear?: number;
  formatValue?: (value: number) => string;
}

/**
 * Cone Chart showing band of plausible futures
 * Shows min/max band with median line
 */
export default function ConeChart({
  title,
  data,
  metric,
  currentYear,
  formatValue,
}: ConeChartProps) {
  // Default formatter
  const defaultFormatValue = (val: number) => {
    if (metric.includes("$")) {
      return `$${val.toFixed(0)}`;
    } else if (metric.includes("%")) {
      return `${(val * 100).toFixed(1)}%`;
    } else if (metric.includes("tCO₂")) {
      return `${(val / 1000).toFixed(1)}k`;
    }
    return val.toFixed(1);
  };

  const formatter = formatValue || defaultFormatValue;

  // Prepare data for Recharts
  // Create band by using max - min as the area height, starting from min
  const chartData = data.map((point) => ({
    year: point.year,
    min: point.min,
    max: point.max,
    median: point.median,
    // Band height is the difference between max and min
    bandHeight: point.max - point.min,
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
          <div className="font-semibold mb-1">{data.year}</div>
          <div style={{ color: "#f97316" }}>Min: {formatter(data.min)}</div>
          <div style={{ color: "#10b981" }}>Median: {formatter(data.median)}</div>
          <div style={{ color: "#06b6d4" }}>Max: {formatter(data.max)}</div>
        </div>
      );
    }
    return null;
  };


  return (
    <div className="w-full h-full flex flex-col">
      {/* Legend - moved to top of panel */}
      <div className="flex justify-start gap-4 mb-2 text-xs pb-1">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "#06b6d4", opacity: 0.3 }} />
          <span className="text-slate-400">Uncertainty Band</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5" style={{ backgroundColor: "#10b981" }} />
          <span className="text-slate-400">Median (Baseline)</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 150 }} // CRITICAL: Increased bottom to 150px for desktop to prevent x-axis cutoff
        >
          <defs>
            {/* Gradient for the uncertainty band */}
            <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
            </linearGradient>
            {/* Background gradient to create cutout effect */}
            <linearGradient id="colorBackground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity={1} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.3} />
          <XAxis
            dataKey="year"
            stroke="#94a3b8"
            style={{ fontSize: "11px" }}
            tickFormatter={(value) => `${value}`}
          />
          <YAxis
            stroke="#94a3b8"
            style={{ fontSize: "11px" }}
            tickFormatter={(value) => {
              if (metric.includes("$")) {
                return `$${value.toFixed(0)}`;
              } else if (metric.includes("%")) {
                return `${(value * 100).toFixed(0)}%`;
              } else if (metric.includes("tCO₂")) {
                return `${(value / 1000).toFixed(0)}k`;
              }
              return value.toFixed(1);
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Uncertainty band: use two areas to create band effect */}
          {/* First area: max (full area with band color) */}
          <Area
            type="monotone"
            dataKey="max"
            stackId="1"
            stroke="none"
            fill="url(#colorBand)"
            fillOpacity={0.3}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />
          {/* Second area: min (cuts out lower part with background) */}
          <Area
            type="monotone"
            dataKey="min"
            stackId="1"
            stroke="none"
            fill="url(#colorBackground)"
            fillOpacity={1}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />
          
          {/* Median line (baseline) */}
          <Line
            type="monotone"
            dataKey="median"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "#10b981" }}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />
          
          {/* Min and Max boundary lines (subtle) */}
          <Line
            type="monotone"
            dataKey="min"
            stroke="#f97316"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            opacity={0.5}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="max"
            stroke="#06b6d4"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            opacity={0.5}
            isAnimationActive={true}
            animationDuration={400}
            animationEasing="ease-out"
          />
          
          {/* Current year reference line */}
          {currentYear && (
            <ReferenceLine
              x={currentYear}
              stroke="#ffffff"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

