import type { OrbitMode, DensityMode } from "../../store/sandboxStore";
import type { PodTierId } from "../deployment/podTiers";

export interface MetricsInputs {
  deployedOrbitalCapacity: number; // MW
  remainingGroundCapacity: number; // MW
  baseGroundCapacity: number; // MW
  isSurgeActive: boolean;
  // Strategic levers
  podTier: PodTierId; // Pod tier affects power efficiency, not latency modifiers
  orbitMode: OrbitMode;
  offloadPct: number; // 0-100
  densityMode: DensityMode;
  cumulativeDeployedUnits: number; // For scaling economies
  orbitalDensity: number; // Satellite equivalents for density penalties
}

export interface CalculatedMetrics {
  latency: number; // ms
  energyCost: number; // $M/year
  carbon: number; // metric tons/year
  coolingCost: number; // $M/year
  resilienceScore: number; // 0-100
  worldImpact: number; // 0-100
}

// Baseline constants
const BASE_GROUND_CAPACITY_GW = 42;
const BASELINE_LATENCY = 45; // ms
const MIN_LATENCY = 5; // ms
const BASELINE_ENERGY_PER_GW = 50; // $/MWh per GW
const BASELINE_CARBON_PER_GW = 350; // kg CO2/MWh per GW
const BASELINE_COOLING_RATIO = 0.4; // 40% of energy cost

/**
 * Calculate all metrics with strategic levers applied
 */
