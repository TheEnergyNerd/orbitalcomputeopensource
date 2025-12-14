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
  classA_compute_raw: number; // PFLOPs (per satellite)
  classB_compute_raw: number; // PFLOPs (per satellite)
  // CRITICAL NOTE: compute_effective_flops is in FLOPS (not PFLOPs)
  // To convert to PFLOPs: divide by 1e15
  // compute_effective_flops should always be <= compute_raw_flops (in same units)
  //
  // Unit clarification:
  // - compute_raw_flops: Total raw compute in FLOPS (not PFLOPs, despite "raw" name)
  // - compute_effective_flops: Effective compute in FLOPS (thermal/backhaul limited)
  // - compute_exportable_flops: Exportable compute in FLOPS (backhaul limited)
  // - classA_compute_raw, classB_compute_raw: Per-satellite compute in PFLOPs
  // All "flops" fields are in FLOPS (1e15 FLOPS = 1 PFLOP)
  classA_power_kw: number;
  classB_power_kw: number;
  
  // --- Backhaul Reality ---
  backhaul_bandwidth_total: number; // Gbps
  backhaul_bandwidth_used: number; // Gbps
  backhaul_bw_per_PFLOP: number; // Gbps per PFLOP
  // REMOVED: utilization_backhaul_raw (fake utilization field)
  
  // --- Autonomy & Maintenance Reality ---
  maintenance_debt: number; // cumulative unrecovered failures
  failures_unrecovered: number; // this year's unrecovered failures
  recovery_success_rate: number; // What % of failures get fixed (0-1)
  survival_fraction: number; // same as utilization_autonomy, for clarity
  
  // --- Thermal Reality ---
  electrical_efficiency: number; // 0-1
  radiator_kw_per_m2: number; // kW per square meter
  // REMOVED: utilization_heat_raw (fake utilization field)
  
  // --- Dynamic Thermal Integration ---
  temp_core_C: number; // Core temperature in Celsius
  temp_radiator_C: number; // Radiator temperature in Celsius
  thermal_mass_J_per_C: number; // Thermal mass
  heatGen_kw: number; // Heat generation
  heatReject_kw: number; // Heat rejection
  net_heat_flow_kw: number; // Net heat flow
  active_cooling_kw: number; // Active cooling power
  thermal_drift_C_per_hr: number; // Temperature drift rate
  eclipse_fraction: number; // Fraction of orbit in eclipse
  shadowing_loss: number; // Shadowing loss
  
  // --- Utilization Metrics (per deployment card UI requirement) ---
  power_utilization_percent: number;
  radiator_utilization_percent: number;
  backhaul_utilization_percent: number;
  manufacturing_utilization_percent: number;
  maintenance_utilization_percent: number;
  
  // --- Sustained Compute ---
  sustained_compute_flops: number; // Sustained compute ceiling
  compute_exportable_flops: number; // Exportable compute (min of effective and backhaul)
  
  // --- Maintenance Debt ---
  global_efficiency: number; // Global efficiency multiplier
  
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
  carbon_mix: number; // Weighted average carbon (ground + orbit)
  raw_carbon_mix?: number; // Raw (unclamped) carbon mix
  cumulativeOrbitalCarbonKg?: number; // Cumulative orbital carbon (kg)
  cumulativeOrbitEnergyTwh?: number; // Cumulative orbit energy served (TWh)
  
  cost_orbit: number; // $ per compute unit
  cost_ground: number; // $ per compute unit
  cost_delta: number; // orbit - ground
  cost_crossover_triggered: boolean;
  
  // --- ECONOMICS (unified debug output) ---
  cost_per_compute_ground: number; // $ per compute unit (ground)
  cost_per_compute_orbit: number; // $ per compute unit (orbit)
  cost_per_compute_mix: number; // $ per compute unit (mixed)
  raw_cost_per_compute_mix?: number; // Raw (unclamped) cost per compute mix
  annual_opex_ground: number; // $ per year (ground)
  annual_opex_ground_all_ground?: number; // $ per year (all-ground baseline)
  annual_opex_orbit: number; // $ per year (orbit)
  annual_opex_mix: number; // $ per year (mixed)
  raw_annual_opex_mix?: number; // Raw (unclamped) annual OPEX mix
  
  // --- LATENCY (unified debug output) ---
  latency_ground_ms: number; // ms (ground)
  latency_orbit_ms: number; // ms (orbit)
  latency_mix_ms: number; // ms (mixed)
  
  // --- COMPUTE (unified debug output) ---
  // compute_raw_flops, compute_effective_flops, compute_exportable_flops, sustained_compute_flops already exist
  // classA_compute_flops, classB_compute_flops already exist
  
  // --- POWER (unified debug output) ---
  // power_total_kw, power_utilization_percent already exist
  
  // --- THERMAL (unified debug output) ---
  // temp_core_C, temp_radiator_C, net_heat_flow_kw, radiator_utilization_percent, active_cooling_kw already exist
  
  // --- BACKHAUL (unified debug output) ---
  backhaul_capacity_tbps: number; // TBps capacity
  backhaul_used_tbps: number; // TBps used
  // backhaul_utilization_percent already exists
  
  // --- MAINTENANCE (unified debug output) ---
  // maintenance_capacity_pods, maintenance_utilization_percent, failures_unrecovered, survival_fraction already exist
  maintenance_used_pods: number; // Pods currently in maintenance
  
  // --- SOLAR (unified debug output) ---
  ground_full_power_uptime_percent: number; // % time at full power (ground solar)
  solar_plus_storage_uptime_percent: number; // % time at full power (solar + storage)
  space_solar_uptime_percent: number; // % time at full power (space-based solar)
  
  // --- SCENARIO DIAGNOSTICS (3) Make the "why" explicit ---
  scenario_mode?: "BASELINE" | "ORBITAL_BULL" | "ORBITAL_BEAR";
  scenarioKind?: "bear" | "baseline" | "bull"; // For debugging
  launch_cost_per_kg?: number; // $/kg (scenario-dependent)
  tech_progress_factor?: number; // Tech progress multiplier
  launchCostDeclineFactor?: number; // Launch cost decline factor
  demandGrowthFactor?: number; // Demand growth factor
  computePerKwGrowth?: number; // Compute-per-kW growth rate (for frontier shape)
  powerGrowthPerYear?: number; // Power growth rate per year (for frontier shape)
  failure_rate_effective?: number; // Effective failure rate after thermal, etc
  orbit_carbon_intensity?: number; // kg CO2/TWh
  annual_carbon_ground_all_ground?: number; // Annual total (kg CO2)
  annual_carbon_ground?: number; // Annual ground carbon in mix (kg CO2)
  annual_carbon_orbit?: number; // Annual orbit carbon in mix (kg CO2)
  annual_carbon_mix?: number; // Annual total (kg CO2)
  launchCarbonKgThisYear?: number; // Carbon from launches this year
  totalOrbitalCarbonKgThisYear?: number; // Total orbital carbon this year
  orbitEnergyServedTwhThisYear?: number; // Energy served by orbit this year
  orbit_cost_per_compute?: number; // $/PFLOP (raw value)
  orbit_cost_per_compute_display?: number; // $/PFLOP (display/clamped value)
  cumulativeOrbitalCostUSD?: number; // Cumulative orbital cost
  cumulativeExportedPFLOPs?: number; // Cumulative exported compute
  exportedPFLOPsThisYear?: number; // Exported compute this year
  launchMassThisYearKg?: number; // Launch mass this year
  launchCostThisYearUSD?: number; // Launch cost this year
  totalOrbitalCostThisYearUSD?: number; // Total orbital cost this year
  totalRadiatorMassKg?: number; // Total radiator mass (for previous year comparison)
  orbit_compute_share?: number; // Patch 3: Actual orbit compute share (0-1) - after ramp cap
  orbit_compute_share_physical?: number; // Physical share before ramp cap
  orbit_share_ramp_cap?: number; // Ramp cap applied to orbit share
  orbit_energy_share_twh?: number; // Patch 3: Orbit energy served in TWh (actual value, not fraction)
  orbitEnergyServedTwh?: number; // For debugging (alias)
  ground_compute_share?: number; // Ground compute share (0-1)
  baseDemandPFLOPs?: number; // Baseline demand in PFLOPs
  totalDemandPFLOPs?: number; // Total demand in PFLOPs (with growth)
  compute_exportable_PFLOPs?: number; // Exportable compute in PFLOPs (explicit naming)
  baseDemandTWh?: number; // Growing energy demand (TWh)
  totalOrbitalCostUSD?: number; // Total orbital capex (for debugging)
  orbital_annualized_cost_usd?: number; // Annualized orbital cost (for debugging)
  totalOrbitalCarbonKg?: number; // Total orbital carbon for debugging
  // Physics layer fields
  bus_total_mass_kg?: number;
  bus_silicon_mass_kg?: number;
  bus_radiator_mass_kg?: number;
  bus_solar_mass_kg?: number;
  bus_structure_mass_kg?: number;
  bus_shielding_mass_kg?: number;
  bus_power_electronics_mass_kg?: number;
  bus_avionics_mass_kg?: number; // CRITICAL FIX: Add missing mass components (per audit C1)
  bus_battery_mass_kg?: number;
  bus_adcs_mass_kg?: number;
  bus_propulsion_mass_kg?: number;
  bus_other_mass_kg?: number; // CRITICAL: Accounts for 2.6 kg (18%) gap - wiring, thermal hardware, brackets, etc.
  bus_power_kw?: number;
  bus_compute_tflops_nominal?: number;
  bus_compute_tflops_derated?: number;
  bus_availability?: number;
  fleet_total_mass_kg?: number;
  fleet_total_compute_tflops_derated?: number;
  // --- CONGESTION METRICS ---
  congestion_shell_utilization?: number;        // % of shell capacity used
  congestion_conjunction_rate?: number;         // Maneuvers fleet-wide
  congestion_debris_count?: number;            // Trackable debris objects
  congestion_collision_risk?: number;           // P(at least one collision)
  congestion_thermal_penalty?: number;           // Efficiency loss from clustering
  congestion_cost_annual?: number;               // $ cost of congestion
  // --- MULTI-SHELL CAPACITY ---
  shell_utilization_by_altitude?: Record<string, number>; // Utilization per shell
  orbital_power_total_gw?: number;              // Total orbital power in GW
  shell_power_breakdown?: Array<{ shell: string; powerGW: number; sats: number }>; // Power by shell
  // --- BATTERY METRICS ---
  battery_density_wh_per_kg?: number;          // Current battery density
  battery_cost_usd_per_kwh?: number;           // Current battery cost
  battery_mass_per_sat_kg?: number;            // Battery mass per satellite
  battery_cost_per_sat_usd?: number;           // Battery cost per satellite
  eclipse_tolerance_minutes?: number;           // Eclipse duration tolerance
}

