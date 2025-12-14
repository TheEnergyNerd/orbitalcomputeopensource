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

export interface ShellUtilizationPoint {
  year: number;
  leo340: number;
  leo550: number;
  leo1100: number;
  meo: number;
}

export interface DebrisCollisionPoint {
  year: number;
  debrisCount: number;
  collisionProbability: number;
  conjunctionManeuvers: number;
}

/**
 * Build shell utilization series from debug state
 */
export function buildShellUtilizationSeries(
  scenarioMode?: string
): ShellUtilizationPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => ({
    year: entry.year,
    leo340: (entry.shell_utilization_by_altitude?.LEO_340 || 0) * 100, // Convert to percentage
    leo550: (entry.shell_utilization_by_altitude?.LEO_550 || 0) * 100,
    leo1100: (entry.shell_utilization_by_altitude?.LEO_1100 || 0) * 100,
    meo: ((entry.shell_utilization_by_altitude?.MEO_8000 || 0) + (entry.shell_utilization_by_altitude?.MEO_20000 || 0)) * 100,
  }));
}

/**
 * Build debris and collision risk series from debug state
 */
export function buildDebrisCollisionSeries(
  scenarioMode?: string
): DebrisCollisionPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => {
    // collision_collision_risk should be a probability (0-1), convert to percentage (0-100%)
    // Clamp to 0-100% to prevent display errors (fixes 900,000% bug)
    let collisionProb = entry.congestion_collision_risk || 0;
    if (collisionProb > 1) {
      // Already in percentage, but clamp to 100%
      collisionProb = Math.min(100, collisionProb);
    } else {
      // Convert probability to percentage
      collisionProb = Math.min(100, collisionProb * 100);
    }
    
    return {
      year: entry.year,
      debrisCount: entry.congestion_debris_count || 0,
      collisionProbability: collisionProb,
      conjunctionManeuvers: entry.congestion_conjunction_rate || 0,
    };
  });
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

