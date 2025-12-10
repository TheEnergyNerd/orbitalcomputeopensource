"use client";

import { useMemo } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface CeilingStackChartProps {
  debugState: DebugState;
  fullScreen?: boolean;
}

export default function CeilingStackChart({ debugState, fullScreen = false }: CeilingStackChartProps) {
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
      if (!entry) return null;
      
      // All ceilings should be in PFLOPs for comparison
      // Launch ceiling: convert satellite count to approximate compute
      // Assuming ~10 PFLOPs per satellite average
      const launchCeiling = Math.min(entry.launchMassCeiling, entry.launchCostCeiling) * 10;
      const heatCeiling = entry.heatCeiling / 1e15; // Already in FLOPS, convert to PFLOPs
      const backhaulCeiling = entry.backhaulCeiling / 1e15;
      // Autonomy ceiling: convert satellite count to approximate compute
      const autonomyCeiling = entry.autonomyCeiling * 10;
      const actualCompute = entry.compute_effective_flops / 1e15;
      
      return {
        year,
        launchCeiling,
        heatCeiling,
        backhaulCeiling,
        autonomyCeiling,
        actualCompute,
      };
    }).filter(Boolean) as Array<{
      year: number;
      launchCeiling: number;
      heatCeiling: number;
      backhaulCeiling: number;
      autonomyCeiling: number;
      actualCompute: number;
    }>;
  }, [debugState, years]);
  
  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Ceiling Stack Chart</h3>
        <p className="text-sm text-gray-400 mb-4">
          Stacked ceilings showing Launch Mass, Heat, Backhaul, and Autonomy limits.
          Actual Achieved Compute shown as thin line.
        </p>
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }
  
  // Responsive dimensions
  const width = typeof window !== 'undefined' 
    ? Math.min(fullScreen ? 1200 : 800, window.innerWidth - 64) 
    : fullScreen ? 1200 : 800;
  const height = typeof window !== 'undefined'
    ? Math.min(fullScreen ? 600 : 400, (window.innerHeight - 200) * 0.6)
    : fullScreen ? 600 : 400;
  const padding = { top: 40, right: 60, bottom: 60, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  
  const firstYear = chartData[0].year;
  const lastYear = chartData[chartData.length - 1].year;
  const yearRange = lastYear - firstYear || 1;
  
  // Find max value for scaling
  const maxValue = Math.max(
    ...chartData.map(d => Math.max(
      d.launchCeiling,
      d.heatCeiling,
      d.backhaulCeiling,
      d.autonomyCeiling,
      d.actualCompute
    )),
    1
  );
  
  const getX = (year: number) => {
    return padding.left + ((year - firstYear) / yearRange) * plotWidth;
  };
  
  const getY = (value: number) => {
    return height - padding.bottom - ((value / maxValue) * plotHeight);
  };
  
  // Generate stacked area paths
  const launchPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.launchCeiling);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const heatPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.launchCeiling + d.heatCeiling);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const backhaulPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.launchCeiling + d.heatCeiling + d.backhaulCeiling);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const autonomyPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.launchCeiling + d.heatCeiling + d.backhaulCeiling + d.autonomyCeiling);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  const actualComputePath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.actualCompute);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  // Create filled areas
  const launchAreaPath = launchPath + 
    ` L ${getX(lastYear)} ${height - padding.bottom}` +
    ` L ${getX(firstYear)} ${height - padding.bottom} Z`;
  
  const heatAreaPath = heatPath + 
    ` L ${getX(lastYear)} ${getY(chartData[chartData.length - 1]?.launchCeiling || 0)}` +
    ` L ${getX(firstYear)} ${getY(chartData[0]?.launchCeiling || 0)} Z`;
  
  const backhaulAreaPath = backhaulPath + 
    ` L ${getX(lastYear)} ${getY((chartData[chartData.length - 1]?.launchCeiling || 0) + (chartData[chartData.length - 1]?.heatCeiling || 0))}` +
    ` L ${getX(firstYear)} ${getY((chartData[0]?.launchCeiling || 0) + (chartData[0]?.heatCeiling || 0))} Z`;
  
  const autonomyAreaPath = autonomyPath + 
    ` L ${getX(lastYear)} ${getY((chartData[chartData.length - 1]?.launchCeiling || 0) + (chartData[chartData.length - 1]?.heatCeiling || 0) + (chartData[chartData.length - 1]?.backhaulCeiling || 0))}` +
    ` L ${getX(firstYear)} ${getY((chartData[0]?.launchCeiling || 0) + (chartData[0]?.heatCeiling || 0) + (chartData[0]?.backhaulCeiling || 0))} Z`;
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Ceiling Stack Chart</h3>
      <p className="text-sm text-gray-400 mb-4">
        Stacked ceilings showing Launch Mass, Heat, Backhaul, and Autonomy limits.
        Actual Achieved Compute shown as thin line.
      </p>
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + (1 - ratio) * plotHeight;
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
            const y = padding.top + (1 - ratio) * plotHeight;
            return (
              <text
                key={ratio}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255, 255, 255, 0.6)"
              >
                {value.toFixed(1)}
              </text>
            );
          })}
          
          {/* Stacked areas */}
          <path
            d={launchAreaPath}
            fill="#eab308"
            fillOpacity="0.6"
            stroke="#eab308"
            strokeWidth="1"
          />
          <path
            d={heatAreaPath}
            fill="#f97316"
            fillOpacity="0.6"
            stroke="#f97316"
            strokeWidth="1"
          />
          <path
            d={backhaulAreaPath}
            fill="#3b82f6"
            fillOpacity="0.6"
            stroke="#3b82f6"
            strokeWidth="1"
          />
          <path
            d={autonomyAreaPath}
            fill="#ef4444"
            fillOpacity="0.6"
            stroke="#ef4444"
            strokeWidth="1"
          />
          
          {/* Actual compute line */}
          <path
            d={actualComputePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="5,5"
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
            Max Possible Orbital Compute (PFLOPs)
          </text>
        </svg>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-gray-300">Launch Ceiling</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span className="text-gray-300">Heat Ceiling</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span className="text-gray-300">Backhaul Ceiling</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-gray-300">Autonomy Ceiling</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500 border-t-2 border-dashed border-green-500"></div>
          <span className="text-gray-300">Actual Compute</span>
        </div>
      </div>
    </div>
  );
}
