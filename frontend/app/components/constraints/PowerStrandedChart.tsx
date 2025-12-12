"use client";

import { useMemo } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface PowerStrandedChartProps {
  debugState: DebugState;
}

/**
 * Power Stranded vs Power Used Chart
 * Stack: generated power, utilized power, and wasted power due to heat/backhaul/maintenance clamps
 */
export default function PowerStrandedChart({ debugState }: PowerStrandedChartProps) {
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
      if (!entry || typeof entry !== 'object' || !('power_total_kw' in entry)) return null;
      
      // Type guard: ensure it's a DebugStateEntry
      if (!('year' in entry && typeof entry.year === 'number')) return null;
      
      // Generated power (kW)
      const generatedPower = entry.power_total_kw || 0;
      
      // Utilized power = generated * utilization_overall (0-1)
      const utilization_overall = Math.min(1.0, Math.max(0, entry.utilization_overall || 0));
      const utilizedPower = generatedPower * utilization_overall;
      
      // Wasted power = generated - utilized
      const wastedPower = generatedPower - utilizedPower;
      
      // Breakdown of waste by constraint (0-1 scale)
      const utilization_heat = Math.min(1.0, Math.max(0, entry.utilization_heat || 0));
      const utilization_backhaul = Math.min(1.0, Math.max(0, entry.utilization_backhaul || 0));
      const utilization_autonomy = Math.min(1.0, Math.max(0, entry.utilization_autonomy || 0));
      
      const heatWaste = generatedPower * (1 - utilization_heat);
      const backhaulWaste = generatedPower * utilization_heat * (1 - utilization_backhaul);
      const maintenanceWaste = generatedPower * utilization_heat * utilization_backhaul * (1 - utilization_autonomy);
      
      return {
        year,
        generatedPower,
        utilizedPower,
        wastedPower,
        heatWaste,
        backhaulWaste,
        maintenanceWaste,
      };
    }).filter(Boolean) as Array<{
      year: number;
      generatedPower: number;
      utilizedPower: number;
      wastedPower: number;
      heatWaste: number;
      backhaulWaste: number;
      maintenanceWaste: number;
    }>;
  }, [debugState, years]);
  
  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Power Stranded vs Power Used</h3>
        <p className="text-sm text-gray-400 mb-4">
          Stack: generated power, utilized power, and wasted power due to heat/backhaul/maintenance clamps
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
  
  const maxPower = Math.max(...chartData.map(d => d.generatedPower), 1);
  
  const getX = (year: number) => padding.left + ((year - firstYear) / yearRange) * plotWidth;
  const getY = (value: number) => height - padding.bottom - ((value / maxPower) * plotHeight);
  
  // Generate stacked area paths
  const utilizedPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.utilizedPower);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const heatWastePath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.utilizedPower + d.heatWaste);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const backhaulWastePath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.utilizedPower + d.heatWaste + d.backhaulWaste);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const maintenanceWastePath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.generatedPower);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  // Create filled areas
  const utilizedArea = utilizedPath + 
    ` L ${getX(lastYear)} ${height - padding.bottom}` +
    ` L ${getX(firstYear)} ${height - padding.bottom} Z`;
  
  const heatWasteArea = heatWastePath + 
    ` L ${getX(lastYear)} ${getY(chartData[chartData.length - 1]?.utilizedPower || 0)}` +
    ` L ${getX(firstYear)} ${getY(chartData[0]?.utilizedPower || 0)} Z`;
  
  const backhaulWasteArea = backhaulWastePath + 
    ` L ${getX(lastYear)} ${getY((chartData[chartData.length - 1]?.utilizedPower || 0) + (chartData[chartData.length - 1]?.heatWaste || 0))}` +
    ` L ${getX(firstYear)} ${getY((chartData[0]?.utilizedPower || 0) + (chartData[0]?.heatWaste || 0))} Z`;
  
  const maintenanceWasteArea = maintenanceWastePath + 
    ` L ${getX(lastYear)} ${getY((chartData[chartData.length - 1]?.utilizedPower || 0) + (chartData[chartData.length - 1]?.heatWaste || 0) + (chartData[chartData.length - 1]?.backhaulWaste || 0))}` +
    ` L ${getX(firstYear)} ${getY((chartData[0]?.utilizedPower || 0) + (chartData[0]?.heatWaste || 0) + (chartData[0]?.backhaulWaste || 0))} Z`;
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Power Stranded vs Power Used</h3>
      <p className="text-sm text-gray-400 mb-4">
        Stack: generated power, utilized power, and wasted power due to heat/backhaul/maintenance clamps
      </p>
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = ratio * maxPower;
            const y = padding.top + (1 - ratio) * plotHeight;
            return (
              <g key={ratio}>
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
                  {(value / 1000).toFixed(1)} MW
                </text>
              </g>
            );
          })}
          
          {/* Stacked areas */}
          <path d={utilizedArea} fill="#10b981" fillOpacity="0.6" stroke="#10b981" strokeWidth="1" />
          <path d={heatWasteArea} fill="#f97316" fillOpacity="0.6" stroke="#f97316" strokeWidth="1" />
          <path d={backhaulWasteArea} fill="#3b82f6" fillOpacity="0.6" stroke="#3b82f6" strokeWidth="1" />
          <path d={maintenanceWasteArea} fill="#ef4444" fillOpacity="0.6" stroke="#ef4444" strokeWidth="1" />
          
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
            Power (kW)
          </text>
        </svg>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-gray-300">Utilized Power</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span className="text-gray-300">Heat Waste</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span className="text-gray-300">Backhaul Waste</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-gray-300">Maintenance Waste</span>
        </div>
      </div>
    </div>
  );
}

