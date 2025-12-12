import { getDebugStateEntries, scenarioModeToKey } from "../debugState";

export interface AdoptionPoint {
  year: number;
  orbitShare: number;  // 0–1
  groundShare: number; // 1 - orbitShare
}

/**
 * Build adoption series from debug state
 */
export function buildAdoptionSeries(
  scenarioMode?: string
): AdoptionPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    orbitShare: entry.orbit_compute_share ?? 0,
    groundShare: 1 - (entry.orbit_compute_share ?? 0),
  }));
}

