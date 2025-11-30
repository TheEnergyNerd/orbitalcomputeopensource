"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getOrbitHybridEnergyCostPerYear,
} from "../lib/sim/orbitConfig";

export default function KpiBar() {
  const { simState } = useSandboxStore();

  // Calculate metrics using config-based formulas
  const simState = useSandboxStore((s) => s.simState);
  
  if (!simState) return null;
  
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;
  
  // Calculate annualized metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;
  
  const energyMwhPerYear = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec
  );
  const co2TonsPerYear = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec
  );
  const energyCostPerYear = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec
  );
  
  // Simplified metrics (can be enhanced later)
  const avgLatencyMs = 90; // TODO: derive from orbital share
  const resilience = 95; // TODO: derive from orbital share
  const coverage = 85; // TODO: derive from orbital share
  const coolingCostPerYear = energyCostPerYear * 0.25; // 25% of energy cost

  const maxQueue = 100; // TODO: derive from constraints

  return (
    <div className="fixed bottom-[240px] left-0 right-0 z-25 bg-gray-900/95 border-t border-gray-700/50 px-4 py-2" style={{ marginLeft: '280px' }}>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Latency</span>
          <span className="text-white font-semibold">{formatDecimal(avgLatencyMs, 1)} ms</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Energy Cost</span>
          <span className="text-white font-semibold">${formatSigFigs(energyCostPerYear / 1_000_000, 1)}M/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Cooling</span>
          <span className="text-white font-semibold">${formatSigFigs(coolingCostPerYear / 1_000_000, 1)}M/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Carbon</span>
          <span className="text-white font-semibold">{formatSigFigs(co2TonsPerYear / 1000, 1)} ktCO₂/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Resilience</span>
          <span className="text-white font-semibold">{formatDecimal(resilience, 0)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Coverage</span>
          <span className="text-white font-semibold">{formatDecimal(coverage, 1)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Orbital Share</span>
          <span className="text-white font-semibold">{formatDecimal(orbitalShare, 1)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Queue</span>
          <span className="text-white font-semibold">{formatDecimal(simState.resources.pods?.buffer ?? 0, 0)}/{maxQueue}</span>
        </div>
      </div>
    </div>
  );
}
