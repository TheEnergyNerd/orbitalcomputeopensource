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
      
      <div className="space-y-3">
        {/* Pods in orbit */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-gray-400">Pods in Orbit</span>
            <span className="text-white font-semibold">{podsInOrbit}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-accent-blue h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, orbitalShare)}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {formatSigFigs(orbitalShare)}% of compute capacity
          </div>
        </div>

        {/* Average solar capacity factor */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-gray-400">Avg Solar Capacity</span>
            <span className="text-white font-semibold">{formatDecimal(capacityFactor * 100, 0)}%</span>
          </div>
        </div>

        {/* Effective PUE */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-gray-400">Effective PUE</span>
            <span className="text-white font-semibold">{formatDecimal(effectivePue, 2)}</span>
          </div>
          <div className="text-[10px] text-gray-500">
            vs {formatDecimal(groundSpec.pue, 2)} on Earth
          </div>
        </div>

        {/* Total orbital compute */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-gray-400">Orbital Compute</span>
            <span className="text-white font-semibold">{formatDecimal(orbitalComputeKw / 1000, 1)} MW</span>
          </div>
        </div>

        {/* Deployment rate */}
        <div className="pt-2 border-t border-gray-700/50">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Deployment Rate:</span>
            <span className="text-white font-semibold">
              {formatSigFigs(deploymentRate * 60 * 24 * 30)} pods/mo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

