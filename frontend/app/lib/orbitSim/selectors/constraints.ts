import { getDebugStateEntries, scenarioModeToKey } from "../debugState";
import type { DebugStateEntry } from "../debugState";

export interface UtilizationPoint {
  year: number;
  heat: number;
  backhaul: number;
  autonomy: number;
}

export interface ReliabilityPoint {
  year: number;
  survivalFraction: number;
}

export interface LaunchMassPoint {
  year: number;
  usedKg: number;
  ceilingKg: number;
}

/**
 * Build utilization series from debug state
 */
export function buildUtilizationSeries(
  scenarioMode?: string
): UtilizationPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    heat: entry.utilization_heat ?? 0,
    backhaul: entry.utilization_backhaul ?? 0,
    autonomy: entry.utilization_autonomy ?? 0,
  }));
}

/**
 * Build reliability series from debug state
 */
export function buildReliabilitySeries(
  scenarioMode?: string
): ReliabilityPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    // Use survival_fraction if available, otherwise fall back to utilization_autonomy (they should be the same)
    survivalFraction: entry.survival_fraction ?? entry.utilization_autonomy ?? 0,
  }));
}

/**
 * Build launch mass series from debug state
 */
export function buildLaunchMassSeries(
  scenarioMode?: string
): LaunchMassPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    usedKg: entry.launchMassThisYearKg ?? 0,
    ceilingKg: entry.launchMassCeiling ?? 0,
  }));
}

