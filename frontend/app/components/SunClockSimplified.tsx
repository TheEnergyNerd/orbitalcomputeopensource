"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";
import {
  getOrbitalComputeKw,
  getOrbitalPowerMw,
  DEFAULT_ORBITAL_POD_SPEC,
  DEFAULT_GROUND_DC_SPEC,
} from "../lib/sim/orbitConfig";

export default function SunClockSimplified() {
  const { simState } = useSandboxStore();

  if (!simState) return null;

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;

  // Calculate orbital metrics using config-based formulas
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec);
  const orbitalPowerMw = getOrbitalPowerMw(podsInOrbit, orbitalSpec);
  const capacityFactor = orbitalSpec.capacityFactor;
  const effectivePue = orbitalSpec.effectivePue;

  // Calculate orbital share
  const totalComputeKw = simState.targetComputeKw;
  const orbitalShare = totalComputeKw > 0 ? (orbitalComputeKw / totalComputeKw) * 100 : 0;

  // Get deployment rate
  const deploymentRate = simState?.resources.launches?.prodPerMin ?? 0;

  return (
    <div className="fixed top-[70px] right-6 w-64 z-40 panel-glass rounded-xl p-4 shadow-2xl border border-white/10">
      <div className="text-xs font-semibold text-gray-300 mb-3 uppercase">Orbit Status</div>
      
      <div className="space-y-2">
        {/* Pods in orbit */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-400">Pods in Orbit:</span>
          <span className="text-white font-semibold">{podsInOrbit}</span>
        </div>

        {/* Capacity */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-400">Capacity:</span>
          <span className="text-white font-semibold">{formatDecimal(orbitalComputeKw / 1000, 1)} MW</span>
        </div>

        {/* Deployment rate */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-400">Deployment Rate:</span>
          <span className="text-white font-semibold">
            {formatSigFigs(deploymentRate * 60 * 24 * 30)} pods/mo
          </span>
        </div>
      </div>
    </div>
  );
}