export type ScenarioKey = 'BASELINE' | 'ORBITAL_BEAR' | 'ORBITAL_BULL';

export interface DebugState {
  perScenario: Record<ScenarioKey, Record<number, DebugStateEntry>>;
  // Legacy flat structure for backward compatibility (deprecated, use perScenario)
  [key: string]: DebugStateEntry | Record<ScenarioKey, Record<number, DebugStateEntry>> | Array<{
    year: number;
    error: string;
    values: Record<string, any>;
  }> | undefined;
}

// Global debug state - structured by scenario
let debugState: DebugState = {
  perScenario: {
    BASELINE: {},
    ORBITAL_BEAR: {},
    ORBITAL_BULL: {},
  },
};

/**
 * Get scenario key from scenario mode string
 */
function getScenarioKey(scenarioMode?: string): ScenarioKey {
  if (scenarioMode === 'ORBITAL_BEAR') return 'ORBITAL_BEAR';
  if (scenarioMode === 'ORBITAL_BULL') return 'ORBITAL_BULL';
  return 'BASELINE'; // Default to BASELINE
}

/**
 * Get debug state key for a year and scenario (legacy, for backward compatibility)
 */
function getDebugStateKey(year: number, scenarioMode?: string): string {
  const scenarioKey = getScenarioKey(scenarioMode);
  return `${year}_${scenarioKey}`;
}

