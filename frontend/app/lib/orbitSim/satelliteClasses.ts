/**
 * Two-Class Satellite System
 * 
 * Class A: Starlink-compute sats (baseline LEO)
 * Class B: Casey SSO slicer inference sats (available from 2030)
 */

export type SatelliteClass = "A" | "B";
export type StrategyMode = "COST" | "LATENCY" | "CARBON" | "BALANCED";

// ============================================================================
// CLASS A: Starlink-compute (baseline)
// ============================================================================
export const SAT_A_POWER_KW = 120;           // electrical power
export const SAT_A_COMPUTE_PFLOPS_0 = 10;   // baseline FP16-equivalent
export const SAT_A_LIFETIME_Y = 6;
export const SAT_A_MASS_T = 1.2;

// ============================================================================
// CLASS B: Casey SSO slicer (inference-only, high compute density)
// ============================================================================
export const SAT_B_POWER_KW_0 = 130;        // slightly more array power
export const SAT_B_COMPUTE_PFLOPS_0 = 200;  // ~20x class A at similar power
export const SAT_B_LIFETIME_Y = 7;
export const SAT_B_MASS_T = 2.0;
export const SAT_B_AVAILABLE_FROM = 2030;

// ============================================================================
// TECH CURVE COEFFICIENTS
// ============================================================================
const K1_COMPUTE_A = 0.18;  // compute density improves fast for A
const K2_POWER_A = 0.04;    // power grows slower for A
const K1_COMPUTE_B = 0.14;  // compute density for B (slightly slower)
const K2_POWER_B = 0.03;    // power growth for B

// ============================================================================
// ANNUAL LAUNCH CAPACITY
// ============================================================================
/**
 * Annual launch capacity (satellites/year)
 * L(t) = min(60 * t, 1200)
 * 
 * @param yearOffset Years since start (t - startYear)
 */
export function getAnnualLaunchCapacity(yearOffset: number): number {
  return Math.min(60 * yearOffset, 1200);
}

// ============================================================================
// STRATEGY GROWTH MULTIPLIERS
// ============================================================================
export const STRATEGY_GROWTH_MULTIPLIERS: Record<StrategyMode, number> = {
  COST: 1.30,
  LATENCY: 1.10,
  CARBON: 1.05,
  BALANCED: 1.18,
};

// ============================================================================
// CLASS B SHARE BY STRATEGY
// ============================================================================
/**
 * Calculate what fraction of launches should be Class B
 * 
 * @param strategy Current strategy
 * @param year Current year
 * @returns Fraction (0-1) of launches that should be Class B
 */
export function getClassBShare(strategy: StrategyMode, year: number): number {
  if (year < SAT_B_AVAILABLE_FROM) return 0;
  
  switch (strategy) {
    case "CARBON":
      return 0.7;  // carbon-first loves high PFLOPs per watt
    case "COST":
      return 0.5;  // strong share; cost/TFLOP is insane
    case "LATENCY":
      return 0.25; // some use, but latency focus keeps more in LEO-A
    case "BALANCED":
    default:
      return 0.5;
  }
}

// ============================================================================
// TECH CURVES (compute and power per satellite)
// ============================================================================
/**
 * Calculate compute per Class A satellite at given year
 * 
 * @param year Current year
 * @param startYear Base year for tech curve
 */
export function getClassACompute(year: number, startYear: number = 2025): number {
  const dt = year - startYear;
  return SAT_A_COMPUTE_PFLOPS_0 * (1 + K1_COMPUTE_A * dt);
}

/**
 * Calculate power per Class A satellite at given year
 */
export function getClassAPower(year: number, startYear: number = 2025): number {
  const dt = year - startYear;
  return SAT_A_POWER_KW * (1 + K2_POWER_A * dt);
}

/**
 * Calculate compute per Class B satellite at given year
 */
export function getClassBCompute(year: number): number {
  const dt = Math.max(0, year - SAT_B_AVAILABLE_FROM);
  return SAT_B_COMPUTE_PFLOPS_0 * (1 + K1_COMPUTE_B * dt);
}

/**
 * Calculate power per Class B satellite at given year
 */
export function getClassBPower(year: number): number {
  const dt = Math.max(0, year - SAT_B_AVAILABLE_FROM);
  return SAT_B_POWER_KW_0 * (1 + K2_POWER_B * dt);
}

// ============================================================================
// ORBIT ALLOCATION BY STRATEGY
// ============================================================================
export interface OrbitAllocation {
  lowLEO: number;    // 350-450 km, 53° inclination
  midLEO: number;    // 500-650 km, 70° inclination
  sunSync: number;   // ~560 km, 97-98° inclination
}

/**
 * Get orbit allocation percentages based on strategy
 */
export function getOrbitAllocation(strategy: StrategyMode): OrbitAllocation {
  // Baseline: 45% low LEO, 35% mid LEO, 20% sun-sync
  let lowLEO = 0.45;
  let midLEO = 0.35;
  let sunSync = 0.20;
  
  switch (strategy) {
    case "LATENCY":
      // Shift 15% more into low LEO
      lowLEO += 0.15;
      midLEO -= 0.10;
      sunSync -= 0.05;
      break;
    case "CARBON":
      // Shift 20% more into sun-sync
      sunSync += 0.20;
      lowLEO -= 0.10;
      midLEO -= 0.10;
      break;
    case "COST":
      // Shift 20% into mid LEO
      midLEO += 0.20;
      lowLEO -= 0.10;
      sunSync -= 0.10;
      break;
    case "BALANCED":
    default:
      // Use baseline
      break;
  }
  
  // Normalize to ensure sum = 1.0
  const sum = lowLEO + midLEO + sunSync;
  return {
    lowLEO: lowLEO / sum,
    midLEO: midLEO / sum,
    sunSync: sunSync / sum,
  };
}

// ============================================================================
// SATELLITE RETIREMENT
// ============================================================================
/**
 * Calculate how many satellites of a class retire in a given year
 * 
 * @param deployedByYear Map of year -> count deployed that year
 * @param currentYear Current simulation year
 * @param lifetime Lifetime in years
 */
export function calculateRetirements(
  deployedByYear: Map<number, number>,
  currentYear: number,
  lifetime: number
): number {
  const retirementYear = currentYear - lifetime;
  return deployedByYear.get(retirementYear) || 0;
}

