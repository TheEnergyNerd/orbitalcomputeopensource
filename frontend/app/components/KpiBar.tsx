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
  // Calculate metrics using config-based formulas
  const simState = useSandboxStore((s) => s.simState);
  
  if (!simState) return null;
  
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;
  
  // Calculate annualized metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;
  
  const energyMwhPerYear = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const co2TonsPerYear = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const energyCostPerYear = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  
  // Simplified metrics (can be enhanced later)
  const avgLatencyMs = 90; // TODO: derive from orbital share
  const resilience = 95; // TODO: derive from orbital share
  const coverage = 85; // TODO: derive from orbital share
  const coolingCostPerYear = energyCostPerYear * 0.25; // 25% of energy cost

  const maxQueue = 100; // TODO: derive from constraints

  return (
    <div className="fixed top-[70px] left-[280px] right-[280px] z-30 bg-gray-900/90 border-b border-gray-700/50 px-3 py-1.5">
      <div className="flex items-center justify-center gap-3 text-[11px] flex-wrap">
        <span className="text-gray-400">Latency</span>
        <span className="text-white font-semibold">{formatDecimal(avgLatencyMs, 1)} ms</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">Energy Cost</span>
        <span className="text-white font-semibold">${formatSigFigs(energyCostPerYear / 1_000_000, 1)}M/yr</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">Cooling</span>
        <span className="text-white font-semibold">${formatSigFigs(coolingCostPerYear / 1_000_000, 1)}M/yr</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">CO₂</span>
        <span className="text-white font-semibold">{formatSigFigs(co2TonsPerYear / 1000, 1)} kt/yr</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">Resilience</span>
        <span className="text-white font-semibold">{formatDecimal(resilience, 0)}%</span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">Orbit Share</span>
        <span className="text-white font-semibold">{formatDecimal(orbitalShare, 1)}%</span>
      </div>
    </div>
  );
}
