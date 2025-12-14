/**
 * Comprehensive Radiation Model for Orbital Compute
 * 
 * REALITY CHECK: Adds missing radiation effects that are critical for space systems:
 * - Single Event Upsets (SEUs): Bit flips from cosmic rays
 * - Total Ionizing Dose (TID): Cumulative damage over time
 * - Performance degradation: 5% per year
 * - ECC overhead: 15% compute spent on error correction
 * - Storage limitations: NAND flash degrades faster in space
 * - Shielding mass and cost multipliers
 */

export interface RadiationModel {
  // Degradation
  performanceDegradationPerYear: number;   // 5% performance loss per year
  mtbfReductionFactor: number;              // 30% higher failure rate vs ground
  
  // Shielding (adds mass and cost)
  shieldingMassPerKw: number;              // kg of shielding per kW compute
  shieldingCostMultiplier: number;          // 30% cost adder for rad-hard
  
  // Altitude effects (higher = more radiation)
  leoRadiationMultiplier: number;          // Baseline
  meoRadiationMultiplier: number;          // Much worse in MEO
  saaRadiationMultiplier: number;          // South Atlantic Anomaly
  
  // Compute overhead for error correction
  eccOverhead: number;                      // 15% compute spent on ECC
  redundancyFactor: number;                 // 20% extra chips for redundancy
  
  // Storage limitations
  storageLifespanYears: number;            // NAND dies faster in space
  storageReplacementCadence: number;       // Replace 1/3 storage per year
}

export const DEFAULT_RADIATION_MODEL: RadiationModel = {
  performanceDegradationPerYear: 0.05,     // 5% per year
  mtbfReductionFactor: 0.7,                // 30% higher failure rate (0.7 = 70% of ground MTBF)
  shieldingMassPerKw: 2.0,                 // 2 kg per kW compute
  shieldingCostMultiplier: 1.3,            // 30% cost increase
  leoRadiationMultiplier: 1.0,              // Baseline
  meoRadiationMultiplier: 2.5,             // 2.5x worse in MEO
  saaRadiationMultiplier: 3.0,             // 3x worse in South Atlantic Anomaly
  eccOverhead: 0.15,                       // 15% compute overhead
  redundancyFactor: 1.2,                   // 20% extra chips
  storageLifespanYears: 3,                 // 3 years for NAND in space
  storageReplacementCadence: 0.33,         // Replace 1/3 per year
};

/**
 * Calculate effective compute after radiation effects
 * Applies ECC overhead and performance degradation
 */
export function calculateRadiationAdjustedCompute(
  baseComputePFLOPs: number,
  yearsInOrbit: number,
  model: RadiationModel = DEFAULT_RADIATION_MODEL
): number {
  // Apply ECC overhead (15% compute spent on error correction)
  const computeAfterECC = baseComputePFLOPs * (1 - model.eccOverhead);
  
  // Apply performance degradation (5% per year)
  const degradationFactor = Math.pow(1 - model.performanceDegradationPerYear, yearsInOrbit);
  
  return computeAfterECC * degradationFactor;
}

/**
 * Calculate shielding mass required for compute power
 */
export function calculateShieldingMass(
  computePowerKw: number,
  model: RadiationModel = DEFAULT_RADIATION_MODEL
): number {
  return computePowerKw * model.shieldingMassPerKw;
}

/**
 * Calculate radiation-adjusted chip cost
 */
export function calculateRadiationAdjustedCost(
  baseChipCost: number,
  model: RadiationModel = DEFAULT_RADIATION_MODEL
): number {
  return baseChipCost * model.shieldingCostMultiplier;
}

/**
 * Calculate effective failure rate with radiation effects
 */
export function calculateRadiationAdjustedFailureRate(
  baseFailureRate: number,
  orbitalShell: string,
  model: RadiationModel = DEFAULT_RADIATION_MODEL
): number {
  // Determine altitude multiplier
  let altitudeMultiplier = model.leoRadiationMultiplier;
  if (orbitalShell.includes("MEO") || orbitalShell.includes("meo")) {
    altitudeMultiplier = model.meoRadiationMultiplier;
  }
  
  // Apply MTBF reduction (higher failure rate)
  // mtbfReductionFactor of 0.7 means 30% higher failure rate
  const adjustedRate = baseFailureRate / model.mtbfReductionFactor;
  
  // Apply altitude multiplier
  return adjustedRate * altitudeMultiplier;
}

/**
 * Calculate redundancy requirement (extra chips needed)
 */
export function calculateRedundancyRequirement(
  baseChipCount: number,
  model: RadiationModel = DEFAULT_RADIATION_MODEL
): number {
  return Math.ceil(baseChipCount * model.redundancyFactor);
}

