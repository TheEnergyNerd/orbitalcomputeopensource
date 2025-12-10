/**
 * Debug State Management
 * 
 * Stores complete internal state for all orbital compute constraints and risk ceilings.
 * Used for debugging, validation, and export.
 */

export type DominantConstraint = "LAUNCH" | "HEAT" | "BACKHAUL" | "AUTONOMY" | "NONE";
export type StrategyMode = "COST" | "LATENCY" | "CARBON" | "BALANCED";

export interface DebugStateEntry {
  year: number;
  
  // Ceilings
  launchMassCeiling: number;
  launchCostCeiling: number;
  heatCeiling: number;
  backhaulCeiling: number;
  autonomyCeiling: number;
  
  // Actual deployed
  satellitesAdded: number;
  satellitesTotal: number;
  satellitesFailed: number;
  satellitesRecovered: number;
  satellitesRetired: number;
  
  // Utilization ceilings
  utilization_heat: number;
  utilization_backhaul: number;
  utilization_autonomy: number;
  utilization_overall: number; // min of the three
  
  // Power + compute
  power_total_kw: number;
  compute_raw_flops: number;
  compute_effective_flops: number;
  
  // Constraints dominant
  dominantConstraint: DominantConstraint;
  
  // Strategy tracking
  strategyActive: StrategyMode;
  strategyHistory: StrategyMode[];
  
  // Thermal parameters
  radiatorArea: number;
  heatGen: number;
  heatReject: number;
  
  // Economic
  launchBudget: number;
  costPerSatellite: number;
  massPerSatellite: number;
  
  // Autonomy
  autonomyLevel: number;
  failureRate: number;
  repairCapacity: number;
  
  // Shell occupancy
  shellOccupancy: {
    LOW: number;
    MID: number;
    HIGH: number;
    SSO: number;
  };
}

export interface DebugState {
  [year: number]: DebugStateEntry;
  errors: Array<{
    year: number;
    error: string;
    values: Record<string, any>;
  }>;
}

// Global debug state
let debugState: DebugState = {
  errors: [],
};

/**
 * Get the current debug state
 */
export function getDebugState(): DebugState {
  return debugState;
}

/**
 * Clear debug state
 */
export function clearDebugState(): void {
  debugState = {
    errors: [],
  };
}

/**
 * Add a debug state entry for a year
 */
export function addDebugStateEntry(entry: DebugStateEntry): void {
  debugState[entry.year] = entry;
}

/**
 * Add an error to debug state
 */
export function addDebugError(
  year: number,
  error: string,
  values: Record<string, any>
): void {
  debugState.errors.push({ year, error, values });
}

/**
 * Validate state for a given year
 */
export function validateState(year: number): boolean {
  const entry = debugState[year];
  if (!entry) {
    addDebugError(year, "Missing debug state entry", {});
    return false;
  }
  
  let isValid = true;
  
  // Check utilization_overall <= 1
  if (entry.utilization_overall > 1) {
    addDebugError(
      year,
      "Utilization > 1",
      { utilization_overall: entry.utilization_overall }
    );
    isValid = false;
  }
  
  // Check compute_effective <= compute_raw
  if (entry.compute_effective_flops > entry.compute_raw_flops) {
    addDebugError(
      year,
      "Effective > raw compute",
      {
        compute_effective_flops: entry.compute_effective_flops,
        compute_raw_flops: entry.compute_raw_flops,
      }
    );
    isValid = false;
  }
  
  // Check non-negative values
  if (entry.satellitesFailed < 0) {
    addDebugError(year, "Negative failures", { satellitesFailed: entry.satellitesFailed });
    isValid = false;
  }
  
  if (entry.satellitesAdded < 0) {
    addDebugError(year, "Negative deployment", { satellitesAdded: entry.satellitesAdded });
    isValid = false;
  }
  
  if (entry.launchMassCeiling < 0) {
    addDebugError(year, "Negative launch ceiling", { launchMassCeiling: entry.launchMassCeiling });
    isValid = false;
  }
  
  // Check dominant constraint is defined
  if (!entry.dominantConstraint || entry.dominantConstraint === "NONE") {
    addDebugError(year, "No dominant constraint", { dominantConstraint: entry.dominantConstraint });
    // This is a warning, not a fatal error
  }
  
  return isValid;
}

/**
 * Export debug state as JSON
 */
export function exportDebugData(): void {
  const blob = new Blob([JSON.stringify(debugState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orbital-sim-debug-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Get constraint timeline
 */
export function getConstraintTimeline(): Array<{
  year: number;
  dominantConstraint: DominantConstraint;
  constraintValues: {
    launch: number;
    heat: number;
    backhaul: number;
    autonomy: number;
  };
}> {
  const timeline: Array<{
    year: number;
    dominantConstraint: DominantConstraint;
    constraintValues: {
      launch: number;
      heat: number;
      backhaul: number;
      autonomy: number;
    };
  }> = [];
  
  const years = Object.keys(debugState)
    .filter(key => key !== "errors")
    .map(Number)
    .sort((a, b) => a - b);
  
  for (const year of years) {
    const entry = debugState[year];
    if (entry) {
      timeline.push({
        year,
        dominantConstraint: entry.dominantConstraint,
        constraintValues: {
          launch: Math.min(entry.launchMassCeiling, entry.launchCostCeiling),
          heat: entry.heatCeiling,
          backhaul: entry.backhaulCeiling,
          autonomy: entry.autonomyCeiling,
        },
      });
    }
  }
  
  return timeline;
}

// Make export function available globally
if (typeof window !== "undefined") {
  (window as any).exportDebugData = exportDebugData;
  (window as any).getDebugState = getDebugState;
}

