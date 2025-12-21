import { getDebugStateEntries } from "../debugState";
import type { DebugStateEntry } from "../debugState";

export type ScenarioKey = "BASELINE" | "ORBITAL_BEAR" | "ORBITAL_BULL";

export interface ScenarioSeriesPoint {
  year: number;
  BASELINE: number;
  ORBITAL_BEAR: number;
  ORBITAL_BULL: number;
}

/**
 * Build scenario series from debug state
 */
function buildScenarioSeries(
  field: keyof DebugStateEntry
): ScenarioSeriesPoint[] {
  // Get entries from all three scenarios
  const baselineEntries = getDebugStateEntries('BASELINE');
  const bearEntries = getDebugStateEntries('ORBITAL_BEAR');
  const bullEntries = getDebugStateEntries('ORBITAL_BULL');

  // Group by year
  const byYear: Record<number, { baseline?: DebugStateEntry; bear?: DebugStateEntry; bull?: DebugStateEntry }> = {};

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

  // Convert to series points
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  
  return years.map(year => {
    const yearData = byYear[year];
    const getValue = (entry: DebugStateEntry | undefined): number => {
      if (!entry) return 0;
      const value = entry[field];
      return typeof value === 'number' ? value : 0;
    };

    return {
      year,
      BASELINE: getValue(yearData.baseline),
      ORBITAL_BEAR: getValue(yearData.bear),
      ORBITAL_BULL: getValue(yearData.bull),
    };
  });
}

export function buildScenarioCostSeries(): ScenarioSeriesPoint[] {
  return buildScenarioSeries("physics_cost_per_pflop_year_mix");
}

export function buildScenarioOpexSeries(): ScenarioSeriesPoint[] {
  return buildScenarioSeries("annual_opex_mix");
}

export function buildScenarioCarbonSeries(): ScenarioSeriesPoint[] {
  return buildScenarioSeries("annual_carbon_mix");
}

export function buildScenarioAdoptionSeries(): ScenarioSeriesPoint[] {
  return buildScenarioSeries("orbit_compute_share");
}

/**
 * Shell occupancy data structure for stacked area chart
 */
export interface ShellOccupancyPoint {
  year: number;
  LOW: number;
  MID: number;
  SSO: number;
}

/**
 * Build shell occupancy series for a specific scenario
 */
export function buildShellOccupancySeries(scenarioKey: ScenarioKey): ShellOccupancyPoint[] {
  const entries = getDebugStateEntries(scenarioKey);
  
  return entries
    .sort((a, b) => a.year - b.year)
    .map(entry => ({
      year: entry.year,
      LOW: entry.shellOccupancy?.LOW ?? 0,
      MID: entry.shellOccupancy?.MID ?? 0,
      SSO: entry.shellOccupancy?.SSO ?? 0,
    }));
}

/**
 * Cost crossover data structure
 */
export interface CostCrossoverPoint {
  year: number;
  cost_orbit: number;
  cost_ground: number;
  crossoverYear?: number; // Year when orbit becomes cheaper
}

/**
 * Build cost crossover series for a specific scenario
 */
export function buildCostCrossoverSeries(scenarioKey: ScenarioKey): CostCrossoverPoint[] {
  const entries = getDebugStateEntries(scenarioKey);
  
  const series = entries
    .sort((a, b) => a.year - b.year)
    .map(entry => ({
      year: entry.year,
      cost_orbit: entry.physics_cost_per_pflop_year_orbit ?? 0,
      cost_ground: entry.physics_cost_per_pflop_year_ground ?? 340,
    }));
  
  // Find crossover year (first year where orbit < ground)
  let crossoverYear: number | undefined;
  for (const point of series) {
    if (point.cost_orbit > 0 && point.cost_orbit < point.cost_ground) {
      crossoverYear = point.year;
      break;
    }
  }
  
  // Add crossover year to all points
  return series.map(point => ({
    ...point,
    crossoverYear,
  }));
}

/**
 * Compute efficiency data structure
 */
export interface ComputeEfficiencyPoint {
  year: number;
  pflopsPerKw: number;
  mooreLawLimit: number;
  h100Baseline: number; // 3 PFLOPS/kW
}

/**
 * Build compute efficiency series for a specific scenario
 */
export function buildComputeEfficiencySeries(scenarioKey: ScenarioKey): ComputeEfficiencyPoint[] {
  const entries = getDebugStateEntries(scenarioKey);
  
  return entries
    .sort((a, b) => a.year - b.year)
    .map(entry => {
      const year = entry.year;
      const computeRawFlops = entry.compute_raw_flops ?? 0;
      const powerKw = entry.power_total_kw ?? 1; // Avoid division by zero
      
      // Calculate PFLOPS/kW: compute_raw_flops is in FLOPS, divide by 1e15 to get PFLOPS
      const pflopsPerKw = powerKw > 0 ? (computeRawFlops / 1e15) / powerKw : 0;
      
      // Moore's Law limit: 3 * 2^((year - 2025) / 2)
      const mooreLawLimit = 3 * Math.pow(2, (year - 2025) / 2);
      
      return {
        year,
        pflopsPerKw,
        mooreLawLimit,
        h100Baseline: 3, // H100 baseline
      };
    });
}

