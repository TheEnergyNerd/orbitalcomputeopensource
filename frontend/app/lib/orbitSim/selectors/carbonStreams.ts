// frontend/app/lib/orbitSim/selectors/carbonStreams.ts

import type { DebugStateEntry } from "../debugState";

export interface CarbonStreamPoint {
  year: number;
  groundAll: number; // All-ground emissions (kg CO2)
  orbit: number; // Orbit emissions (kg CO2)
  mix: number; // Mix emissions (kg CO2)
  avoided: number; // Avoided carbon = groundAll - mix (kg CO2)
  cumulativeAvoided: number; // Running total of avoided carbon
}

/**
 * Build carbon stream data for "draining river" visualization
 * Shows ground emissions as a wide river, mix as a narrower band,
 * and avoided carbon as the gap between them
 */
export function buildCarbonStreams(years: DebugStateEntry[]): CarbonStreamPoint[] {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  
  let cumulativeAvoided = 0;
  
  return sorted.map(y => {
    // All-ground emissions (kg CO2)
    const groundAll = (y.annual_carbon_ground_all_ground ?? 0) / 1_000_000; // Convert to millions of kg (kt)
    
    // Orbit emissions (kg CO2)
    const orbit = (y.annual_carbon_orbit ?? 0) / 1_000_000;
    
    // Mix emissions (kg CO2)
    const mix = (y.annual_carbon_mix ?? 0) / 1_000_000;
    
    // Avoided carbon = groundAll - mix
    const avoided = groundAll - mix;
    
    // Cumulative avoided carbon
    cumulativeAvoided += avoided;
    
    return {
      year: y.year,
      groundAll,
      orbit,
      mix,
      avoided,
      cumulativeAvoided,
    };
  });
}


