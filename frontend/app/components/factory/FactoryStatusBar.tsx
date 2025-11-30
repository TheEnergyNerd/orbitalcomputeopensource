"use client";

import { useSandboxStore } from "../../store/sandboxStore";
import { getMachineUtilization } from "../../lib/sim/engine";
import type { MachineId, ResourceId } from "../../lib/sim/model";
import { formatSigFigs, formatDecimal } from "../../lib/utils/formatNumber";
import { classifyNode, getStatusColor } from "../../lib/ui/semantics";
import { getOrbitalComputeKw } from "../../lib/sim/orbitConfig";

/**
 * Factory Status Bar - Shows key metrics and storytelling text
 */
export default function FactoryStatusBar() {
  const { simState } = useSandboxStore();

  if (!simState) return null;

  const { machines, resources } = simState;

  // Calculate key metrics using config-based formulas
  const podsPerMonth = (resources.pods?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerMonth = (resources.launches?.prodPerMin ?? 0) * 60 * 24 * 30;
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec);
  const targetComputeKw = simState.targetComputeKw;
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;

  // Find starved and constrained nodes
  let starvedNode: string | null = null;
  let constrainedNode: string | null = null;

  Object.entries(machines).forEach(([machineId, machine]) => {
    const utilization = getMachineUtilization(machine, resources, simState.constraints);
    if (utilization < 0.1 && machine.lines > 0 && !starvedNode) {
      starvedNode = machine.name;
    }
    if (utilization > 0.8 && !constrainedNode) {
      constrainedNode = machine.name;
    }
  });

  // Generate storytelling text
  let statusText = "";
  if (starvedNode) {
    statusText = `Starvation at ${starvedNode} — add more lines or check inputs.`;
  } else if (constrainedNode) {
    statusText = `${constrainedNode} is constrained — consider upgrading.`;
  } else if (podsPerMonth > 0) {
    statusText = `Your orbital supply chain is producing ${formatDecimal(podsPerMonth, 0)} pods/mo.`;
  } else {
    statusText = "Factory is idle — add lines to start production.";
  }

  return (
    <div className="fixed bottom-[240px] left-0 right-0 z-25 bg-gray-900/90 border-t border-gray-700/50 px-4 py-2" style={{ marginLeft: '280px' }}>
      <div className="flex items-center justify-between gap-4 text-xs">
        <div className="flex-1">
          <p className="text-gray-300 font-semibold">{statusText}</p>
          {orbitalShare > 0 && (
            <p className="text-gray-400 mt-1">
              You're {formatDecimal(orbitalShare, 1)}% toward orbit dominance.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <div>
            <span className="text-gray-500">Launches:</span>{" "}
            <span className="text-white font-semibold">{formatDecimal(launchesPerMonth, 0)}/mo</span>
          </div>
          <div>
            <span className="text-gray-500">Orbit:</span>{" "}
            <span className="text-white font-semibold">{podsInOrbit} pods</span>
          </div>
        </div>
      </div>
    </div>
  );
}

