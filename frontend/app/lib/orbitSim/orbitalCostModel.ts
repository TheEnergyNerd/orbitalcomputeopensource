/**
 * ORBITAL COST MODEL (Fixed)
 * Cost per TFLOP schedule:
 * 2025-2028: $10k-$25k per TFLOP
 * 2029-2032: $3k-$10k per TFLOP
 * 2033+: $1k-$5k per TFLOP
 */

export interface CostPerTFLOPCurve {
  year: number;
  cost_per_tflop_usd: number;
}

export const COST_PER_TFLOP: CostPerTFLOPCurve[] = [
  { year: 2025, cost_per_tflop_usd: 25000 }, // $25k/TFLOP (early, conservative)
  { year: 2028, cost_per_tflop_usd: 10000 }, // $10k/TFLOP (2025-2028 range)
  { year: 2030, cost_per_tflop_usd: 10000 }, // $10k/TFLOP (upper bound 2029-2032)
  { year: 2032, cost_per_tflop_usd: 3000 },  // $3k/TFLOP (lower bound 2029-2032)
  { year: 2035, cost_per_tflop_usd: 5000 },  // $5k/TFLOP (upper bound 2033+)
  { year: 2040, cost_per_tflop_usd: 1000 },  // $1k/TFLOP (lower bound 2033+)
];

/**
 * Get cost per TFLOP for a given year (interpolated)
 */
export function getCostPerTFLOP(year: number): number {
  // Find the two points to interpolate between
  let lower = COST_PER_TFLOP[0];
  let upper = COST_PER_TFLOP[COST_PER_TFLOP.length - 1];
  
  for (let i = 0; i < COST_PER_TFLOP.length - 1; i++) {
    if (year >= COST_PER_TFLOP[i].year && year <= COST_PER_TFLOP[i + 1].year) {
      lower = COST_PER_TFLOP[i];
      upper = COST_PER_TFLOP[i + 1];
      break;
    }
  }
  
  // If before first point, use first point
  if (year < lower.year) {
    return lower.cost_per_tflop_usd;
  }
  
  // If after last point, use last point
  if (year > upper.year) {
    return upper.cost_per_tflop_usd;
  }
  
  // Interpolate between lower and upper
  const t = (year - lower.year) / (upper.year - lower.year);
  return lower.cost_per_tflop_usd + (upper.cost_per_tflop_usd - lower.cost_per_tflop_usd) * t;
}

/**
 * Alias for getCostPerTFLOP (for compatibility with existing code)
 */
export function getOrbitalCostPerTFLOP(year: number): number {
  // Find the two points to interpolate between
  let lower = COST_PER_TFLOP[0];
  let upper = COST_PER_TFLOP[COST_PER_TFLOP.length - 1];
  
  for (let i = 0; i < COST_PER_TFLOP.length - 1; i++) {
    if (year >= COST_PER_TFLOP[i].year && year <= COST_PER_TFLOP[i + 1].year) {
      lower = COST_PER_TFLOP[i];
      upper = COST_PER_TFLOP[i + 1];
      break;
    }
  }
  
  // If before first point, use first point
  if (year < lower.year) {
    return lower.cost_per_tflop_usd;
  }
  
  // If after last point, use last point
  if (year > upper.year) {
    return upper.cost_per_tflop_usd;
  }
  
  // Interpolate between lower and upper
  const t = (year - lower.year) / (upper.year - lower.year);
  return lower.cost_per_tflop_usd + (upper.cost_per_tflop_usd - lower.cost_per_tflop_usd) * t;
}

/**
 * Calculate total pod cost from compute
 */
export function calculatePodCostFromCompute(computeTFLOPs: number, year: number): number {
  const costPerTFLOP = getCostPerTFLOP(year);
  return computeTFLOPs * costPerTFLOP;
}

/**
 * ORBITAL OPEX MODEL
 * opex = base_ops + (power_kW × ops_scaler)
 * 
 * base_ops ≈ $10k–$20k
 * ops_scaler ≈ $50–$120 per kW-year
 */

export interface OrbitalOpexParams {
  baseOpsUSD: number;      // $10k–$20k
  opsScalerPerKWYear: number; // $50–$120 per kW-year
}

export const DEFAULT_OPEX_PARAMS: OrbitalOpexParams = {
  baseOpsUSD: 15000,        // $15k (mid-range of $10k–$20k)
  opsScalerPerKWYear: 85,   // $85/kW-year (mid-range of $50–$120)
};

/**
 * Calculate orbital OPEX for a satellite
 * opex = base_ops + (power_kW × ops_scaler)
 * 
 * @param powerKW - Satellite power in kW
 * @param params - OPEX parameters (optional, uses defaults if not provided)
 * @returns Annual OPEX in USD
 */
export function calculateOrbitalOpex(
  powerKW: number,
  params: Partial<OrbitalOpexParams> = {}
): number {
  const { baseOpsUSD, opsScalerPerKWYear } = { ...DEFAULT_OPEX_PARAMS, ...params };
  return baseOpsUSD + (powerKW * opsScalerPerKWYear);
}

/**
 * Calculate total orbital OPEX for multiple satellites
 * 
 * @param satellites - Array of satellite power values in kW
 * @param params - OPEX parameters (optional)
 * @returns Total annual OPEX in USD
 */
export function calculateTotalOrbitalOpex(
  satellites: number[],
  params: Partial<OrbitalOpexParams> = {}
): number {
  return satellites.reduce((total, powerKW) => {
    return total + calculateOrbitalOpex(powerKW, params);
  }, 0);
}


