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

  // Grayscale with highlight only when bottleneck
  return (
    <div className={`p-2 rounded-lg border transition-all ${
      isBottlenecked 
        ? "bg-gray-800 border-orange-500" 
        : "bg-gray-800/50 border-gray-700"
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-300">{machine.name}</span>
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

      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between text-gray-400">
          <span>Instances:</span>
          <span className="text-white font-semibold">{machine.lines}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Output/min:</span>
          <span className="text-white font-semibold">
            {formatSigFigs(effectiveOutput)} {machine.outputResource}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>Utilization:</span>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold ${
              isBottlenecked ? "text-orange-400" : "text-gray-300"
            }`}>
              {formatSigFigs(utilizationPercent)}%
            </span>
            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  isBottlenecked ? "bg-orange-500" : "bg-gray-500"
                }`}
                style={{ width: `${utilizationPercent}%` }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

