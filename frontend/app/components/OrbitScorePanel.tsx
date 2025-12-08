"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { computeOrbitScore, type ScoreMetrics } from "../lib/missions/orbitScore";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getGroundEnergyMwhPerYear,
} from "../lib/sim/orbitConfig";

/**
 * OrbitScorePanel - Shows orbit score with label
 */
export default function OrbitScorePanel() {
  const simState = useSandboxStore((s) => s.simState);
  const { launchSlotsThisMonth, podsPerLaunchCapacity, launchReliability } = useSandboxStore();

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
  // Calculate energy costs only (not including orbital OPEX)
  const groundKw = Math.max(0, targetComputeKw - orbitalComputeKw);
  const groundEnergyMwh = getGroundEnergyMwhPerYear(groundKw, groundSpec);
  const currentEnergyCost = groundEnergyMwh * groundSpec.energyPricePerMwh; // Only ground energy costs

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
  // Baseline: ground-only energy costs
  const baselineGroundEnergyMwh = getGroundEnergyMwhPerYear(targetComputeKw, groundSpec);
  const baselineEnergyCost = baselineGroundEnergyMwh * groundSpec.energyPricePerMwh;

  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Simplified resilience
  const baselineResilience = 40;
  const currentResilience = 40 + (orbitalShare * 60);

  // Calculate cost per compute: Energy costs only (same as MetricsGrid)
  const KWH_PER_TFLOP = 1000;
  const HOURS_PER_YEAR = 8760;
  const computeKwToTFLOPyr = HOURS_PER_YEAR / KWH_PER_TFLOP; // 8.76
  
  const groundComputeTFLOPyr = targetComputeKw * computeKwToTFLOPyr;
  const groundEnergyMwhBaseline = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const groundEnergyCostOnly = groundEnergyMwhBaseline * groundSpec.energyPricePerMwh;
  const costPerComputeGround = groundComputeTFLOPyr > 0 
    ? groundEnergyCostOnly / groundComputeTFLOPyr 
    : 0;
  
  const groundKwMix = Math.max(0, targetComputeKw - orbitalComputeKw);
  const groundTFLOPyr = groundKwMix * computeKwToTFLOPyr;
  const groundEnergyMwhMix = getGroundEnergyMwhPerYear(groundKwMix, groundSpec);
  const groundEnergyCostMix = groundEnergyMwhMix * groundSpec.energyPricePerMwh;
  const groundCostPerTFLOP = groundTFLOPyr > 0 
    ? groundEnergyCostMix / groundTFLOPyr 
    : costPerComputeGround;
  
  const orbitalTFLOPyr = orbitalComputeKw * computeKwToTFLOPyr;
  const orbitalCostPerTFLOP = 0; // Free solar energy
  
  const totalTFLOPyr = groundTFLOPyr + orbitalTFLOPyr;
  const costPerComputeMix = totalTFLOPyr > 0
    ? ((groundTFLOPyr * groundCostPerTFLOP) + (orbitalTFLOPyr * orbitalCostPerTFLOP)) / totalTFLOPyr
    : costPerComputeGround;

  // Calculate launch stress with reliability
  const rawLaunchesNeeded = podsInOrbit > 0 ? Math.ceil(podsInOrbit / (podsPerLaunchCapacity || 1)) : 0;
  const effectiveLaunchesNeeded = launchReliability > 0 ? rawLaunchesNeeded / launchReliability : rawLaunchesNeeded;
  const launchCapacity = launchSlotsThisMonth || 1;
  const launchCapacityPerYear = launchCapacity * 12;
  const effectiveLaunchesNeededPerYear = effectiveLaunchesNeeded * 12; // Convert to yearly
  const launchStress = launchCapacityPerYear > 0 ? effectiveLaunchesNeededPerYear / launchCapacityPerYear : 0;

  const scoreMetrics: ScoreMetrics = {
    costPerComputeGround,
    costPerComputeMix,
    opexGround: baselineEnergyCost,
    opexMix: currentEnergyCost,
    latencyGround: baselineLatency,
    latencyMix: currentLatency,
    carbonGround: baselineCo2,
    carbonMix: currentCo2,
    resilienceGround: baselineResilience,
    resilienceMix: currentResilience,
  };

  const { score, label, launchPenalty } = computeOrbitScore(scoreMetrics, launchStress);

  return (
    <div className="fixed top-[140px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto w-[95%] max-w-[400px] px-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-bold text-cyan-400">{score >= 0 ? '+' : ''}{score}</span>
        <span className="text-xs text-gray-400">– {label}</span>
        {launchPenalty < 0 && (
          <span className="text-[10px] text-red-400">({launchPenalty} launch penalty)</span>
        )}
      </div>
    </div>
  );
}

