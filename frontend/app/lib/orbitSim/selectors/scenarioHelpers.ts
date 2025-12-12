// frontend/app/lib/orbitSim/selectors/scenarioHelpers.ts

import { getDebugState, getDebugStateEntries, scenarioModeToKey } from "../debugState";
import type { DebugStateEntry, ScenarioKey } from "../debugState";
import type { ScenarioMode } from "../simulationConfig";

/**
 * Get all entries for a specific scenario
 * This is the single source of truth for scenario data access
 */
export function getScenarioSeries(debug: any, scenarioKey: ScenarioKey): DebugStateEntry[] {
  const perScenario = debug?.perScenario?.[scenarioKey];
  if (!perScenario) return [];
  
  // perScenario is an object keyed by year: { "2025": { year: 2025, ... }, ... }
  return Object.values(perScenario)
    .filter((row: any) => typeof row === 'object' && row !== null && typeof row.year === 'number')
    .sort((a: any, b: any) => a.year - b.year) as DebugStateEntry[];
}

/**
 * Get scenario series using scenarioMode (converts to ScenarioKey internally)
 */
export function getScenarioSeriesByMode(debug: any, scenarioMode?: ScenarioMode): DebugStateEntry[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  return getScenarioSeries(debug, scenarioKey);
}

/**
 * Debug helper: Log sample data for each scenario to verify frontend is getting different numbers
 */
export function debugScenarioData(scenarioMode?: ScenarioMode): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return;
  
  const debug = getDebugState();
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const series = getScenarioSeries(debug, scenarioKey);
  
  if (series.length > 0) {
    const first = series[0];
    const last = series[series.length - 1];
    
    console.log(`[DEBUG] Scenario data for ${scenarioKey}:`, {
      scenario: scenarioKey,
      scenarioMode,
      count: series.length,
      first: {
        year: first.year,
        cost_ground: first.cost_per_compute_ground,
        cost_orbit: first.cost_per_compute_orbit,
        cost_mix: first.cost_per_compute_mix,
        carbon_orbit: first.orbit_carbon_intensity ?? 0,
        orbit_share: first.orbit_compute_share,
      },
      last: {
        year: last.year,
        cost_ground: last.cost_per_compute_ground,
        cost_orbit: last.cost_per_compute_orbit,
        cost_mix: last.cost_per_compute_mix,
        carbon_orbit: last.orbit_carbon_intensity ?? 0,
        orbit_share: last.orbit_compute_share,
      },
    });
  } else {
    console.warn(`[DEBUG] No data found for scenario ${scenarioKey}`);
  }
}

