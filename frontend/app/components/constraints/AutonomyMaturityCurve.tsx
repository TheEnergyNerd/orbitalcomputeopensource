"use client";

import { useMemo } from "react";
import type { DebugState } from "../../lib/orbitSim/debugState";

interface AutonomyMaturityCurveProps {
  debugState: DebugState;
}

export default function AutonomyMaturityCurve({ debugState }: AutonomyMaturityCurveProps) {
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
      
      // Calculate % autonomous operations from autonomy level
      // Autonomy level grows from 1.0 to ~3.0 over time
      // Map to 0-100% with zones: <40% = Human-Dependent, 40-80% = Hybrid, >80% = True Infrastructure
      const autonomyPercent = Math.min(100, Math.max(0, (entry.autonomyLevel / 3.0) * 100));
      
      // Calculate zone breakdowns
      const trueInfrastructure = Math.min(20, autonomyPercent); // Bottom 20% = True Infrastructure
      const hybridOps = Math.max(0, Math.min(40, autonomyPercent - 20)); // 20-60% = Hybrid Ops
      const humanDependent = Math.max(0, 100 - autonomyPercent); // Top portion = Human-Dependent
      
      return {
        year,
        autonomyPercent,
        trueInfrastructure,
        hybridOps,
        humanDependent,
      };
    }).filter(Boolean) as Array<{
      year: number;
      autonomyPercent: number;
      trueInfrastructure: number;
      hybridOps: number;
      humanDependent: number;
    }>;
  }, [debugState, years]);
  
  if (chartData.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Autonomy Maturity Curve</h3>
        <p className="text-sm text-gray-400 mb-4">
          % of operations fully autonomous over time. Tied to failure recovery rate, mean active lifetime, and survival fraction.
        </p>
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }
  
  // Responsive dimensions - full width
  const width = typeof window !== 'undefined' 
    ? Math.min(window.innerWidth - 128, window.innerWidth - 64) 
    : 800;
  const height = typeof window !== 'undefined'
    ? Math.min(400, (window.innerHeight - 200) * 0.6)
    : 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  
  const firstYear = chartData[0].year;
  const lastYear = chartData[chartData.length - 1].year;
  const yearRange = lastYear - firstYear || 1;
  
  const getX = (year: number) => {
    return padding.left + ((year - firstYear) / yearRange) * plotWidth;
  };
  
  const getY = (percent: number) => {
    return height - padding.bottom - ((percent / 100) * plotHeight);
  };
  
  // Generate stacked area paths
  // True Infrastructure (bottom, 0-20%)
  const trueInfraPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.trueInfrastructure);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  // Hybrid Ops (middle, 20-60%)
  const hybridPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.trueInfrastructure + d.hybridOps);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  // Human-Dependent (top, 60-100%)
  const humanPath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(100);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  // Autonomy line (boundary between Hybrid and Human-Dependent)
  const autonomyLinePath = chartData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.autonomyPercent);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");
  
  // Create filled areas
  const trueInfraAreaPath = trueInfraPath + 
    ` L ${getX(lastYear)} ${height - padding.bottom}` +
    ` L ${getX(firstYear)} ${height - padding.bottom} Z`;
  
  const hybridAreaPath = hybridPath + 
    ` L ${getX(lastYear)} ${getY(chartData[chartData.length - 1]?.trueInfrastructure || 0)}` +
    ` L ${getX(firstYear)} ${getY(chartData[0]?.trueInfrastructure || 0)} Z`;
  
  const humanAreaPath = humanPath + 
    ` L ${getX(lastYear)} ${getY((chartData[chartData.length - 1]?.trueInfrastructure || 0) + (chartData[chartData.length - 1]?.hybridOps || 0))}` +
    ` L ${getX(firstYear)} ${getY((chartData[0]?.trueInfrastructure || 0) + (chartData[0]?.hybridOps || 0))} Z`;
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 w-full">
      <h3 className="text-lg font-bold mb-4">Autonomy Maturity Curve</h3>
      <p className="text-sm text-gray-400 mb-4">
        % of operations fully autonomous over time. Tied to failure recovery rate, mean active lifetime, and survival fraction.
      </p>
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} className="w-full h-auto">
          {/* Grid lines */}
          {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => {
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
          {[0, 20, 40, 60, 80, 100].map((percent) => {
            const y = padding.top + (1 - percent / 100) * plotHeight;
            return (
              <text
                key={percent}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255, 255, 255, 0.6)"
              >
                {percent}%
              </text>
            );
          })}
          
          {/* Stacked areas */}
          <path
            d={trueInfraAreaPath}
            fill="#10b981"
            fillOpacity="0.6"
            stroke="#10b981"
            strokeWidth="1"
          />
          <path
            d={hybridAreaPath}
            fill="#eab308"
            fillOpacity="0.6"
            stroke="#eab308"
            strokeWidth="1"
          />
          <path
            d={humanAreaPath}
            fill="#ef4444"
            fillOpacity="0.6"
            stroke="#ef4444"
            strokeWidth="1"
          />
          
          {/* Autonomy line (boundary) */}
          <path
            d={autonomyLinePath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
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
          
          {/* Zone labels */}
          <text
            x={padding.left + 10}
            y={padding.top + 15}
            fontSize="11"
            fill="rgba(255, 255, 255, 0.7)"
          >
            Human-Dependent (Unsustainable)
          </text>
          <text
            x={padding.left + 10}
            y={padding.top + 30}
            fontSize="11"
            fill="rgba(255, 255, 255, 0.7)"
          >
            Hybrid Ops
          </text>
          <text
            x={padding.left + 10}
            y={padding.top + 45}
            fontSize="11"
            fill="rgba(255, 255, 255, 0.7)"
          >
            True Orbital Infrastructure
          </text>
          
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
            % Operations Fully Autonomous
          </text>
        </svg>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-gray-300">True Orbital Infrastructure (0-20%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-gray-300">Hybrid Ops (20-60%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-gray-300">Human-Dependent (60-100%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500 border-t-2 border-blue-500"></div>
          <span className="text-gray-300">Autonomy Boundary</span>
        </div>
      </div>
      
      <div className="mt-4 text-sm text-gray-400">
        <p>
          <strong>Key Insight:</strong> Without autonomy, orbital data centers collapse under their own maintenance burden.
          The transition from "fragile prototype era" → "self-sustaining infrastructure era" is visible here.
        </p>
      </div>
    </div>
  );
}
