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
export const SAT_A_POWER_KW = 150;           // electrical power (updated from 120kW)
export const SAT_A_COMPUTE_PFLOPS_0 = 10;   // baseline FP16-equivalent
export const SAT_A_LIFETIME_Y = 6;
export const SAT_A_MASS_T = 1.2;

// ============================================================================
// CLASS B: Casey SSO slicer (inference-only, high compute density)
// ============================================================================
export const SAT_B_POWER_KW_0 = 150;        // same as Class A (updated from 130kW)
export const SAT_B_COMPUTE_PFLOPS_0 = 200;  // ~20x class A at similar power
export const SAT_B_LIFETIME_Y = 7;
export const SAT_B_MASS_T = 2.0;
export const SAT_B_AVAILABLE_FROM = 2030;

// ============================================================================
// POWER PROGRESSION CURVE (matches yearSteppedDeployment.ts)
// ============================================================================
const POWER_PROGRESSION: Record<number, number> = {
  2025: 150,
  2028: 300,
  2032: 500,
  2036: 750,
  2040: 1000,
};

/**
 * Get power per satellite using the progression curve
 */
function getPowerFromProgression(year: number): number {
  // If exact year match, use that value
  if (POWER_PROGRESSION[year]) {
    return POWER_PROGRESSION[year];
  }
  
  // Find surrounding years for interpolation
  const years = Object.keys(POWER_PROGRESSION).map(Number).sort((a, b) => a - b);
  
  if (year <= years[0]) return POWER_PROGRESSION[years[0]];
  if (year >= years[years.length - 1]) return POWER_PROGRESSION[years[years.length - 1]];
  
  let lowerYear = years[0];
  let upperYear = years[years.length - 1];
  
  for (let i = 0; i < years.length - 1; i++) {
    if (year >= years[i] && year <= years[i + 1]) {
      lowerYear = years[i];
      upperYear = years[i + 1];
      break;
    }
  }
  
  // Linear interpolation
  const lower = POWER_PROGRESSION[lowerYear];
  const upper = POWER_PROGRESSION[upperYear];
  const t = (year - lowerYear) / (upperYear - lowerYear);
  
  return lower + (upper - lower) * t;
}

// ============================================================================
// TECH CURVE COEFFICIENTS
// ============================================================================
const K1_COMPUTE_A = 0.18;  // compute density improves fast for A
const K2_POWER_A = 0.04;    // power grows slower for A (legacy, not used)
const K1_COMPUTE_B = 0.14;  // compute density for B (slightly slower)
const K2_POWER_B = 0.03;    // power growth for B (legacy, not used)

// ============================================================================
// DEPLOYMENT SCALE FACTORS
// ============================================================================
/**
 * Scale factors to reduce deployment to target GW levels
 * Baseline: 150 GW target (150k satellites at 1 MW each) - Scale: 0.64
 * Ultra-Bear: 1.5 GW target (1,500 satellites at 1 MW each) - Scale: 0.01 (1% of baseline)
 */
const DEPLOYMENT_SCALE_BASELINE = 0.64;
const DEPLOYMENT_SCALE_BEAR = 0.01; // Ultra-Bear: 1% of baseline deployment

// ============================================================================
// ANNUAL LAUNCH CAPACITY
// ============================================================================
/**
 * Annual launch capacity (satellites/year)
 * Updated per FIX_150GW_TARGET.md to scale to 150k satellites by 2040 (baseline)
 * Ultra-Bear scenario scales to 1.5 GW (1,500 satellites) using 0.01 scale factor
 * 
 * @param yearOffset Years since start (t - startYear)
 * @param scenarioMode Optional scenario mode to apply scenario-specific scaling
 */
export function getAnnualLaunchCapacity(yearOffset: number, scenarioMode?: string): number {
  const year = 2025 + yearOffset;
  
  // Base deployment curve (before scaling)
  const BASE_DEPLOYMENT_CURVE: Record<number, number> = {
    2025: 1000,
    2027: 5000,
    2030: 15000,
    2033: 25000,
    2036: 30000,
    2040: 35000,
  };
  
  // Determine scale factor based on scenario
  // Ultra-Bear gets 1% of baseline deployment (0.01 scale)
  const isBear = scenarioMode && (scenarioMode.toLowerCase().includes("bear") || scenarioMode === "ORBITAL_BEAR");
  const deploymentScale = isBear ? DEPLOYMENT_SCALE_BEAR : DEPLOYMENT_SCALE_BASELINE;
  
  // Apply deployment scale
  const DEPLOYMENT_CURVE: Record<number, number> = {
    2025: Math.round(BASE_DEPLOYMENT_CURVE[2025] * deploymentScale),
    2027: Math.round(BASE_DEPLOYMENT_CURVE[2027] * deploymentScale),
    2030: Math.round(BASE_DEPLOYMENT_CURVE[2030] * deploymentScale),
    2033: Math.round(BASE_DEPLOYMENT_CURVE[2033] * deploymentScale),
    2036: Math.round(BASE_DEPLOYMENT_CURVE[2036] * deploymentScale),
    2040: Math.round(BASE_DEPLOYMENT_CURVE[2040] * deploymentScale),
  };
  
  // If exact year match, use that value
  if (DEPLOYMENT_CURVE[year]) {
    return DEPLOYMENT_CURVE[year];
  }
  
  // Find surrounding years for interpolation
  const years = Object.keys(DEPLOYMENT_CURVE).map(Number).sort((a, b) => a - b);
  
  if (year <= years[0]) return DEPLOYMENT_CURVE[years[0]];
  if (year >= years[years.length - 1]) return DEPLOYMENT_CURVE[years[years.length - 1]];
  
  let lowerYear = years[0];
  let upperYear = years[years.length - 1];
  
  for (let i = 0; i < years.length - 1; i++) {
    if (year >= years[i] && year <= years[i + 1]) {
      lowerYear = years[i];
      upperYear = years[i + 1];
      break;
    }
  }
  
  // Linear interpolation
  const lower = DEPLOYMENT_CURVE[lowerYear];
  const upper = DEPLOYMENT_CURVE[upperYear];
  const t = (year - lowerYear) / (upperYear - lowerYear);
  
  return Math.round(lower + (upper - lower) * t);
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
 * Uses the power progression curve: 150kW (2025) → 1000kW (2040)
 */
export function getClassAPower(year: number, startYear: number = 2025): number {
  return getPowerFromProgression(year);
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
 * Uses the power progression curve: 150kW (2025) → 1000kW (2040)
 * Class B available from 2030, but uses same power curve
 */
export function getClassBPower(year: number): number {
  return getPowerFromProgression(year);
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

