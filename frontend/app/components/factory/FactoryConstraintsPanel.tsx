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
    <div className="p-2 rounded-lg border border-gray-700 bg-gray-800/50">
      <h3 className="text-xs font-semibold text-gray-300 mb-2">Factory Systems</h3>
      
      {/* Compact horizontal bars - no decimals */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Power:</span>
          <span className="text-white font-semibold">
            {Math.floor(constraints.powerUsedMW)} / {Math.floor(constraints.powerCapacityMW)} MW
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Cooling:</span>
          <span className="text-white font-semibold">
            {Math.floor(constraints.coolingUsedMW)} / {Math.floor(constraints.coolingCapacityMW)} MW
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Workforce:</span>
          <span className="text-white font-semibold">
            {Math.floor(constraints.workforceUsed)} / {Math.floor(constraints.workforceTotal)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-400">Space:</span>
          <span className="text-white font-semibold">
            {occupiedCells} / {totalCells} cells
          </span>
        </div>
      </div>
    </div>
  );
}

