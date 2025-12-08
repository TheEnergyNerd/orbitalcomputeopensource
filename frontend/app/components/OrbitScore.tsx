"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { calculateOrbitScore, type ScoreMetrics } from "../lib/missions/score";
import { detectStrategy } from "../lib/missions/strategy";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getOrbitHybridEnergyCostPerYear,
} from "../lib/sim/orbitConfig";

export default function OrbitScore() {
  const simState = useSandboxStore((s) => s.simState);
  const { launchSlotsThisMonth, podsPerLaunchCapacity } = useSandboxStore();

  if (!simState) return null;

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;

  // Calculate current metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) : 0;

  const currentEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );

  // Baseline (ground-only)
  const baselineEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );

  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Calculate improvements (negative = better for cost/opex/carbon, negative = better for latency)
  const costImprovement = 0; // Not calculated here
  const opexImprovement = baselineEnergyCost > 0 ? ((baselineEnergyCost - currentEnergyCost) / baselineEnergyCost) * 100 : 0;
  const latencyImprovement = baselineLatency - currentLatency; // Positive = better
  const carbonImprovement = baselineCo2 > 0 ? ((baselineCo2 - currentCo2) / baselineCo2) * 100 : 0;

  // Calculate launch stress
  // Estimate launches needed: pods in orbit / pods per launch / months to deploy
  const launchesNeeded = orbitalShare > 0 ? Math.ceil(podsInOrbit / (podsPerLaunchCapacity || 1)) : 0;
  const launchCapacity = launchSlotsThisMonth || 1;
  const launchStress = launchCapacity > 0 ? launchesNeeded / launchCapacity : 0;

  // Calculate factory stress (simplified - would need factory production rate)
  const factoryStress = 0; // TODO: Calculate from factory production vs demand

  const scoreMetrics: ScoreMetrics = {
    costImprovement,
    opexImprovement,
    latencyImprovement,
    carbonImprovement,
  };

  const { score, label, description } = calculateOrbitScore(scoreMetrics, undefined, launchStress, factoryStress);

  // Detect strategy
  const podGen = simState.generation || 1;
  const strategy = detectStrategy({
    podGen,
    orbitalShare,
    launchCapacity,
    groundEnergyPrice: groundSpec.energyPricePerMwh,
  });

  return (
    <div className="fixed top-[140px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto" style={{ width: "90%", maxWidth: "600px" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-300">ORBIT SCORE</span>
        {launchStress > 1 && (
          <span className="text-[10px] text-red-400 animate-pulse">
            ⚠ Overstressed – missions slipping
          </span>
        )}
      </div>
      
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold text-cyan-400">{score}</span>
        <span className="text-xs text-gray-400">– {label}</span>
        {description && (
          <span className="text-[10px] text-gray-500">({description})</span>
        )}
      </div>

      <div className="text-[10px] text-gray-500 mt-1">
        Strategy: <span className="text-cyan-400">{strategy.name}</span> ({strategy.description})
      </div>
    </div>
  );
}

