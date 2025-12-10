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
  
  // --- Class Breakdown ---
  classA_satellites_alive: number;
  classB_satellites_alive: number;
  classA_compute_raw: number; // PFLOPs
  classB_compute_raw: number; // PFLOPs
  classA_power_kw: number;
  classB_power_kw: number;
  
  // --- Backhaul Reality ---
  backhaul_bandwidth_total: number; // Gbps
  backhaul_bandwidth_used: number; // Gbps
  backhaul_bw_per_PFLOP: number; // Gbps per PFLOP
  utilization_backhaul_raw: number; // before clamping
  
  // --- Autonomy & Maintenance Reality ---
  maintenance_debt: number; // cumulative unrecovered failures
  failures_unrecovered: number; // this year's unrecovered failures
  survival_fraction: number; // same as utilization_autonomy, for clarity
  
  // --- Thermal Reality ---
  electrical_efficiency: number; // 0-1
  radiator_kw_per_m2: number; // kW per square meter
  utilization_heat_raw: number; // before min()
  
  // --- Launch Economics ---
  payload_per_launch_tons: number;
  launches_per_year: number;
  cost_per_kg_to_leo: number; // $/kg
  
  // --- Retirement Physics ---
  retirements_by_lifetime: number;
  retirements_by_failure: number;
  
  // --- Strategy Effects ---
  strategy_growth_target: number; // target satellites per year
  strategy_launch_budget_multiplier: number;
  strategy_RnD_autonomy_bias: number;
  strategy_radiator_mass_bias: number;
  
  // --- Carbon & Cost Crossover ---
  carbon_orbit: number; // kg CO2 per compute unit
  carbon_ground: number; // kg CO2 per compute unit
  carbon_delta: number; // orbit - ground
  carbon_crossover_triggered: boolean;
  
  cost_orbit: number; // $ per compute unit
  cost_ground: number; // $ per compute unit
  cost_delta: number; // orbit - ground
  cost_crossover_triggered: boolean;
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
  
  // Check dominant constraint is defined (only warn if we have satellites but no constraint)
  if ((!entry.dominantConstraint || entry.dominantConstraint === "NONE") && entry.satellitesTotal > 0) {
    // Only warn if we have satellites but no constraint identified
    // This can happen in early years before constraints become meaningful
    // Don't add as error, just log as warning
    console.warn(`[DebugState] Year ${year}: No dominant constraint identified (${entry.satellitesTotal} satellites)`);
  }
  
  return isValid;
}

/**
 * Validate state across multiple years for degenerate patterns
 */
export function validateStateAcrossYears(): void {
  const years = Object.keys(debugState)
    .filter(key => key !== "errors")
    .map(Number)
    .sort((a, b) => a - b);
  
  if (years.length < 6) return; // Need at least 6 years to check patterns
  
  // Check 1: Maintenance never binds (failures always equal recoveries for >5 consecutive years)
  let consecutiveMaintenanceNeverBinds = 0;
  let maxConsecutiveMaintenanceNeverBinds = 0;
  
  for (const year of years) {
    const entry = debugState[year];
    if (!entry) continue;
    
    if (entry.satellitesFailed === entry.satellitesRecovered && entry.satellitesTotal > 0) {
      consecutiveMaintenanceNeverBinds++;
      maxConsecutiveMaintenanceNeverBinds = Math.max(
        maxConsecutiveMaintenanceNeverBinds,
        consecutiveMaintenanceNeverBinds
      );
    } else {
      consecutiveMaintenanceNeverBinds = 0;
    }
  }
  
  if (maxConsecutiveMaintenanceNeverBinds > 5) {
    addDebugError(
      years[0],
      `Maintenance never binds — model likely degenerate. Failures equal recoveries for ${maxConsecutiveMaintenanceNeverBinds} consecutive years.`,
      { maxConsecutiveYears: maxConsecutiveMaintenanceNeverBinds }
    );
    console.warn(
      `[DebugState] ⚠️ Maintenance never binds: failures equal recoveries for ${maxConsecutiveMaintenanceNeverBinds} consecutive years`
    );
  }
  
  // Check 2: Backhaul never binds (utilization always 1.0 for >10 years)
  let consecutiveBackhaulNeverBinds = 0;
  let maxConsecutiveBackhaulNeverBinds = 0;
  
  for (const year of years) {
    const entry = debugState[year];
    if (!entry) continue;
    
    if (Math.abs(entry.utilization_backhaul - 1.0) < 0.001 && entry.satellitesTotal > 0) {
      consecutiveBackhaulNeverBinds++;
      maxConsecutiveBackhaulNeverBinds = Math.max(
        maxConsecutiveBackhaulNeverBinds,
        consecutiveBackhaulNeverBinds
      );
    } else {
      consecutiveBackhaulNeverBinds = 0;
    }
  }
  
  if (maxConsecutiveBackhaulNeverBinds > 10) {
    addDebugError(
      years[0],
      `Backhaul never binds — routing model likely incomplete. Utilization at 1.0 for ${maxConsecutiveBackhaulNeverBinds} consecutive years.`,
      { maxConsecutiveYears: maxConsecutiveBackhaulNeverBinds }
    );
    console.warn(
      `[DebugState] ⚠️ Backhaul never binds: utilization at 1.0 for ${maxConsecutiveBackhaulNeverBinds} consecutive years`
    );
  }
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

