"use client";

import { useMemo } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface RadiatorScalingChartProps {
  debugState: DebugState;
}

/**
 * Radiator Scaling vs Compute Density Chart
 * Static design curve: X = per-satellite PFLOPs, Y = required radiator area m²
 * Must be strongly convex (not linear) to show that doubling compute explodes radiator area
 */
export default function RadiatorScalingChart({ debugState }: RadiatorScalingChartProps) {
  const chartData = useMemo(() => {
    const years = Object.keys(debugState)
      .filter(key => key !== "errors")
      .map(Number)
      .sort((a, b) => a - b);
    
    if (years.length === 0) return [];
    
    // Calculate per-satellite compute density and radiator area for each year
    return years.map(year => {
      const entry = debugState[year];
      if (!entry || typeof entry !== 'object' || !('satellitesTotal' in entry)) return null;
      
      // Type guard: ensure it's a DebugStateEntry
      if (!('year' in entry && typeof entry.year === 'number')) return null;
      
      if (entry.satellitesTotal === 0) return null;
      
      // Compute density = total compute / total satellites (PFLOPs per satellite)
      const computeDensity = (entry.compute_raw_flops / 1e15) / entry.satellitesTotal;
      
      // Radiator area per satellite (m²)
      const radiatorAreaPerSat = entry.radiatorArea / entry.satellitesTotal;
      
      return {
        year,
        computeDensity,
        radiatorAreaPerSat,
      };
    }).filter(Boolean) as Array<{
      year: number;
      computeDensity: number;
      radiatorAreaPerSat: number;
    }>;
  }, [debugState]);
  
  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Radiator Scaling vs Compute Density</h3>
        <p className="text-sm text-gray-400 mb-4">
          Design trade curve: Required radiator area vs compute density per satellite
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
  
  const maxComputeDensity = Math.max(...chartData.map(d => d.computeDensity), 1);
  const maxRadiatorArea = Math.max(...chartData.map(d => d.radiatorAreaPerSat), 1);
  
  const getX = (density: number) => padding.left + (density / maxComputeDensity) * plotWidth;
  const getY = (area: number) => height - padding.bottom - (area / maxRadiatorArea) * plotHeight;
  
  // Sort by compute density for smooth curve
  const sortedData = [...chartData].sort((a, b) => a.computeDensity - b.computeDensity);
  
  const curvePath = sortedData
    .map((d, i) => {
      const x = getX(d.computeDensity);
      const y = getY(d.radiatorAreaPerSat);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Radiator Scaling vs Compute Density</h3>
      <p className="text-sm text-gray-400 mb-4">
        Design trade curve: Required radiator area vs compute density per satellite
      </p>
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const densityValue = ratio * maxComputeDensity;
            const areaValue = ratio * maxRadiatorArea;
            const x = padding.left + ratio * plotWidth;
            const y = padding.top + (1 - ratio) * plotHeight;
            return (
              <g key={ratio}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
                {ratio > 0 && (
                  <>
                    <text
                      x={x}
                      y={height - padding.bottom + 16}
                      textAnchor="middle"
                      fontSize="9"
                      fill="rgba(255, 255, 255, 0.5)"
                    >
                      {densityValue.toFixed(1)}
                    </text>
                    <text
                      x={padding.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="9"
                      fill="rgba(255, 255, 255, 0.5)"
                    >
                      {areaValue.toFixed(1)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          
          {/* Curve */}
          <path
            d={curvePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {sortedData.map((d, idx) => {
            if (idx % Math.ceil(sortedData.length / 20) === 0 || idx === sortedData.length - 1) {
              const x = getX(d.computeDensity);
              const y = getY(d.radiatorAreaPerSat);
              return (
                <circle
                  key={d.year}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="#10b981"
                  opacity="0.8"
                />
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
            Compute Density (PFLOPs per satellite)
          </text>
          <text
            x={15}
            y={height / 2}
            textAnchor="middle"
            fontSize="12"
            fill="rgba(255, 255, 255, 0.7)"
            transform={`rotate(-90, 15, ${height / 2})`}
          >
            Radiator Area (m² per satellite)
          </text>
        </svg>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Strongly convex curve proves: doubling compute does not double radiator area — it explodes it
      </p>
    </div>
  );
}

