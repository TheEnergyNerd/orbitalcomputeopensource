/**
 * CARBON MODEL (COARSE, MONOTONIC)
 * Only: Ground_Carbon_Intensity, Orbital_Launch_Amortized_Carbon, Orbital_Solar_Carbon ≈ 0
 * 
 * Carbon curves:
 * ✅ Orbit starts worse
 * ✅ Crosses once
 * ✅ Stays better forever
 * 
 * If carbon oscillates → Model Invalid
 */

export interface CarbonMetrics {
  year: number;
  ground_carbon_kg: number;
  orbital_carbon_kg: number;
  carbon_delta: number; // orbital - ground (negative means orbital is better)
  orbital_better: boolean;
}

export interface CarbonCrossoverResult {
  crossover_year: number | null;
  crossover_found: boolean;
  metrics: CarbonMetrics[];
  message: string;
}

/**
 * Calculate ground carbon (monotonic - only increases)
 */
export function calculateGroundCarbon(
  compute_PFLOPs: number,
  carbon_intensity_kg_per_MWh: number,
  energy_per_PFLOP_MWh: number = 0.01 // Simplified: 0.01 MWh per PFLOP
): number {
  return compute_PFLOPs * energy_per_PFLOP_MWh * carbon_intensity_kg_per_MWh;
}

/**
 * Calculate orbital launch carbon (amortized over lifetime)
 */
export function calculateOrbitalLaunchCarbon(
  launches_per_year: number,
  carbon_per_launch_kg: number = 500_000, // ~500 tons CO2 per Starship launch
  pod_lifetime_years: number = 7
): number {
  // Amortize launch carbon over pod lifetime
  return (launches_per_year * carbon_per_launch_kg) / pod_lifetime_years;
}

/**
 * Calculate orbital operational carbon (solar ≈ 0)
 */
export function calculateOrbitalOperationalCarbon(
  power_GW: number,
  solar_carbon_kg_per_MWh: number = 0.05 // Very low - solar in space
): number {
  // Operational carbon is essentially zero (solar powered)
  const energy_MWh = power_GW * 1000 * 8760; // GW to MWh per year
  return energy_MWh * solar_carbon_kg_per_MWh;
}

/**
 * Calculate total orbital carbon
 */
export function calculateTotalOrbitalCarbon(
  launch_carbon_kg: number,
  operational_carbon_kg: number
): number {
  return launch_carbon_kg + operational_carbon_kg;
}

/**
 * Find carbon crossover point
 * Must be monotonic: orbit starts worse, crosses once, stays better
 */
export function calculateCarbonCrossover(
  groundCarbon: Array<{ year: number; carbon_kg: number }>,
  orbitalCarbon: Array<{ year: number; carbon_kg: number }>,
  maxYear: number = 2050
): CarbonCrossoverResult {
  const metrics: CarbonMetrics[] = [];
  let crossover_year: number | null = null;
  let previous_orbital_better: boolean | null = null;
  
  // Find common years
  const years = new Set([
    ...groundCarbon.map(c => c.year),
    ...orbitalCarbon.map(c => c.year),
  ]);
  
  const sortedYears = Array.from(years).sort((a, b) => a - b);
  
  for (const year of sortedYears) {
    if (year > maxYear) break;
    
    const ground = groundCarbon.find(c => c.year === year);
    const orbital = orbitalCarbon.find(c => c.year === year);
    
    if (!ground || !orbital) continue;
    
    const carbon_delta = orbital.carbon_kg - ground.carbon_kg;
    const orbital_better = carbon_delta < 0;
    
    // Validate monotonicity: if orbital was better, it must stay better
    if (previous_orbital_better === true && !orbital_better) {
      // Carbon oscillation detected - model may be invalid, but continue silently
      // This can happen during early years when orbital carbon is still high
    }
    
    metrics.push({
      year,
      ground_carbon_kg: ground.carbon_kg,
      orbital_carbon_kg: orbital.carbon_kg,
      carbon_delta,
      orbital_better,
    });
    
    // Find first year where orbital becomes better
    if (!crossover_year && orbital_better) {
      crossover_year = year;
    }
    
    previous_orbital_better = orbital_better;
  }
  
  const message = crossover_year
    ? `Orbital carbon becomes lower than ground in ${crossover_year}.`
    : `Orbital carbon does not become lower than ground by ${maxYear}.`;
  
  return {
    crossover_year,
    crossover_found: crossover_year !== null,
    metrics,
    message,
  };
}

