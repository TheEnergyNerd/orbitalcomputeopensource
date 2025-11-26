/**
 * Deployment Engine
 * Central logic for manufacturing rates, launch capacity, queue management, and deployment pacing
 */

import { getAvailableTiers, getHighestAvailableTier, type PodTier } from "./podTiers";
import { calculateLaunchCapacity, type LaunchProviderId } from "./launchProviders";
import { getDensityBand, getDeploymentDelayMultiplier, type DensityBand } from "./orbitalDensity";

export interface DeploymentState {
  totalPodsBuilt: number;
  totalPodsInOrbit: number;
  totalPodsInQueue: number;
  activeLaunchProviders: LaunchProviderId[];
}

export interface DeploymentEngineOutput {
  // Rates
  manufacturingRatePodsPerMonth: number;
  launchCapacityPodsPerMonth: number;
  effectiveDeploymentRatePodsPerMonth: number;
  
  // Infrastructure
  infraTier: "small" | "growing" | "scaled" | "mega";
  maxQueue: number;
  
  // Orbital
  orbitalDensity: number; // satellite equivalents
  densityBand: DensityBand;
  deploymentDelayMultiplier: number;
  
  // Costs and times (learning adjusted)
  costPerPod: number;
  buildTimePerPod: number;
  
  // Available tiers
  availableTiers: PodTier[];
  highestTier: PodTier;
}

const BASE_MANUFACTURING_RATE = 0.2; // pods/month early game
const SATELLITES_PER_POD = 50; // Each pod = 50 satellites equivalent

/**
 * Calculate manufacturing rate based on total pods built
 * Uses learning curve: rate = base * (1 + 0.03 * totalPodsBuilt^0.6)
 */
function calculateManufacturingRate(totalPodsBuilt: number): number {
  return BASE_MANUFACTURING_RATE * (1 + 0.03 * Math.pow(totalPodsBuilt, 0.6));
}

/**
 * Get infrastructure tier from manufacturing rate
 */
function getInfraTier(manufacturingRate: number): "small" | "growing" | "scaled" | "mega" {
  if (manufacturingRate < 2) return "small";
  if (manufacturingRate < 10) return "growing";
  if (manufacturingRate < 40) return "scaled";
  return "mega";
}

/**
 * Get max queue size based on infrastructure tier
 */
function getMaxQueue(tier: "small" | "growing" | "scaled" | "mega"): number {
  switch (tier) {
    case "small": return 5;
    case "growing": return 20;
    case "scaled": return 100;
    case "mega": return 250;
  }
}

/**
 * Calculate learning-adjusted cost
 * cost = baseCost * (1 - learningRate)^totalPodsBuilt
 */
function getLearningAdjustedCost(baseCostM: number, totalPodsBuilt: number, learningRate = 0.08): number {
  return baseCostM * Math.pow(1 - learningRate, Math.min(totalPodsBuilt, 100)); // Cap learning at 100 pods
}

/**
 * Calculate learning-adjusted build time
 * time = baseTime * (1 - timeLearningRate)^totalPodsBuilt
 */
function getLearningAdjustedBuildTime(baseDays: number, totalPodsBuilt: number, timeLearningRate = 0.04): number {
  return baseDays * Math.pow(1 - timeLearningRate, Math.min(totalPodsBuilt, 100)); // Cap learning at 100 pods
}

/**
 * Calculate orbital density in satellite equivalents
 */
function calculateOrbitalDensity(totalPodsInOrbit: number): number {
  return totalPodsInOrbit * SATELLITES_PER_POD;
}

/**
 * Main deployment engine function
 */
export function calculateDeploymentEngine(state: DeploymentState): DeploymentEngineOutput {
  const { totalPodsBuilt, totalPodsInOrbit, totalPodsInQueue, activeLaunchProviders } = state;
  
  // Manufacturing rate
  const manufacturingRatePodsPerMonth = calculateManufacturingRate(totalPodsBuilt);
  
  // Launch capacity
  const launchCapacityPodsPerMonth = calculateLaunchCapacity(activeLaunchProviders);
  
  // Orbital density
  const orbitalDensity = calculateOrbitalDensity(totalPodsInOrbit);
  const densityBand = getDensityBand(orbitalDensity);
  const deploymentDelayMultiplier = getDeploymentDelayMultiplier(orbitalDensity);
  
  // Effective deployment rate (limited by manufacturing, launch, and density)
  const effectiveDeploymentRatePodsPerMonth = 
    Math.min(manufacturingRatePodsPerMonth, launchCapacityPodsPerMonth) / deploymentDelayMultiplier;
  
  // Infrastructure tier and queue
  const infraTier = getInfraTier(manufacturingRatePodsPerMonth);
  const maxQueue = getMaxQueue(infraTier);
  
  // Available tiers
  const availableTiers = getAvailableTiers(totalPodsBuilt);
  const highestTier = getHighestAvailableTier(totalPodsBuilt);
  
  // Learning-adjusted cost and time for highest tier
  const costPerPod = getLearningAdjustedCost(highestTier.baseCostM, totalPodsBuilt);
  const buildTimePerPod = getLearningAdjustedBuildTime(highestTier.baseBuildDays, totalPodsBuilt);
  
  return {
    manufacturingRatePodsPerMonth,
    launchCapacityPodsPerMonth,
    effectiveDeploymentRatePodsPerMonth,
    infraTier,
    maxQueue,
    orbitalDensity,
    densityBand,
    deploymentDelayMultiplier,
    costPerPod,
    buildTimePerPod,
    availableTiers,
    highestTier,
  };
}

