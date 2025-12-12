import { getDebugStateEntries } from "../debugState";
import type { DebugStateEntry } from "../debugState";
import type { ScenarioKey } from "../debugState";

export interface ConePoint {
  year: number;
  min: number;
  max: number;
  median: number;
}

/**
 * Build cone series from all three scenarios
 * Returns min (bear), max (bull), median (baseline) for each year
 */
export function buildConeSeries(
  field: keyof DebugStateEntry
): ConePoint[] {
  // Get entries from all three scenarios
  const baselineEntries = getDebugStateEntries('BASELINE');
  const bearEntries = getDebugStateEntries('ORBITAL_BEAR');
  const bullEntries = getDebugStateEntries('ORBITAL_BULL');

  // Group by year
  const byYear: Record<number, { 
    baseline?: DebugStateEntry; 
    bear?: DebugStateEntry; 
    bull?: DebugStateEntry 
  }> = {};

  baselineEntries.forEach(entry => {
    if (!byYear[entry.year]) byYear[entry.year] = {};
    byYear[entry.year].baseline = entry;
  });

  bearEntries.forEach(entry => {
    if (!byYear[entry.year]) byYear[entry.year] = {};
    byYear[entry.year].bear = entry;
  });

  bullEntries.forEach(entry => {
    if (!byYear[entry.year]) byYear[entry.year] = {};
    byYear[entry.year].bull = entry;
  });

  // Convert to cone points
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  
  return years.map(year => {
    const yearData = byYear[year];
    const getValue = (entry: DebugStateEntry | undefined): number => {
      if (!entry) return 0;
      const value = entry[field];
      return typeof value === 'number' ? value : 0;
    };

    const baseline = getValue(yearData.baseline);
    const bear = getValue(yearData.bear);
    const bull = getValue(yearData.bull);

    // Sort values: bear is typically lowest, bull is typically highest
    const values = [bear, baseline, bull].sort((a, b) => a - b);
    
    return {
      year,
      min: values[0], // lowest (typically bear)
      max: values[2], // highest (typically bull)
      median: baseline, // middle (baseline)
    };
  });
}

/**
 * Build cone series for cost per compute
 */
export function buildCostConeSeries(): ConePoint[] {
  return buildConeSeries("cost_per_compute_mix");
}

/**
 * Build cone series for annual carbon
 */
export function buildCarbonConeSeries(): ConePoint[] {
  return buildConeSeries("annual_carbon_mix");
}

/**
 * Build cone series for orbit adoption share
 */
export function buildAdoptionConeSeries(): ConePoint[] {
  return buildConeSeries("orbit_compute_share");
}

