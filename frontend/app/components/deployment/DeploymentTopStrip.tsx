"use client";

import { useSandboxStore } from "../../store/sandboxStore";
import { calculateOrbitalShare } from "../../lib/deployment/metrics";
import { formatDecimal } from "../../lib/utils/formatNumber";

export default function DeploymentTopStrip() {
  const { simState } = useSandboxStore();

  if (!simState) {
    return null;
  }

  const podsInWarehouse = Math.floor(simState.resources.pods?.buffer || 0);
  const podsInOrbit = simState.podsInOrbit;
  
  const orbitalShare = calculateOrbitalShare(
    podsInOrbit,
    simState.orbitalPodSpec,
    simState.targetComputeKw,
    simState.podDegradationFactor
  );

  return (
    <div className="fixed top-12 left-0 right-0 z-40 bg-gray-900/95 border-b border-gray-700/50 px-4 py-2">
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Pods Ready:</span>
          <span className="text-white font-semibold">{formatDecimal(podsInWarehouse, 0)}</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Pods In Orbit:</span>
          <span className="text-cyan-400 font-semibold">{formatDecimal(podsInOrbit, 0)}</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Orbital Share:</span>
          <span className="text-green-400 font-semibold">{formatDecimal(orbitalShare * 100, 1)}%</span>
        </div>
      </div>
    </div>
  );
}

