"use client";

import type { DebugStateEntry } from "../../lib/orbitSim/debugState";

interface ThermalUtilizationGaugeProps {
  currentState: DebugStateEntry | undefined;
}

export default function ThermalUtilizationGauge({ currentState }: ThermalUtilizationGaugeProps) {
  if (!currentState) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Thermal Utilization Clamp Gauge</h3>
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }
  
  const utilization = currentState.utilization_overall;
  const size = 200;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  // Color segments
  const getColor = (util: number) => {
    if (util >= 0.7) return "#10b981"; // green
    if (util >= 0.4) return "#eab308"; // yellow
    return "#ef4444"; // red
  };
  
  const getSegment = (util: number) => {
    if (util >= 0.7) return "Healthy";
    if (util >= 0.4) return "Thermally/Network Constrained";
    return "Wasting Power / Melting Silicon";
  };
  
  const offset = circumference * (1 - utilization);
  const color = getColor(utilization);
  
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Thermal Utilization Clamp Gauge</h3>
      <p className="text-sm text-gray-400 mb-6">
        Current Utilization = min(Heat, Backhaul, Autonomy)
      </p>
      
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#374151"
              strokeWidth={strokeWidth}
            />
            {/* Segments */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#10b981"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.3}
              strokeLinecap="round"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#eab308"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * 0.6}
              strokeLinecap="round"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#ef4444"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference}
              strokeLinecap="round"
            />
            {/* Value arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color }}>
                {(utilization * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {getSegment(utilization)}
              </div>
            </div>
          </div>
        </div>
        
        {/* Breakdown */}
        <div className="mt-6 w-full space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Heat Utilization:</span>
            <span className="font-semibold">{(currentState.utilization_heat * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Backhaul Utilization:</span>
            <span className="font-semibold">{(currentState.utilization_backhaul * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Autonomy Utilization:</span>
            <span className="font-semibold">{(currentState.utilization_autonomy * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

