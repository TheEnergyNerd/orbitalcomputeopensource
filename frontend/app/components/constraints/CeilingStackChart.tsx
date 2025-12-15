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
    if (years.length === 0) {
      console.log('[CeilingStackChart] No years in debugState', { debugState });
      return [];
    }
    
    return years.map(year => {
      const entry = debugState[year];
      if (!entry || typeof entry !== 'object' || !('compute_raw_flops' in entry)) {
        // Only warn if year is a valid number (not NaN)
        if (!isNaN(year)) {
          console.warn(`[CeilingStackChart] No entry for year ${year}`);
        }
        return null;
      }
      
      // Type guard: ensure it's a DebugStateEntry
      if (!('year' in entry && typeof entry.year === 'number')) {
        return null;
      }
      
      // All ceilings should be in PFLOPs for comparison
      // Note: heatCeiling and backhaulCeiling are already in PFLOPs from deploymentConstraints
      // Launch ceiling: convert satellite count to approximate compute
      // Assuming ~10 PFLOPs per satellite average (rough estimate)
      const computePerSat = entry.compute_raw_flops > 0 && entry.satellitesTotal > 0
        ? (entry.compute_raw_flops / 1e15) / entry.satellitesTotal
        : 10; // Fallback to 10 PFLOPs per satellite
      
      // Ensure all values are valid numbers
      const launchMass = Number(entry.launchMassCeiling) || 0;
      const launchCost = Number(entry.launchCostCeiling) || 0;
      const heat = Number(entry.heatCeiling) || 0;
      const backhaul = Number(entry.backhaulCeiling) || 0;
      const autonomy = Number(entry.autonomyCeiling) || 0;
      // RULE 2: Use compute_exportable_flops (the only real compute)
      const exportableCompute = Number(entry.compute_exportable_flops) || 0;
      const effectiveCompute = Number(entry.compute_effective_flops) || 0;
      // Prefer exportable, fallback to effective
      const actualComputeFlops = exportableCompute > 0 ? exportableCompute : effectiveCompute;
      
      const launchCeiling = Math.min(launchMass, launchCost) * computePerSat;
      const heatCeiling = heat; // Already in PFLOPs
      const backhaulCeiling = backhaul; // Already in PFLOPs
      // Autonomy ceiling: convert satellite count to approximate compute
      const autonomyCeiling = autonomy * computePerSat;
      const actualCompute = actualComputeFlops / 1e15; // Convert FLOPS to PFLOPs
      
      // Validate all values are finite
      if (!isFinite(launchCeiling) || !isFinite(heatCeiling) || !isFinite(backhaulCeiling) || 
          !isFinite(autonomyCeiling) || !isFinite(actualCompute)) {
        console.warn(`[CeilingStackChart] Invalid data for year ${year}:`, {
          launchCeiling, heatCeiling, backhaulCeiling, autonomyCeiling, actualCompute,
          raw: { launchMass, launchCost, heat, backhaul, autonomy, effectiveCompute }
        });
        return null;
      }
      
      // Removed verbose logging
      
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
  
  // Responsive dimensions - full width
  const width = typeof window !== 'undefined' 
    ? Math.min(fullScreen ? 1200 : window.innerWidth - 128, window.innerWidth - 64) 
    : fullScreen ? 1200 : 800;
  const height = typeof window !== 'undefined'
    ? Math.max(fullScreen ? 600 : 500, Math.min(fullScreen ? 800 : 700, (window.innerHeight - 200) * 0.8)) // CRITICAL: Increased height for desktop to fill panel
    : fullScreen ? 600 : 500;
  const padding = { top: 40, right: 60, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px to prevent x-axis cutoff on desktop
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  
  const firstYear = chartData[0].year;
  const lastYear = chartData[chartData.length - 1].year;
  const yearRange = lastYear - firstYear || 1;
  
  // Find max value for scaling (ensure it's finite and > 0)
  // Calculate total ceiling (stacked sum) and actual compute separately
  const allCeilingValues = chartData.map(d => d.launchCeiling + d.heatCeiling + d.backhaulCeiling + d.autonomyCeiling)
    .filter(v => isFinite(v) && v > 0);
  const allActualValues = chartData.map(d => d.actualCompute)
    .filter(v => isFinite(v) && v > 0);
  
  const maxTotalCeiling = allCeilingValues.length > 0 ? Math.max(...allCeilingValues) : 1;
  const maxActualCompute = allActualValues.length > 0 ? Math.max(...allActualValues) : 0;
  
  // Ensure actual compute is always visible
  // If actual compute is very small (< 1% of max ceiling), scale up to make it visible
  // Otherwise, use the larger of the two
  let maxValue = Math.max(maxTotalCeiling, maxActualCompute, 1);
  
  if (maxActualCompute > 0 && maxTotalCeiling > 0) {
    const ratio = maxActualCompute / maxTotalCeiling;
    if (ratio < 0.01) {
      // Actual compute is tiny - scale up to make it visible (at least 5% of chart height)
      maxValue = Math.max(maxTotalCeiling, maxActualCompute * 20);
    } else {
      // Normal case - use the larger value
      maxValue = Math.max(maxTotalCeiling, maxActualCompute * 1.1);
    }
  }
  
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
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 w-full">
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
