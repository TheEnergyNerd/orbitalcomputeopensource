"use client";

import { useSandboxStore } from "../../store/sandboxStore";
import { formatSigFigs, formatDecimal } from "../../lib/utils/formatNumber";

export default function FactoryConstraintsPanel() {
  const { simState } = useSandboxStore();

  if (!simState || !simState.constraints) return null;

  const { constraints } = simState;
  const powerPercent = constraints.powerCapacityMW > 0 
    ? (constraints.powerUsedMW / constraints.powerCapacityMW) * 100 
    : 0;
  const coolingPercent = constraints.coolingCapacityMW > 0
    ? (constraints.coolingUsedMW / constraints.coolingCapacityMW) * 100
    : 0;
  const workforcePercent = constraints.workforceTotal > 0
    ? (constraints.workforceUsed / constraints.workforceTotal) * 100
    : 0;

  // Count occupied grid cells
  let occupiedCells = 0;
  let totalCells = constraints.gridWidth * constraints.gridHeight;
  for (let y = 0; y < constraints.gridHeight; y++) {
    for (let x = 0; x < constraints.gridWidth; x++) {
      if (constraints.gridOccupied[y][x]) {
        occupiedCells++;
      }
    }
  }
  const spacePercent = totalCells > 0 ? (occupiedCells / totalCells) * 100 : 0;

  const getStatusColor = (percent: number) => {
    if (percent >= 95) return "text-red-400";
    if (percent >= 80) return "text-orange-400";
    return "text-green-400";
  };

  return (
    <div className="panel-glass rounded-lg p-3 border border-white/10 space-y-2">
      <h3 className="text-sm font-semibold text-white mb-2">Factory Systems</h3>
      
      {/* Power */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Power</span>
          <span className={`font-semibold ${getStatusColor(powerPercent)}`}>
            {formatDecimal(constraints.powerUsedMW, 1)} / {formatDecimal(constraints.powerCapacityMW, 1)} MW
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all ${
              powerPercent >= 95 ? "bg-red-500" : powerPercent >= 80 ? "bg-orange-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, powerPercent)}%` }}
          />
        </div>
      </div>

      {/* Cooling */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Cooling</span>
          <span className={`font-semibold ${getStatusColor(coolingPercent)}`}>
            {formatDecimal(constraints.coolingUsedMW, 1)} / {formatDecimal(constraints.coolingCapacityMW, 1)} MW
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all ${
              coolingPercent >= 95 ? "bg-red-500" : coolingPercent >= 80 ? "bg-orange-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, coolingPercent)}%` }}
          />
        </div>
      </div>

      {/* Workforce */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Workforce</span>
          <span className={`font-semibold ${getStatusColor(workforcePercent)}`}>
            {formatDecimal(constraints.workforceUsed, 0)} / {formatDecimal(constraints.workforceTotal, 0)}
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all ${
              workforcePercent >= 95 ? "bg-red-500" : workforcePercent >= 80 ? "bg-orange-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, workforcePercent)}%` }}
          />
        </div>
      </div>

      {/* Floor Space */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Floor Space</span>
          <span className={`font-semibold ${getStatusColor(spacePercent)}`}>
            {occupiedCells} / {totalCells} cells
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all ${
              spacePercent >= 95 ? "bg-red-500" : spacePercent >= 80 ? "bg-orange-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, spacePercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

