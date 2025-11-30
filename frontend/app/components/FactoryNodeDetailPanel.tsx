"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { getMachineUtilization } from "../lib/sim/engine";
import type { MachineId, ResourceId } from "../lib/sim/model";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";

interface FactoryNodeDetailPanelProps {
  selectedNodeId: string | null;
  onClose: () => void;
}

export default function FactoryNodeDetailPanel({ selectedNodeId, onClose }: FactoryNodeDetailPanelProps) {
  const { simState, updateMachineLines } = useSandboxStore();

  if (!selectedNodeId || !simState) return null;

  const { machines, resources } = simState;

  // Map building IDs to machine IDs
  const machineIdMap: Record<string, MachineId> = {
    chipFab: "chipFab",
    computeLine: "computeLine",
    podFactory: "podFactory",
    launchOps: "launchOps",
  };

  const machineId = machineIdMap[selectedNodeId];
  const machine = machineId ? machines[machineId] : null;
  const resource = resources[selectedNodeId as ResourceId];

  // Handle source resources
  if (selectedNodeId === "siliconSource" || selectedNodeId === "steelSource" || selectedNodeId === "launchOpsResource") {
    const sourceResource = resources[selectedNodeId === "siliconSource" ? "silicon" : selectedNodeId === "steelSource" ? "steel" : "launchOpsResource"];
    return (
      <div className="fixed top-[50px] right-6 w-80 z-40 panel max-h-[calc(100vh-100px)] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-white">{sourceResource.name} Source</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Type:</span>
            <span className="text-white">Infinite Source</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Buffer:</span>
            <span className="text-white">{formatDecimal(sourceResource.buffer, 0)} {sourceResource.units}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Production Rate:</span>
            <span className="text-cyan-400">+{formatDecimal(sourceResource.prodPerMin, 1)}/min</span>
          </div>
          <div className="mt-4 p-2 bg-gray-800/50 rounded text-[10px] text-gray-300">
            This is an infinite source. It automatically produces {sourceResource.name} at a constant rate.
          </div>
        </div>
      </div>
    );
  }

  // Handle machines
  if (machine) {
    const utilization = getMachineUtilization(machine, resources, simState.constraints);
    const isStarved = utilization < 0.1 && machine.lines > 0;
    
    return (
      <div className="fixed top-[50px] right-6 w-80 z-40 panel max-h-[calc(100vh-100px)] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-white">{machine.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        
        <div className="space-y-3 text-xs">
          {/* Lines control */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400">Production Lines:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateMachineLines(machineId, Math.max(0, machine.lines - 1))}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
                  disabled={machine.lines === 0}
                >
                  −
                </button>
                <span className="text-white font-semibold w-8 text-center">{machine.lines}</span>
                <button
                  onClick={() => updateMachineLines(machineId, machine.lines + 1)}
                  className="px-2 py-1 bg-accent-blue hover:bg-accent-blue/80 rounded text-white"
                >
                  +
                </button>
              </div>
            </div>
            {machine.lines === 0 && (
              <div className="text-[10px] text-yellow-400 mt-1">
                ⚠ Add lines to start production
              </div>
            )}
          </div>

          {/* Utilization */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-400">Utilization:</span>
              <span className={isStarved ? "text-red-400" : utilization > 0.8 ? "text-orange-400" : "text-green-400"}>
                {formatDecimal(utilization * 100, 1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isStarved ? "bg-red-500" : utilization > 0.8 ? "bg-orange-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(100, utilization * 100)}%` }}
              />
            </div>
          </div>

          {/* Inputs */}
          {Object.keys(machine.inputRates).length > 0 && (
            <div>
              <span className="text-gray-400 text-[10px] uppercase">Inputs:</span>
              <div className="mt-1 space-y-1">
                {Object.entries(machine.inputRates).map(([resourceId, rate]) => {
                  const inputResource = resources[resourceId as ResourceId];
                  const available = inputResource?.buffer || 0;
                  const needed = rate * machine.lines;
                  const hasEnough = available >= needed;
                  return (
                    <div key={resourceId} className="flex justify-between text-[10px]">
                      <span className={hasEnough ? "text-gray-300" : "text-red-400"}>
                        {inputResource?.name || resourceId}:
                      </span>
                      <span className={hasEnough ? "text-white" : "text-red-400"}>
                        {formatDecimal(available, 0)} / {formatDecimal(needed, 1)}/min
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Output */}
          <div>
            <span className="text-gray-400 text-[10px] uppercase">Output:</span>
            <div className="mt-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-300">{resources[machine.outputResource]?.name || machine.outputResource}:</span>
                <span className="text-cyan-400">
                  +{formatDecimal(machine.baseOutputPerLine * machine.lines * (utilization > 0 ? utilization : 0), 2)}/min
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Buffer: {formatDecimal(resources[machine.outputResource]?.buffer || 0, 0)}
              </div>
            </div>
          </div>

          {/* Constraints */}
          <div className="pt-2 border-t border-gray-700">
            <span className="text-gray-400 text-[10px] uppercase">Requirements:</span>
            <div className="mt-1 space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Power:</span>
                <span className="text-white">{formatDecimal(machine.powerDrawMW * machine.lines, 1)} MW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cooling:</span>
                <span className="text-white">{formatDecimal(machine.heatMW * machine.lines, 1)} MW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Workforce:</span>
                <span className="text-white">{machine.workers * machine.lines}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

