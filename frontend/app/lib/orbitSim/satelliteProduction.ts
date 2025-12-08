/**
 * Satellite Production Law
 * sats_next_year = sats_this_year × launch_multiplier
 * 
 * Conservative: 2×–3×
 * Aggressive: 4×–6×
 */

export type ProductionStrategy = "conservative" | "aggressive";

export interface ProductionMultipliers {
  min: number;
  max: number;
}

export const PRODUCTION_MULTIPLIERS: Record<ProductionStrategy, ProductionMultipliers> = {
  conservative: { min: 2.0, max: 3.0 },
  aggressive: { min: 4.0, max: 6.0 },
};

/**
 * Calculate satellites for next year based on production law
 * sats_next_year = sats_this_year × launch_multiplier
 * 
 * @param satsThisYear - Current number of satellites
 * @param strategy - Production strategy (conservative or aggressive)
 * @param useMax - If true, use max multiplier; if false, use min multiplier
 * @returns Number of satellites next year
 */
export function calculateSatsNextYear(
  satsThisYear: number,
  strategy: ProductionStrategy = "conservative",
  useMax: boolean = false
): number {
  const multipliers = PRODUCTION_MULTIPLIERS[strategy];
  const launchMultiplier = useMax ? multipliers.max : multipliers.min;
  return Math.floor(satsThisYear * launchMultiplier);
}

/**
 * Calculate satellites for multiple years ahead
 * 
 * @param satsThisYear - Starting number of satellites
 * @param years - Number of years to project
 * @param strategy - Production strategy
 * @param useMax - Use max or min multiplier
 * @returns Array of satellite counts for each year
 */
export function projectSatellites(
  satsThisYear: number,
  years: number,
  strategy: ProductionStrategy = "conservative",
  useMax: boolean = false
): number[] {
  const projections: number[] = [satsThisYear];
  let current = satsThisYear;
  
  for (let i = 0; i < years; i++) {
    current = calculateSatsNextYear(current, strategy, useMax);
    projections.push(current);
  }
  
  return projections;
}

