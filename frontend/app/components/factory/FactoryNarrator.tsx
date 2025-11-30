"use client";

import { useSandboxStore } from "../../store/sandboxStore";
import { getMachineUtilization } from "../../lib/sim/engine";
import type { MachineId, ResourceId } from "../../lib/sim/model";

interface BottleneckInfo {
  nodeId: string;
  nodeName: string;
  reason: string;
  suggestion: string;
  severity: number; // Higher = worse
}

export function useFactoryNarrator(): BottleneckInfo | null {
  const { simState } = useSandboxStore();

  if (!simState) return null;

  const { machines, resources } = simState;
  const bottlenecks: BottleneckInfo[] = [];

  // Check each machine for starvation or constraint
  Object.entries(machines).forEach(([machineId, machine]) => {
    if (machine.lines === 0) return;

    const utilization = getMachineUtilization(machine, resources, simState.constraints);
    const isStarved = utilization < 0.1 && machine.lines > 0;
    const isConstrained = utilization > 0.8;

    if (isStarved || isConstrained) {
      // Find which input is missing
      let missingInput: ResourceId | null = null;
      let missingInputName = "";
      let suggestion = "";

      for (const [inputResourceId, consumptionPerLine] of Object.entries(machine.inputRates)) {
        const resource = resources[inputResourceId as ResourceId];
        if (!resource || !consumptionPerLine) continue;

        const totalNeeded = consumptionPerLine * machine.lines;
        const available = resource.buffer;

        if (available < totalNeeded * 0.1) {
          // This input is critically low
          missingInput = inputResourceId as ResourceId;
          missingInputName = resource.name;
          break;
        }
      }

      // Generate suggestion based on machine and missing input
      if (missingInput) {
        if (machineId === "chipFab" && missingInput === "silicon") {
          suggestion = "Silicon source is infinite - check if Chip Fab lines are sufficient";
        } else if (machineId === "rackLine") {
          if (missingInput === "chips") {
            suggestion = "Add more Chip Fab lines";
          } else if (missingInput === "steel") {
            suggestion = "Steel source is infinite - check if Rack Line lines are sufficient";
          }
        } else if (machineId === "podFactory") {
          if (missingInput === "chips" || missingInput === "racks") {
            suggestion = "Add more Chip Fab or Rack Line lines";
          }
        } else if (machineId === "fuelPlant") {
          if (missingInput === "methane" || missingInput === "lox") {
            suggestion = "Methane/LOX sources are infinite - check if Fuel Plant lines are sufficient";
          }
        } else if (machineId === "launchComplex") {
          if (missingInput === "pods") {
            suggestion = "Add more Pod Factory lines";
          } else if (missingInput === "fuel") {
            suggestion = "Add more Fuel Plant lines";
          }
        }
      } else if (isConstrained) {
        suggestion = `Consider upgrading ${machine.name} or adding more lines`;
      }

      const severity = isStarved ? (1 - utilization) * 100 : utilization * 10;
      bottlenecks.push({
        nodeId: machineId,
        nodeName: machine.name,
        reason: missingInput ? `out of ${missingInputName}` : "high utilization",
        suggestion: suggestion || "Check inputs and lines",
        severity,
      });
    }
  });

  // Return the worst bottleneck
  if (bottlenecks.length === 0) return null;
  
  bottlenecks.sort((a, b) => b.severity - a.severity);
  return bottlenecks[0];
}

export default function FactoryNarrator() {
  const bottleneck = useFactoryNarrator();

  if (!bottleneck) {
    return (
      <div className="fixed bottom-[240px] left-0 right-0 z-25 text-center px-4 py-2" style={{ marginLeft: '280px' }}>
        <div className="text-sm text-gray-400">
          Factory running smoothly — no bottlenecks detected
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[220px] left-0 right-0 z-25 text-center px-4 py-2" style={{ marginLeft: '280px' }}>
      <div className="flex items-center justify-center gap-2 text-base font-semibold">
        <span className="text-red-400">⚠️</span>
        <span className="text-white">
          Current bottleneck: <span className="text-red-400">{bottleneck.nodeName}</span> — {bottleneck.reason} — Try {bottleneck.suggestion}
        </span>
      </div>
    </div>
  );
}

