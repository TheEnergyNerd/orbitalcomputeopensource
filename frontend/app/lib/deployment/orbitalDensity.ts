/**
 * Orbital Density System
 * Tracks density in "satellite equivalents" and applies effects
 */

export enum DensityBand {
  SAFE = "Safe",
  BUSY = "Busy",
  CONGESTED = "Congested",
  UNSAFE = "Unsafe",
}

const SAFE_DENSITY = 5_000;
const BUSY_DENSITY = 15_000;
const CONGESTED_DENSITY = 25_000;

/**
 * Get density band from satellite-equivalent count
 * Each pod = ~50 satellites equivalent
 */
export function getDensityBand(density: number): DensityBand {
  if (density < SAFE_DENSITY) return DensityBand.SAFE;
  if (density < BUSY_DENSITY) return DensityBand.BUSY;
  if (density < CONGESTED_DENSITY) return DensityBand.CONGESTED;
  return DensityBand.UNSAFE;
}

/**
 * Calculate deployment delay multiplier based on density
 * Higher density = slower deployments
 */
export function getDeploymentDelayMultiplier(density: number): number {
  const safeDensity = 10_000; // Safe threshold
  return 1 + Math.pow(density / safeDensity, 2);
}

/**
 * Calculate failure rate based on density band
 */
export function getFailureRate(densityBand: DensityBand): number {
  switch (densityBand) {
    case DensityBand.SAFE:
      return 0.01; // 1% failure rate
    case DensityBand.BUSY:
      return 0.02; // 2% failure rate
    case DensityBand.CONGESTED:
      return 0.05; // 5% failure rate
    case DensityBand.UNSAFE:
      return 0.10; // 10% failure rate
  }
}

/**
 * Calculate latency penalty from density
 */
export function getLatencyPenalty(densityBand: DensityBand): number {
  switch (densityBand) {
    case DensityBand.SAFE:
    case DensityBand.BUSY:
      return 0; // No penalty
    case DensityBand.CONGESTED:
      return 5; // +5ms penalty
    case DensityBand.UNSAFE:
      return 15; // +15ms penalty
  }
}

