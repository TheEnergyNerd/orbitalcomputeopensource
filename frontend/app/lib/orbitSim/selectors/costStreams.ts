// frontend/app/lib/orbitSim/selectors/costStreams.ts

import type { DebugStateEntry } from "../debugState";

export interface CostStreamPoint {
  year: number;
  launch: number; // Launch costs (annualized)
  orbitOpex: number; // Orbit operational costs
  groundResidual: number; // Ground portion of mix
  savingsVsAllGround: number; // Negative value = savings
}

/**
 * Build cost stream data for streamgraph visualization
 * Shows cost composition over time with savings vs all-ground
 */
export function buildCostStreams(years: DebugStateEntry[]): CostStreamPoint[] {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  
  return sorted.map(y => {
    // Launch costs (annualized from total orbital cost)
    const launch = (y.launchCostThisYearUSD ?? 0) / 1_000_000; // Convert to millions
    
    // Orbit OPEX (operational costs, excluding launch)
    const orbitOpex = Math.max(0, ((y.annual_opex_orbit ?? 0) - (y.launchCostThisYearUSD ?? 0)) / 1_000_000);
    
    // Ground residual (ground portion of mix)
    const groundResidual = (y.annual_opex_ground ?? 0) / 1_000_000;
    
    // All-ground baseline
    const allGround = (y.annual_opex_ground_all_ground ?? 0) / 1_000_000;
    
    // Mix total
    const mixTotal = (y.annual_opex_mix ?? 0) / 1_000_000;
    
    // Savings vs all-ground (negative = savings)
    const savingsVsAllGround = mixTotal - allGround;
    
    return {
      year: y.year,
      launch,
      orbitOpex,
      groundResidual,
      savingsVsAllGround,
    };
  });
}







