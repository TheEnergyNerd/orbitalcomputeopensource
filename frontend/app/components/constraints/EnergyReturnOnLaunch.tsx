"use client";

import { useMemo } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface EnergyReturnOnLaunchProps {
  debugState: DebugState;
}

/**
 * Energy Return on Launch (EROL) Chart
 * Plot (Total lifetime orbital energy generated) / (Total launch + manufacturing energy)
 */
export default function EnergyReturnOnLaunch({ debugState }: EnergyReturnOnLaunchProps) {
  const years = useMemo(() => {
    return Object.keys(debugState)
      .filter(key => key !== "errors")
      .map(Number)
      .sort((a, b) => a - b);
  }, [debugState]);
  
  const chartData = useMemo(() => {
    if (years.length === 0) return [];
    
    // Constants
    const SATELLITE_LIFETIME_YEARS = 7; // Average satellite lifetime
    const LAUNCH_ENERGY_PER_KG = 50; // MJ/kg (approximate for Starship)
    const MANUFACTURING_ENERGY_PER_KG = 100; // MJ/kg (approximate)
    const SOLAR_EFFICIENCY = 0.25; // 25% solar panel efficiency
    const SUNLIGHT_HOURS_PER_DAY = 16; // Average for LEO
    
    return years.map(year => {
      const entry = debugState[year];
      if (!entry || typeof entry !== 'object' || !('massPerSatellite' in entry)) return null;
      
      // Type guard: ensure it's a DebugStateEntry
      if (!('year' in entry && typeof entry.year === 'number')) return null;
      
      // Calculate total launch + manufacturing energy (MJ)
      // massPerSatellite is in tons, convert to kg
      const massPerSatelliteKg = (entry.massPerSatellite || 0.5) * 1000; // Default to 0.5 tons if missing
      const totalMassKg = entry.satellitesTotal * massPerSatelliteKg;
      const launchEnergy = totalMassKg * LAUNCH_ENERGY_PER_KG;
      const manufacturingEnergy = totalMassKg * MANUFACTURING_ENERGY_PER_KG;
      const totalEmbeddedEnergy = launchEnergy + manufacturingEnergy;
      
      // Calculate lifetime orbital energy generation (MJ)
      // Power in kW, convert to MJ over lifetime
      const powerKW = entry.power_total_kw;
      const dailyEnergyMJ = (powerKW * SOLAR_EFFICIENCY * SUNLIGHT_HOURS_PER_DAY * 3600) / 1000; // MJ/day
      const lifetimeEnergyMJ = dailyEnergyMJ * 365 * SATELLITE_LIFETIME_YEARS;
      
      // EROL = lifetime energy / embedded energy
      const erol = totalEmbeddedEnergy > 0 ? lifetimeEnergyMJ / totalEmbeddedEnergy : 0;
      
      return {
        year,
        erol,
        lifetimeEnergyMJ,
        embeddedEnergyMJ: totalEmbeddedEnergy,
      };
    }).filter(Boolean) as Array<{
      year: number;
      erol: number;
      lifetimeEnergyMJ: number;
      embeddedEnergyMJ: number;
    }>;
  }, [debugState, years]);
  
  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Energy Return on Launch (EROL)</h3>
        <p className="text-sm text-gray-400 mb-4">
          (Total lifetime orbital energy generated) / (Total launch + manufacturing energy)
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
  
  const maxEROL = Math.max(...chartData.map(d => d.erol), 1);
  const minEROL = Math.min(...chartData.map(d => d.erol), 0);
  const erolRange = maxEROL - minEROL || 1;
  
  const getX = (year: number) => padding.left + ((year - firstYear) / yearRange) * plotWidth;
  const getY = (value: number) => height - padding.bottom - ((value - minEROL) / erolRange) * plotHeight;
  
  const erolPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.erol);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Energy Return on Launch (EROL)</h3>
      <p className="text-sm text-gray-400 mb-4">
        (Total lifetime orbital energy generated) / (Total launch + manufacturing energy)
      </p>
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = minEROL + ratio * erolRange;
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
                  {value.toFixed(2)}
                </text>
              </g>
            );
          })}
          
          {/* EROL = 1.0 reference line */}
          <line
            x1={padding.left}
            y1={getY(1.0)}
            x2={width - padding.right}
            y2={getY(1.0)}
            stroke="#fbbf24"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.5"
          />
          <text
            x={width - padding.right - 5}
            y={getY(1.0) - 5}
            textAnchor="end"
            fontSize="10"
            fill="#fbbf24"
          >
            EROL = 1.0
          </text>
          
          {/* EROL line */}
          <path
            d={erolPath}
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
            EROL Ratio
          </text>
        </svg>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        EROL &gt; 1.0 means orbital energy exceeds embedded energy over lifetime
      </p>
    </div>
  );
}

