"use client";

import type { Machine } from "../lib/sim/model";
import { formatSigFigs } from "../lib/utils/formatNumber";

interface MachineCardProps {
  machine: Machine;
  utilization: number;
  onChangeLines: (lines: number) => void;
  canAddMore?: boolean; // Whether adding more lines is possible
}

export default function MachineCard({ machine, utilization, onChangeLines }: MachineCardProps) {
  const speedMultiplier = 1 + (machine.upgrades.speedLevel * 0.2);
  const effectiveOutput = machine.baseOutputPerLine * speedMultiplier * machine.lines;
  
  const utilizationPercent = Math.min(100, utilization * 100);
  const isBottlenecked = utilization > 0.95;
  const isUnderutilized = utilization < 0.2;

  return (
    <div className={`p-3 rounded-lg border transition-all ${
      isBottlenecked 
        ? "bg-red-500/20 border-red-500/50 animate-pulse" 
        : isUnderutilized
        ? "bg-gray-800/30 border-gray-700 opacity-60"
        : "bg-gray-800 border-gray-700"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-300">{machine.name}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChangeLines(Math.max(0, machine.lines - 1))}
            className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition"
            disabled={machine.lines <= 0}
          >
            -
          </button>
          <span className="text-xs text-gray-400 min-w-[2rem] text-center">
            {machine.lines}
          </span>
          <button
            onClick={() => onChangeLines(machine.lines + 1)}
            className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition"
          >
            +
          </button>
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Output:</span>
          <span className="text-white font-mono">
            {formatSigFigs(effectiveOutput)} {machine.outputResource}/min
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-gray-400 mb-1">
            <span>Utilization:</span>
            <span className={`font-semibold ${
              isBottlenecked ? "text-red-400" :
              utilizationPercent > 80 ? "text-yellow-400" :
              "text-green-400"
            }`}>
              {formatSigFigs(utilizationPercent)}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                isBottlenecked ? "bg-red-500" :
                utilizationPercent > 80 ? "bg-yellow-400" :
                "bg-green-500"
              }`}
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>
        </div>

        {machine.upgrades.speedLevel > 0 && (
          <div className="text-[10px] text-gray-500 mt-1">
            Speed +{machine.upgrades.speedLevel * 20}%
          </div>
        )}
        {machine.upgrades.efficiencyLevel > 0 && (
          <div className="text-[10px] text-gray-500">
            Efficiency +{machine.upgrades.efficiencyLevel * 10}%
          </div>
        )}
      </div>
    </div>
  );
}

