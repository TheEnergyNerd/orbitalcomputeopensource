"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";
import { getOrbitalComputeKw, getOrbitalPowerMw } from "../lib/sim/orbitConfig";

export default function OrbitPanel() {
  const { simState } = useSandboxStore();

  if (!simState) return null;

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const deploymentRate = simState?.resources.launches?.prodPerMin ?? 0;

  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalPowerMw = getOrbitalPowerMw(podsInOrbit, orbitalSpec);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-gray-300 mb-2 uppercase">Orbit Status</h3>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Pods in Orbit:</span>
            <span className="text-white">{podsInOrbit}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Capacity:</span>
            <span className="text-white">{formatDecimal(orbitalComputeKw / 1000, 1)} MW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Deployment Rate:</span>
            <span className="text-white">
              {formatSigFigs(deploymentRate * 60 * 24 * 30)} pods/mo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

