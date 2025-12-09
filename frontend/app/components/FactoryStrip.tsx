"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { getMachineUtilization } from "../lib/sim/engine";
import type { MachineId } from "../lib/sim/model";

const MACHINE_ICONS: Record<MachineId, string> = {
  chipFab: '🧠',
  computeLine: '📦',
  podFactory: '🔧',
  launchOps: '🚀',
};

export default function FactoryStrip() {
  const { simState } = useSandboxStore();

  if (!simState) return null;

  const { machines, resources } = simState;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-20 bg-gray-900/90 border-t border-gray-700/50 px-4 py-2">
      <div className="flex items-center justify-center gap-6">
        {(Object.keys(machines) as MachineId[]).map((machineId) => {
          const machine = machines[machineId];
          const utilization = getMachineUtilization(machine, resources, simState.constraints);
          const utilizationPercent = Math.min(100, utilization * 100);
          const isBottlenecked = utilization > 0.9;
          const isUnderutilized = utilization < 0.2;

          return (
            <div
              key={machineId}
              className={`flex flex-col items-center gap-1 transition-all ${
                isUnderutilized ? "opacity-40" : ""
              }`}
            >
              <div
                className={`text-2xl transition-all ${
                  isBottlenecked ? "animate-pulse" : ""
                }`}
              >
                {MACHINE_ICONS[machineId]}
              </div>
              <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isBottlenecked
                      ? "bg-red-500 animate-pulse"
                      : utilizationPercent > 80
                      ? "bg-yellow-400"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${utilizationPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400">
                {machine.lines}L
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

