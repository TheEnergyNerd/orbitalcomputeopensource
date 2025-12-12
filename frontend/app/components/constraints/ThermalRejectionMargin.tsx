"use client";

import { useMemo } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface ThermalRejectionMarginProps {
  debugState: DebugState;
}

/**
 * Thermal Rejection Margin Chart
 * Plot (Q_rad_max − Q_gen) / Q_gen over time
 * Shows cooling headroom as a fraction of required heat rejection
 */
export default function ThermalRejectionMargin({ debugState }: ThermalRejectionMarginProps) {
  const years = useMemo(() => {
    return Object.keys(debugState)
      .filter(key => key !== "errors")
      .map(Number)
      .sort((a, b) => a - b);
  }, [debugState]);
  
  const chartData = useMemo(() => {
    if (years.length === 0) return [];
    
    return years.map(year => {
      const entry = debugState[year];
      if (!entry || typeof entry !== 'object' || !('heatReject' in entry)) return null;
      
      // Type guard: ensure it's a DebugStateEntry
      if (!('year' in entry && typeof entry.year === 'number')) return null;
      
      // Q_rad_max = heatReject (kW)
      // Q_gen = heatGen (kW)
      const Q_rad_max = entry.heatReject;
      const Q_gen = entry.heatGen;
      
      // Thermal margin = (Q_rad_max - Q_gen) / Q_gen
      const thermalMargin = Q_gen > 0 ? (Q_rad_max - Q_gen) / Q_gen : 0;
      
      // Determine regime
      let regime: "over-cooled" | "stable" | "throttling" | "failure" = "stable";
      if (thermalMargin > 0.3) {
        regime = "over-cooled";
      } else if (thermalMargin >= 0) {
        regime = "stable";
      } else if (thermalMargin >= -0.2) {
        regime = "throttling";
      } else {
        regime = "failure";
      }
      
      return {
        year,
        thermalMargin,
        Q_rad_max,
        Q_gen,
        regime,
      };
    }).filter(Boolean) as Array<{
      year: number;
      thermalMargin: number;
      Q_rad_max: number;
      Q_gen: number;
      regime: "over-cooled" | "stable" | "throttling" | "failure";
    }>;
  }, [debugState, years]);
  
  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Thermal Rejection Margin</h3>
        <p className="text-sm text-gray-400 mb-4">
          Cooling headroom: (Q_rad_max − Q_gen) / Q_gen
        </p>
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }
  
  const width = typeof window !== 'undefined' ? Math.min(800, window.innerWidth - 64) : 800;
  const height = typeof window !== 'undefined' && window.innerWidth >= 640 ? 500 : 300; // CRITICAL: Increased desktop to 500px to fill panel, 300px mobile
  const padding = { top: 40, right: 40, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px to prevent x-axis cutoff on desktop
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  
  const firstYear = chartData[0].year;
  const lastYear = chartData[chartData.length - 1].year;
  const yearRange = lastYear - firstYear || 1;
  
  // Y-axis range: -0.5 to +0.5 (covers all regimes)
  const minMargin = -0.5;
  const maxMargin = 0.5;
  const marginRange = maxMargin - minMargin;
  
  const getX = (year: number) => padding.left + ((year - firstYear) / yearRange) * plotWidth;
  const getY = (value: number) => height - padding.bottom - ((value - minMargin) / marginRange) * plotHeight;
  
  const marginPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.thermalMargin);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Thermal Rejection Margin</h3>
      <p className="text-sm text-gray-400 mb-4">
        Cooling headroom: (Q_rad_max − Q_gen) / Q_gen
      </p>
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Regime zones */}
          {/* Over-cooled zone (> +0.3) */}
          <rect
            x={padding.left}
            y={getY(0.3)}
            width={plotWidth}
            height={getY(maxMargin) - getY(0.3)}
            fill="#fbbf24"
            fillOpacity="0.1"
          />
          {/* Stable zone (0 to +0.3) */}
          <rect
            x={padding.left}
            y={getY(0)}
            width={plotWidth}
            height={getY(0.3) - getY(0)}
            fill="#10b981"
            fillOpacity="0.1"
          />
          {/* Throttling zone (0 to -0.2) */}
          <rect
            x={padding.left}
            y={getY(-0.2)}
            width={plotWidth}
            height={getY(0) - getY(-0.2)}
            fill="#f97316"
            fillOpacity="0.1"
          />
          {/* Failure zone (< -0.2) */}
          <rect
            x={padding.left}
            y={getY(minMargin)}
            width={plotWidth}
            height={getY(-0.2) - getY(minMargin)}
            fill="#ef4444"
            fillOpacity="0.1"
          />
          
          {/* Reference lines */}
          <line
            x1={padding.left}
            y1={getY(0.3)}
            x2={width - padding.right}
            y2={getY(0.3)}
            stroke="#fbbf24"
            strokeWidth="1"
            strokeDasharray="3,3"
            opacity="0.5"
          />
          <line
            x1={padding.left}
            y1={getY(0)}
            x2={width - padding.right}
            y2={getY(0)}
            stroke="#ffffff"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.3"
          />
          <line
            x1={padding.left}
            y1={getY(-0.2)}
            x2={width - padding.right}
            y2={getY(-0.2)}
            stroke="#f97316"
            strokeWidth="1"
            strokeDasharray="3,3"
            opacity="0.5"
          />
          
          {/* Grid lines */}
          {[-0.4, -0.2, 0, 0.2, 0.4].map((value) => {
            const y = getY(value);
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="rgba(255, 255, 255, 0.6)"
                >
                  {value.toFixed(1)}
                </text>
              </g>
            );
          })}
          
          {/* Margin line */}
          <path
            d={marginPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Year labels */}
          {chartData.map((d, idx) => {
            if (idx % Math.ceil(chartData.length / 10) === 0 || idx === chartData.length - 1) {
              const x = getX(d.year);
              return (
                <text
                  key={d.year}
                  x={x}
                  y={height - padding.bottom + 20}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255, 255, 255, 0.6)"
                >
                  {d.year}
                </text>
              );
            }
            return null;
          })}
          
          {/* Axis labels */}
          <text
            x={width / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="12"
            fill="rgba(255, 255, 255, 0.7)"
          >
            Year
          </text>
          <text
            x={15}
            y={height / 2}
            textAnchor="middle"
            fontSize="12"
            fill="rgba(255, 255, 255, 0.7)"
            transform={`rotate(-90, 15, ${height / 2})`}
          >
            Thermal Margin (fraction)
          </text>
        </svg>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-gray-300">&gt; +0.3: Over-cooled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-gray-300">0 to +0.3: Stable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span className="text-gray-300">0 to -0.2: Throttling</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-gray-300">&lt; -0.2: Hard Failure</span>
        </div>
      </div>
    </div>
  );
}