export function calculateMetrics(inputs: MetricsInputs): CalculatedMetrics {
  const {
    deployedOrbitalCapacity,
    remainingGroundCapacity,
    baseGroundCapacity,
    isSurgeActive,
    podTier,
    orbitMode,
    offloadPct,
    densityMode,
    orbitalDensity,
  } = inputs;

  const totalCapacity = deployedOrbitalCapacity + remainingGroundCapacity;
  const orbitShare = totalCapacity > 0 ? deployedOrbitalCapacity / totalCapacity : 0;
  const capacityRatio = totalCapacity / baseGroundCapacity;
  const surgeMultiplier = isSurgeActive ? 1.5 : 1.0;

  // ===== POD TIER EFFECTS =====
  // Pod tiers affect power efficiency (higher tiers = more efficient)
  // Tier 1: baseline efficiency
  // Tier 2: 10% more efficient
  // Tier 3: 20% more efficient
  let podPowerMultiplier = 1.0;
  switch (podTier) {
    case "tier1":
      podPowerMultiplier = 1.0; // Baseline
      break;
    case "tier2":
      podPowerMultiplier = 0.90; // 10% more efficient
      break;
    case "tier3":
      podPowerMultiplier = 0.80; // 20% more efficient
      break;
  }
  
  // Apply density-based latency penalty
  const densityLatencyPenalty = orbitalDensity > 25000 ? 15 : orbitalDensity > 15000 ? 5 : 0;

  // ===== ORBIT MODE EFFECTS =====
  let orbitLatencyModifier = 0; // ms
  let orbitCapexMultiplier = 1.0;
  let orbitSatCountMultiplier = 1.0;
  let orbitCoverageMultiplier = 1.0;

  switch (orbitMode) {
    case "LEO":
      orbitLatencyModifier = -10; // -10ms
      orbitCapexMultiplier = 1.20; // +20%
      orbitSatCountMultiplier = 1.4;
      break;
    case "MEO":
      // Baseline - no changes
      break;
    case "GEO":
      orbitLatencyModifier = 200; // +200ms
      orbitCapexMultiplier = 0.60; // -40%
      orbitCoverageMultiplier = 3.0; // ×3 coverage
      orbitSatCountMultiplier = 0.2;
      break;
  }

  // ===== DENSITY MODE EFFECTS =====
  let densityLatencyModifier = 0; // ms
  let densityFailureRiskMultiplier = 1.0;
  let densityBuildTimeMultiplier = 1.0;
  let densityDebrisRiskMultiplier = 1.0;
  let densityEnergyEffMultiplier = 1.0;

  switch (densityMode) {
    case "Safe":
      densityLatencyModifier = -5; // -5ms
      densityFailureRiskMultiplier = 0.5; // ×0.5
      densityBuildTimeMultiplier = 1.2; // ×1.2
      break;
    case "Aggressive":
      densityLatencyModifier = -10; // -10ms
      densityFailureRiskMultiplier = 1.5; // ×1.5
      densityDebrisRiskMultiplier = 2.0; // ×2
      break;
    case "Optimized":
      densityLatencyModifier = -7; // -7ms
      densityEnergyEffMultiplier = 1.1; // ×1.1
      break;
  }

  // ===== CALCULATE LATENCY =====
  // Base latency calculation
  let baseLatency = BASELINE_LATENCY - (BASELINE_LATENCY - MIN_LATENCY) * orbitShare;
  
  // Apply orbit mode
  baseLatency += orbitLatencyModifier;
  
  // Apply density mode
  baseLatency += densityLatencyModifier;
  
  // Apply orbital density penalty
  baseLatency += densityLatencyPenalty;
  
  // Apply offload strategy (weighted average)
  const groundLatency = baseLatency;
  const orbitLatency = Math.max(MIN_LATENCY, baseLatency * 0.3); // Orbital is much lower
  const weightedLatency = (1 - offloadPct / 100) * groundLatency + (offloadPct / 100) * orbitLatency;
  
  // Surge effects
  let finalLatency = weightedLatency;
  if (isSurgeActive && orbitShare < 0.1) {
    finalLatency = BASELINE_LATENCY * surgeMultiplier;
  } else if (isSurgeActive && orbitShare >= 0.1) {
    finalLatency = Math.max(MIN_LATENCY, weightedLatency * 0.7);
  }

  // ===== CALCULATE ENERGY COST =====
  const orbitalEnergyPerGW = 0; // Solar powered
  const groundEnergyPerGW = BASELINE_ENERGY_PER_GW; // Ground energy doesn't change with pod tier
  
  const orbitalEnergy = orbitalEnergyPerGW * (deployedOrbitalCapacity / 1000) * 8760;
  const groundEnergy = groundEnergyPerGW * (remainingGroundCapacity / 1000) * 8760;
  
  // Apply density mode energy efficiency
  let totalEnergy = (orbitalEnergy + groundEnergy) * capacityRatio * densityEnergyEffMultiplier;
  
  // Apply offload strategy (reduces ground cooling load)
  totalEnergy *= (1 - (offloadPct / 100) * 0.1);
  
  if (isSurgeActive && orbitShare < 0.1) {
    totalEnergy = BASELINE_ENERGY_PER_GW * BASE_GROUND_CAPACITY_GW * 8760 * surgeMultiplier * capacityRatio;
  }

  // ===== CALCULATE CARBON =====
  const orbitalCarbon = 0; // Solar powered, no operational emissions
  const groundCarbonPerGW = BASELINE_CARBON_PER_GW;
  const groundCarbon = groundCarbonPerGW * (remainingGroundCapacity / 1000) * 8760 / 1000; // Annual in metric tons
  
  let operationalCarbon = groundCarbon * capacityRatio;
  if (isSurgeActive && orbitShare < 0.1) {
    operationalCarbon = BASELINE_CARBON_PER_GW * BASE_GROUND_CAPACITY_GW * 8760 / 1000 * surgeMultiplier * capacityRatio;
  }

  // ===== CALCULATE COOLING COST =====
  const baselineCooling = BASELINE_ENERGY_PER_GW * BASE_GROUND_CAPACITY_GW * 8760 * BASELINE_COOLING_RATIO;
  let coolingCost = baselineCooling * (1 - orbitShare) * (remainingGroundCapacity / baseGroundCapacity);
  
  // Cooling only applies to ground capacity
  coolingCost *= capacityRatio;

  // ===== CALCULATE RESILIENCE SCORE =====
  // Base resilience from orbit share
  let resilienceScore = 40 + orbitShare * 60; // 40-100 range
  
  // Add offload strategy bonus
  resilienceScore += 0.2 * offloadPct;
  
  // Apply orbit mode coverage multiplier
  resilienceScore *= (1 + (orbitCoverageMultiplier - 1) * orbitShare);
  
  resilienceScore = Math.min(100, Math.max(0, resilienceScore));

  // ===== CALCULATE WORLD IMPACT =====
  // Composite score based on carbon reduction, energy savings, and coverage
  const carbonReduction = 1 - (operationalCarbon / (BASELINE_CARBON_PER_GW * BASE_GROUND_CAPACITY_GW * 8760 / 1000));
  const energyReduction = 1 - (totalEnergy / (BASELINE_ENERGY_PER_GW * BASE_GROUND_CAPACITY_GW * 8760));
  const coverageScore = orbitShare * orbitCoverageMultiplier;
  
  const worldImpact = (carbonReduction * 0.4 + energyReduction * 0.3 + coverageScore * 0.3) * 100;
  
  return {
    latency: Math.max(MIN_LATENCY, finalLatency),
    energyCost: totalEnergy,
    carbon: Math.max(0, operationalCarbon),
    coolingCost: Math.max(0, coolingCost),
    resilienceScore,
    worldImpact: Math.min(100, Math.max(0, worldImpact)),
  };
}

/**
 * Calculate scaling economies for cost and time
 * Uses log-learning curve: cost = baseCost * (unitsDeployed ** learningExponent)
 */
// Note: calculateScalingEconomies is now handled by deployment engine
// This function is kept for backward compatibility but should be phased out
export function calculateScalingEconomies(
  baseCost: number,
  baseTime: number,
  cumulativeDeployedUnits: number,
  launchProvider: any, // Deprecated
  orbitMode: OrbitMode,
  techLevel: any // Deprecated - use pod tier instead
): { cost: number; time: number } {
  // Learning curve: 8% improvement per pod (capped at 100 pods)
  const learningRate = 0.08;
  const timeLearningRate = 0.04;
  const cappedPods = Math.min(cumulativeDeployedUnits, 100);
  
  const cost = baseCost * Math.pow(1 - learningRate, cappedPods);
  const time = baseTime * Math.pow(1 - timeLearningRate, cappedPods);
  
  return { cost, time };
}