/**
 * Get the current debug state
 */
export function getDebugState(): DebugState {
  return debugState;
}

/**
 * Convert scenarioMode string to ScenarioKey
 */
export function scenarioModeToKey(scenarioMode?: string): ScenarioKey {
  if (scenarioMode === 'ORBITAL_BEAR') return 'ORBITAL_BEAR';
  if (scenarioMode === 'ORBITAL_BULL') return 'ORBITAL_BULL';
  return 'BASELINE';
}

/**
 * Get all entries for a specific scenario
 */
export function getDebugStateEntries(scenarioKey: ScenarioKey): DebugStateEntry[] {
  const perYear = debugState.perScenario[scenarioKey] || {};
  return Object.values(perYear).filter((entry): entry is DebugStateEntry => 
    typeof entry === 'object' && entry !== null && 'year' in entry && typeof entry.year === 'number'
  );
}

/**
 * Clear debug state (all scenarios)
 */
export function clearDebugState(): void {
  debugState = {
    perScenario: {
      BASELINE: {},
      ORBITAL_BEAR: {},
      ORBITAL_BULL: {},
    },
  };
}

/**
 * Clear debug state for a specific scenario
 */
export function clearDebugStateForScenario(scenarioMode: string): void {
  const scenarioKey = getScenarioKey(scenarioMode);
  debugState.perScenario[scenarioKey] = {};
  
  // Also clear legacy flat keys for backward compatibility
  const keysToDelete: string[] = [];
  for (const key in debugState) {
    if (key !== 'perScenario' && key.endsWith(`_${scenarioKey}`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => delete debugState[key]);
}

/**
 * Add a debug state entry for a year and scenario
 */
export function addDebugStateEntry(entry: DebugStateEntry): void {
  const scenarioKey = getScenarioKey(entry.scenario_mode);
  
  // Store in new perScenario structure
  if (!debugState.perScenario[scenarioKey]) {
    debugState.perScenario[scenarioKey] = {};
  }
  debugState.perScenario[scenarioKey][entry.year] = entry;
  
  // Also store in legacy flat structure for backward compatibility
  const key = getDebugStateKey(entry.year, entry.scenario_mode);
  debugState[key] = entry;
}

/**
 * Get debug state entry for a specific year and scenario
 */
export function getDebugStateEntry(year: number, scenarioMode?: string): DebugStateEntry | undefined {
  const scenarioKey = getScenarioKey(scenarioMode);
  
  // Try new perScenario structure first
  if (debugState.perScenario[scenarioKey] && debugState.perScenario[scenarioKey][year]) {
    return debugState.perScenario[scenarioKey][year];
  }
  
  // Fall back to legacy flat structure
  const key = getDebugStateKey(year, scenarioMode);
  return debugState[key] as DebugStateEntry | undefined;
}

/**
 * Add an error to debug state
 * NOTE: Errors are now only logged to console, not stored in debug state
 * to prevent giant error arrays from bloating the debug payload
 */
export function addDebugError(
  year: number,
  error: string,
  values: Record<string, any>
): void {
  // Only log to console, don't store in debug state
  console.warn(`[DebugState] Year ${year}: ${error}`, values);
}

/**
 * Validate state for a given year and scenario
 */
export function validateState(year: number, scenarioMode?: string): boolean {
  const entry = getDebugStateEntry(year, scenarioMode);
  if (!entry) {
    // Don't add error to array, just log
    console.warn(`[DebugState] Missing debug state entry for year ${year}, scenario ${scenarioMode || 'BASELINE'}`);
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
export function validateStateAcrossYears(scenarioKey: ScenarioKey = 'BASELINE'): void {
  const perYear = debugState.perScenario[scenarioKey] || {};
  const years = Object.keys(perYear)
    .map(Number)
    .sort((a, b) => a - b);
  
  if (years.length < 6) return; // Need at least 6 years to check patterns
  
  // Check 1: Maintenance never binds (maintenance utilization always < 30% for >5 consecutive years)
  // This indicates maintenance capacity is never a constraint
  // ONLY flag if there are actual failures that should require maintenance
  let consecutiveMaintenanceNeverBinds = 0;
  let maxConsecutiveMaintenanceNeverBinds = 0;
  
  for (const year of years) {
    const entry = perYear[year];
    if (!entry) continue;
    
    // Check if maintenance utilization is consistently very low (< 30%) AND failures equal recoveries
    // AND there are actual failures (not just zero failures = zero recoveries)
    const maintenanceUtilization = entry.maintenance_utilization_percent || 0;
    const failuresEqualRecoveries = Math.abs(entry.satellitesFailed - entry.satellitesRecovered) < 0.1;
    const veryLowUtilization = maintenanceUtilization < 30.0;
    const hasActualFailures = entry.satellitesFailed > 0.1; // At least 0.1 failures (not just rounding)
    const hasFleet = entry.satellitesTotal > 10; // Need a meaningful fleet size
    
    if (failuresEqualRecoveries && veryLowUtilization && hasActualFailures && hasFleet) {
      consecutiveMaintenanceNeverBinds++;
      maxConsecutiveMaintenanceNeverBinds = Math.max(
        maxConsecutiveMaintenanceNeverBinds,
        consecutiveMaintenanceNeverBinds
      );
    } else {
      consecutiveMaintenanceNeverBinds = 0;
    }
  }
  
  // Only flag if: many consecutive years (>5) AND significant failure rate (> 1% of fleet in at least one year)
  const hasSignificantFailures = years.some(year => {
    const entry = perYear[year];
    if (!entry) return false;
    const failureRate = entry.satellitesTotal > 0 ? entry.satellitesFailed / entry.satellitesTotal : 0;
    return failureRate > 0.01; // At least 1% failure rate
  });
  
  // Only flag if: many consecutive years, significant failures, AND fleet is large enough
    // Only log once, not one per year
    if (maxConsecutiveMaintenanceNeverBinds > 5 && hasSignificantFailures) {
      console.warn(
        `[DebugState] ⚠️ Maintenance never binds: utilization < 30% and failures equal recoveries for ${maxConsecutiveMaintenanceNeverBinds} consecutive years (Year ${years[0]}, Scenario ${scenarioKey})`
      );
    }
  
  // Check 2: Backhaul never binds (utilization always 1.0 for >10 years)
  // CRITICAL FIX: Only flag if backhaul is legitimately always the constraint AND compute is being limited
  // If backhaul utilization is high but compute is still growing, it's working as intended
  let consecutiveBackhaulNeverBinds = 0;
  let maxConsecutiveBackhaulNeverBinds = 0;
  
  for (const year of years) {
    const entry = perYear[year];
    if (!entry) continue;
    
    // Only flag if: utilization is 1.0 AND compute is actually being limited by backhaul
    // AND there's a meaningful fleet (not just a few satellites)
    const backhaulAtMax = Math.abs(entry.utilization_backhaul - 1.0) < 0.001;
    const hasMeaningfulFleet = entry.satellitesTotal > 50; // Need substantial fleet
    const computeIsLimited = entry.compute_exportable_flops > 0 && 
      entry.compute_exportable_flops < (entry.compute_raw_flops || 0) * 0.9; // Exportable < 90% of raw
    
    if (backhaulAtMax && hasMeaningfulFleet && computeIsLimited) {
      consecutiveBackhaulNeverBinds++;
      maxConsecutiveBackhaulNeverBinds = Math.max(
        maxConsecutiveBackhaulNeverBinds,
        consecutiveBackhaulNeverBinds
      );
    } else {
      consecutiveBackhaulNeverBinds = 0;
    }
  }
  
    // Only flag if many consecutive years (>20) AND compute is actually being limited
    // This reduces false positives when backhaul is working correctly as a constraint
    // Increased threshold from 15 to 20 to reduce noise for legitimate long-term constraints
    if (maxConsecutiveBackhaulNeverBinds > 20) {
      console.warn(
        `[DebugState] ⚠️ Backhaul never binds: utilization at 1.0 for ${maxConsecutiveBackhaulNeverBinds} consecutive years (Scenario ${scenarioKey})`
      );
    }
}

/**
 * Export debug state as JSON (without errors array)
 */
export function exportDebugData(): void {
  // Export only perScenario, not the errors array
  const exportData = {
    perScenario: debugState.perScenario,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orbital-sim-debug-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Get constraint timeline for a specific scenario
 */
export function getConstraintTimeline(scenarioKey: ScenarioKey = 'BASELINE'): Array<{
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
  
  const perYear = debugState.perScenario[scenarioKey] || {};
  const years = Object.keys(perYear)
    .map(Number)
    .sort((a, b) => a - b);
  
  for (const year of years) {
    const entry = perYear[year];
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

