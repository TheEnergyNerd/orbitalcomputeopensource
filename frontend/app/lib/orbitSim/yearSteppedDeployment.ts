/**
 * Year-Stepped Deployment Model
 * 
 * Implements deterministic, strategy-aware satellite growth without time-travel.
 * Each year's deployment depends only on:
 * - Previous year's satellite counts
 * - Current year's strategy
 * - Annual launch capacity
 */

import {
  getAnnualLaunchCapacity,
  STRATEGY_GROWTH_MULTIPLIERS,
  getClassBShare,
  getClassACompute,
  getClassAPower,
  getClassBCompute,
  getClassBPower,
  getOrbitAllocation,
  calculateRetirements,
  type StrategyMode,
  type SatelliteClass,
  SAT_A_LIFETIME_Y,
  SAT_B_LIFETIME_Y,
} from "./satelliteClasses";
import {
  calculateLaunchConstraints,
  calculateConstrainedEffectiveCompute,
  type EffectiveComputeResult,
  calculateSatelliteMass,
  calculateCostPerSatellite,
  calculateMaxHeatRejection,
  calculateHeatGeneration,
  calculateAutonomyLevel,
  calculateRepairCapacity,
  calculateLaunchCostBudget,
} from "./deploymentConstraints";
import {
  initializeThermalState,
  updateThermalState,
  type ThermalState,
} from "./thermalIntegration";
import {
  addDebugStateEntry,
  validateState,
  validateStateAcrossYears,
  getDebugState,
  type DebugStateEntry,
} from "./debugState";

export interface YearDeploymentState {
  year: number;
  strategy: StrategyMode;
  
  // Class A counts
  S_A: number;
  S_A_lowLEO: number;
  S_A_midLEO: number;
  S_A_sunSync: number;
  
  // Class B counts (always sun-sync)
  S_B: number;
  
  // Deployment history (for retirement calculations)
  deployedByYear_A: Map<number, number>;
  deployedByYear_B: Map<number, number>;
  
  // Aggregate metrics
  totalComputePFLOPs: number;
  totalPowerMW: number;
  
  // Thermal state (persists across years)
  thermalState?: import("./thermalIntegration").ThermalState;
}

export interface YearDeploymentResult {
  year: number;
  strategy: StrategyMode;
  
  // New deployments this year
  newA: number;
  newB: number;
  newA_lowLEO: number;
  newA_midLEO: number;
  newA_sunSync: number;
  
  // Total counts after deployment and retirements
  S_A: number;
  S_B: number;
  S_A_lowLEO: number;
  S_A_midLEO: number;
  S_A_sunSync: number;
  S_B_sunSync: number;
  
  // Aggregate metrics
  totalComputePFLOPs: number;
  totalPowerMW: number;
  
  // Effective compute (after constraints)
  effectiveComputePFLOPs: number;
  heatUtilization: number;
  survivalFraction: number;
  
  // Per-satellite metrics
  computePerA: number;
  powerPerA: number;
  computePerB: number;
  powerPerB: number;
  
  // Constraint information
  constraints?: {
    launch: { massLimited: number; costLimited: number; allowed: number };
    heat: { utilizationMax: number; heatLimited: boolean };
    maintenance: { failureRate: number; failuresThisYear: number; recoverable: number; permanentLoss: number; survivalFraction: number };
  };
  
  // Thermal state (for persistence across years)
  thermalState?: ThermalState;
}

const START_YEAR = 2025;

/**
 * Calculate deployment for a single year
 * 
 * @param state Previous year's state
 * @param strategy Strategy for this year (can change mid-run)
 */
export function calculateYearDeployment(
  state: YearDeploymentState,
  strategy: StrategyMode
): YearDeploymentResult {
  const { year, S_A, S_B, deployedByYear_A, deployedByYear_B } = state;
  
  // 1. Calculate annual launch capacity
  const yearOffset = year - START_YEAR;
  const baseLaunches = getAnnualLaunchCapacity(yearOffset);
  
  // 2. Apply strategy growth multiplier
  const growthMultiplier = STRATEGY_GROWTH_MULTIPLIERS[strategy];
  const totalLaunches = Math.round(baseLaunches * growthMultiplier);
  
  // 3. Split between Class A and Class B (before constraints)
  const fracB = getClassBShare(strategy, year);
  const newB_target = Math.round(totalLaunches * fracB);
  const newA_target = totalLaunches - newB_target;
  
  // 3.5. APPLY LAUNCH CONSTRAINTS (mass and cost gating)
  const launchConstraints = calculateLaunchConstraints(
    totalLaunches,
    newA_target,
    newB_target,
    year,
    strategy
  );
  
  // Apply launch-gated limits proportionally to A and B
  const totalTarget = newA_target + newB_target;
  const allowedTotal = launchConstraints.allowed;
  const scaleFactor = totalTarget > 0 ? allowedTotal / totalTarget : 0;
  
  const newA = Math.round(newA_target * scaleFactor);
  const newB = Math.round(newB_target * scaleFactor);
  
  // 4. Distribute Class A across orbits based on strategy
  const orbitAlloc = getOrbitAllocation(strategy);
  const newA_lowLEO = Math.round(newA * orbitAlloc.lowLEO);
  const newA_midLEO = Math.round(newA * orbitAlloc.midLEO);
  const newA_sunSync = newA - newA_lowLEO - newA_midLEO; // Remainder to ensure exact count
  
  // 5. Calculate retirements
  const retiredA = calculateRetirements(deployedByYear_A, year, SAT_A_LIFETIME_Y);
  const retiredB = calculateRetirements(deployedByYear_B, year, SAT_B_LIFETIME_Y);
  
  // 6. Update counts (new - retired)
  const S_A_new = Math.max(0, S_A + newA - retiredA);
  const S_B_new = Math.max(0, S_B + newB - retiredB);
  
  // Update orbit-specific counts (simplified: assume retirements are proportional)
  const S_A_total_prev = state.S_A_lowLEO + state.S_A_midLEO + state.S_A_sunSync;
  const S_A_lowLEO_new = S_A_total_prev > 0
    ? Math.max(0, state.S_A_lowLEO + newA_lowLEO - Math.round(retiredA * (state.S_A_lowLEO / S_A_total_prev)))
    : newA_lowLEO;
  const S_A_midLEO_new = S_A_total_prev > 0
    ? Math.max(0, state.S_A_midLEO + newA_midLEO - Math.round(retiredA * (state.S_A_midLEO / S_A_total_prev)))
    : newA_midLEO;
  const S_A_sunSync_new = S_A_new - S_A_lowLEO_new - S_A_midLEO_new;
  const S_B_sunSync_new = S_B_new; // All Class B are sun-sync
  
  // 7. Calculate tech curves
  const computePerA = getClassACompute(year);
  const powerPerA = getClassAPower(year);
  const computePerB = getClassBCompute(year);
  const powerPerB = getClassBPower(year);
  
  // 8. Calculate raw aggregate metrics (before constraints)
  const totalComputePFLOPs = 
    S_A_new * computePerA + 
    S_B_new * computePerB;
  const totalPowerMW = 
    (S_A_new * powerPerA + S_B_new * powerPerB) / 1000;
  
  // 8.5. DYNAMIC THERMAL INTEGRATION (replaces static heat ceilings)
  // Get radiator areas (varies by class and strategy)
  const radiatorAreaPerA = strategy === "CARBON" ? 6.5 : strategy === "COST" ? 4.5 : 5.0;
  const radiatorAreaPerB = strategy === "CARBON" ? 15.6 : strategy === "COST" ? 10.8 : 12.0;
  
  // Initialize or update thermal state from current satellite configuration
  let thermalState: ThermalState;
  if (state.thermalState && year > 2025) {
    // Update existing thermal state with new satellite counts
    thermalState = {
      ...state.thermalState,
      power_total_kw: (S_A_new * powerPerA + S_B_new * powerPerB),
      compute_raw_flops: totalComputePFLOPs * 1e15,
      radiatorArea_m2: (S_A_new * radiatorAreaPerA + S_B_new * radiatorAreaPerB),
      backhaul_tbps: (S_A_new + S_B_new) * 0.5, // Update backhaul capacity
      manufacturing_rate_pods_per_year: Math.max(100, (S_A_new + S_B_new) * 0.1),
      maintenance_capacity_pods: Math.max(50, (S_A_new + S_B_new) * 0.05),
    };
  } else {
    // Initialize new thermal state
    thermalState = initializeThermalState(
      S_A_new,
      S_B_new,
      powerPerA,
      powerPerB,
      computePerA,
      computePerB,
      radiatorAreaPerA,
      radiatorAreaPerB,
      year
    );
  }
  
  // Update thermal state for this year (8760 hours = 1 year)
  const updatedThermalState = updateThermalState(thermalState, 8760, year);
  
  // Use thermal-integrated effective compute (already includes throttling)
  const thermalEffectiveComputePFLOPs = updatedThermalState.compute_exportable_flops / 1e15;
  
  // 8.6. LEGACY CONSTRAINT CALCULATION (for backward compatibility with charts)
  // This will be phased out but kept for now to maintain existing visualizations
  const effectiveComputeResult = calculateConstrainedEffectiveCompute(
    totalComputePFLOPs,
    S_A_new,
    S_B_new,
    powerPerA,
    powerPerB,
    year,
    strategy,
    totalLaunches,
    newA,
    newB
  );
  
  // Override effective compute with thermal-integrated value
  const finalEffectiveCompute = thermalEffectiveComputePFLOPs;
  
  // 9. Collect debug state
  const massA = calculateSatelliteMass("A", year, strategy);
  const massB = calculateSatelliteMass("B", year, strategy);
  const costA = calculateCostPerSatellite("A", year, strategy);
  const costB = calculateCostPerSatellite("B", year, strategy);
  const heatRejectA = calculateMaxHeatRejection("A", powerPerA, strategy, year);
  const heatRejectB = calculateMaxHeatRejection("B", powerPerB, strategy, year);
  const heatGenA = calculateHeatGeneration(powerPerA);
  const heatGenB = calculateHeatGeneration(powerPerB);
  const autonomyLevel = calculateAutonomyLevel(year, strategy);
  const repairCapacity = calculateRepairCapacity(S_A_new + S_B_new, year, strategy);
  
  // Calculate additional values for new debug fields
  const classA_compute_raw = S_A_new * computePerA; // PFLOPs
  const classB_compute_raw = S_B_new * computePerB; // PFLOPs
  const classA_power_kw = S_A_new * powerPerA;
  const classB_power_kw = S_B_new * powerPerB;
  
  // Backhaul calculations (simplified model - needs enhancement)
  // Assume each PFLOP requires ~10 Gbps backhaul bandwidth
  const backhaul_bw_per_PFLOP = 10; // Gbps per PFLOP
  const backhaul_bandwidth_used = totalComputePFLOPs * backhaul_bw_per_PFLOP; // Gbps
  // Backhaul capacity scales with satellite count and orbit diversity
  // LEO-HIGH provides relay backbone, so capacity is limited without it
  const backhaul_capacity_factor = S_A_lowLEO_new > 0 && S_A_midLEO_new > 0 ? 1.0 : 0.7; // Reduced if no relay backbone
  const backhaul_bandwidth_total = (S_A_new + S_B_new) * 50 * backhaul_capacity_factor; // 50 Gbps per sat, scaled
  const utilization_backhaul_raw = backhaul_bandwidth_total > 0 
    ? Math.min(1.0, backhaul_bandwidth_used / backhaul_bandwidth_total)
    : 1.0;
  
  // Maintenance debt (cumulative unrecovered failures)
  const previousEntry = year > 2025 ? (getDebugState()[year - 1] as DebugStateEntry | undefined) : undefined;
  const maintenance_debt_prev = previousEntry?.maintenance_debt || 0;
  const failures_unrecovered = Math.max(0, 
    effectiveComputeResult.constraints.maintenance.failuresThisYear - 
    effectiveComputeResult.constraints.maintenance.recoverable
  );
  const maintenance_debt = maintenance_debt_prev + failures_unrecovered;
  
  // Thermal reality (from dynamic thermal integration)
  const electrical_efficiency = 0.85; // 85% efficiency (15% waste heat)
  const avgRadiatorArea = updatedThermalState.radiatorArea_m2 / (S_A_new + S_B_new || 1);
  const radiator_kw_per_m2 = avgRadiatorArea > 0 ? updatedThermalState.heatReject_kw / updatedThermalState.radiatorArea_m2 : 0;
  const utilization_heat_raw = updatedThermalState.heatGen_kw > 0
    ? updatedThermalState.heatReject_kw / updatedThermalState.heatGen_kw
    : 1.0;
  
  // Launch economics
  const payload_per_launch_tons = 100; // Starship capacity
  const launches_per_year = totalLaunches;
  const launchBudgetM = calculateLaunchCostBudget(year, strategy, totalLaunches);
  const totalMassT = launches_per_year * payload_per_launch_tons;
  const cost_per_kg_to_leo = totalMassT > 0 ? (launchBudgetM * 1e6) / (totalMassT * 1000) : 500; // $/kg
  
  // Retirement physics
  const retirements_by_lifetime = retiredA + retiredB; // All retirements are by lifetime currently
  const retirements_by_failure = 0; // Not currently tracked separately
  
  // Strategy effects
  const strategy_growth_target = totalLaunches; // Target satellites per year
  const strategy_launch_budget_multipliers: Record<StrategyMode, number> = {
    COST: 1.5,
    LATENCY: 1.1,
    CARBON: 1.2,
    BALANCED: 1.3,
  };
  const strategy_launch_budget_multiplier = strategy_launch_budget_multipliers[strategy];
  const strategy_RnD_autonomy_rates: Record<StrategyMode, number> = {
    COST: 0.05,
    LATENCY: 0.08,
    CARBON: 0.10,
    BALANCED: 0.07,
  };
  const strategy_RnD_autonomy_bias = strategy_RnD_autonomy_rates[strategy];
  const strategy_radiator_mass_biases: Record<StrategyMode, number> = {
    COST: 0.9,
    LATENCY: 0.8,
    CARBON: 1.2,
    BALANCED: 1.0,
  };
  const strategy_radiator_mass_bias = strategy_radiator_mass_biases[strategy];
  
  // Carbon & Cost crossover (MUST depend on launch mass, replacement cadence, radiator mass)
  // NOT static constants
  
  // Calculate launch mass per year
  const totalLaunchMassT = launches_per_year * payload_per_launch_tons;
  const totalLaunchMassKg = totalLaunchMassT * 1000;
  
  // Calculate replacement cadence (satellites replaced per year)
  const replacementCadence = retiredA + retiredB + effectiveComputeResult.constraints.maintenance.permanentLoss;
  const replacementRate = (S_A_new + S_B_new) > 0 ? replacementCadence / (S_A_new + S_B_new) : 0;
  
  // Calculate total radiator mass (from thermal state)
  const avgRadiatorMassPerSat = (massA * 0.2 + massB * 0.4) / 2; // Radiator is ~20% of Class A mass, ~40% of Class B
  const totalRadiatorMassKg = (S_A_new * massA * 0.2 + S_B_new * massB * 0.4) * 1000; // Convert tons to kg
  
  // Carbon calculation: depends on launch mass and replacement cadence
  // Launch carbon: ~300 kg CO2 per kg to LEO (includes manufacturing)
  const launchCarbonKg = totalLaunchMassKg * 300;
  // Replacement carbon: higher replacement cadence = more carbon
  const replacementCarbonKg = replacementCadence * avgRadiatorMassPerSat * 1000 * 300; // Carbon per replacement
  const totalOrbitalCarbonKg = launchCarbonKg + replacementCarbonKg;
  
  // Ground carbon: ~400 kg CO2 per TWh (constant)
  const groundCarbonPerTwh = 400;
  const totalPowerTwh = (S_A_new * powerPerA + S_B_new * powerPerB) / 1000000; // Convert kW to TW, then to TWh
  const groundCarbonKg = totalPowerTwh * groundCarbonPerTwh;
  
  const carbon_orbit = totalOrbitalCarbonKg > 0 && totalPowerTwh > 0 ? totalOrbitalCarbonKg / totalPowerTwh : 1000;
  const carbon_ground = groundCarbonPerTwh;
  const carbon_delta = carbon_orbit - carbon_ground;
  const carbon_crossover_triggered = carbon_delta < 0;
  
  // Cost calculation: depends on launch mass, replacement cadence, radiator mass
  // Launch cost: cost per kg to LEO * total mass
  const launchCostUSD = totalLaunchMassKg * cost_per_kg_to_leo;
  // Replacement cost: higher replacement cadence = more cost
  const replacementCostUSD = replacementCadence * (costA + costB) / 2;
  // Radiator cost: scales with radiator mass (more radiator = higher cost)
  const radiatorCostMultiplier = 1.0 + (totalRadiatorMassKg / 1000000); // 1% cost increase per 1000 kg radiator
  const totalOrbitalCostUSD = (launchCostUSD + replacementCostUSD) * radiatorCostMultiplier;
  
  // Ground cost: ~$340 per TWh (constant)
  const groundCostPerTwh = 340;
  const groundCostUSD = totalPowerTwh * groundCostPerTwh;
  
  const cost_orbit = totalOrbitalCostUSD > 0 && totalPowerTwh > 0 ? totalOrbitalCostUSD / totalPowerTwh : 1000;
  const cost_ground = groundCostPerTwh;
  const cost_delta = cost_orbit - cost_ground;
  const cost_crossover_triggered = cost_delta < 0;
  
  // Calculate mix values (weighted average based on compute share)
  // Compute share: orbit vs ground
  const totalComputeDemand = totalComputePFLOPs * 1e15; // FLOPS
  const orbitComputeShare = totalComputeDemand > 0 ? (finalEffectiveCompute * 1e15) / totalComputeDemand : 0;
  const groundComputeShare = 1 - orbitComputeShare;
  
  // Cost per compute mix (weighted average)
  const cost_per_compute_ground = cost_ground; // $ per TWh
  const cost_per_compute_orbit = cost_orbit; // $ per TWh
  const cost_per_compute_mix = groundComputeShare * cost_per_compute_ground + orbitComputeShare * cost_per_compute_orbit;
  
  // Annual OPEX (simplified - should be calculated from actual operations)
  const annual_opex_ground = groundCostUSD; // From above
  const annual_opex_orbit = totalOrbitalCostUSD; // From above
  const annual_opex_mix = groundComputeShare * annual_opex_ground + orbitComputeShare * annual_opex_orbit;
  
  // Latency mix (weighted average)
  const latency_ground_ms = 120; // Baseline ground latency
  const latency_orbit_ms = 90; // Baseline orbit latency (can be enhanced with congestion)
  const latency_mix_ms = groundComputeShare * latency_ground_ms + orbitComputeShare * latency_orbit_ms;
  
  // Carbon mix (weighted average)
  const carbon_mix = groundComputeShare * carbon_ground + orbitComputeShare * carbon_orbit;
  
  // Solar uptime (simplified model - should be calculated from actual solar availability)
  // Ground solar: 18-28% uptime (varies by location, weather, night)
  const ground_full_power_uptime_percent = 20 + Math.sin(year * 0.1) * 5; // 18-28% with variation
  // Solar + storage: 35-55% uptime (storage smooths but never catches up)
  const solar_plus_storage_uptime_percent = 40 + Math.sin(year * 0.1) * 10; // 35-55% with variation
  // Space-based solar: 92-99% uptime (nearly flat, no night/weather)
  const space_solar_uptime_percent = S_B_new > 0 ? 95 + Math.random() * 4 : 0; // 92-99% when Class B exists
  
  // Backhaul metrics (from thermal state)
  const backhaul_capacity_tbps = updatedThermalState.backhaul_tbps || 0;
  const backhaul_used_tbps = finalEffectiveCompute > 0 
    ? (finalEffectiveCompute * 1e15) / (1e12 * 8) // Convert FLOPS to TBps (rough: 8 bits per byte)
    : 0;
  
  // Maintenance used (from thermal state)
  const maintenance_used_pods = updatedThermalState.degraded_pods || 0;
  
  const debugEntry: DebugStateEntry = {
    year,
    launchMassCeiling: effectiveComputeResult.ceilings.launchMass,
    launchCostCeiling: effectiveComputeResult.ceilings.launchCost,
    heatCeiling: effectiveComputeResult.ceilings.heat,
    backhaulCeiling: effectiveComputeResult.ceilings.backhaul,
    autonomyCeiling: effectiveComputeResult.ceilings.autonomy,
    satellitesAdded: newA + newB,
    satellitesTotal: S_A_new + S_B_new,
    satellitesFailed: effectiveComputeResult.constraints.maintenance.failuresThisYear,
    satellitesRecovered: effectiveComputeResult.constraints.maintenance.recoverable,
    satellitesRetired: retiredA + retiredB,
    utilization_heat: effectiveComputeResult.heatUtilization,
    utilization_backhaul: effectiveComputeResult.backhaulUtilization,
    utilization_autonomy: effectiveComputeResult.survivalFraction,
    utilization_overall: Math.min(
      effectiveComputeResult.heatUtilization,
      effectiveComputeResult.backhaulUtilization,
      effectiveComputeResult.survivalFraction
    ),
    power_total_kw: (S_A_new * powerPerA + S_B_new * powerPerB),
    compute_raw_flops: totalComputePFLOPs * 1e15, // Convert PFLOPs to FLOPS
    compute_effective_flops: finalEffectiveCompute * 1e15, // Use thermal-integrated compute
    dominantConstraint: effectiveComputeResult.dominantConstraint,
    strategyActive: strategy,
    strategyHistory: [strategy], // Simplified - could track history
    radiatorArea: (S_A_new * 5.0 + S_B_new * 12.0), // Simplified average
    heatGen: (S_A_new * heatGenA + S_B_new * heatGenB),
    heatReject: (S_A_new * heatRejectA + S_B_new * heatRejectB),
    launchBudget: launchBudgetM,
    costPerSatellite: (costA + costB) / 2,
    massPerSatellite: (massA + massB) / 2,
    autonomyLevel,
    failureRate: effectiveComputeResult.constraints.maintenance.failureRate,
    repairCapacity,
    shellOccupancy: {
      LOW: S_A_lowLEO_new,
      MID: S_A_midLEO_new,
      HIGH: 0, // Not tracked separately - needs orbit allocation update
      SSO: S_A_sunSync_new + S_B_sunSync_new,
    },
    // --- Class Breakdown ---
    classA_satellites_alive: S_A_new,
    classB_satellites_alive: S_B_new,
    classA_compute_raw: classA_compute_raw,
    classB_compute_raw: classB_compute_raw,
    classA_power_kw: classA_power_kw,
    classB_power_kw: classB_power_kw,
    // --- Backhaul Reality ---
    backhaul_bandwidth_total: backhaul_bandwidth_total,
    backhaul_bandwidth_used: backhaul_bandwidth_used,
    backhaul_bw_per_PFLOP: backhaul_bw_per_PFLOP,
    utilization_backhaul_raw: utilization_backhaul_raw,
    // --- Autonomy & Maintenance Reality ---
    maintenance_debt: maintenance_debt,
    failures_unrecovered: failures_unrecovered,
    survival_fraction: effectiveComputeResult.survivalFraction,
    // --- Thermal Reality ---
    electrical_efficiency: electrical_efficiency,
    radiator_kw_per_m2: radiator_kw_per_m2,
    utilization_heat_raw: utilization_heat_raw,
    // --- Launch Economics ---
    payload_per_launch_tons: payload_per_launch_tons,
    launches_per_year: launches_per_year,
    cost_per_kg_to_leo: cost_per_kg_to_leo,
    // --- Retirement Physics ---
    retirements_by_lifetime: retirements_by_lifetime,
    retirements_by_failure: retirements_by_failure,
    // --- Strategy Effects ---
    strategy_growth_target: strategy_growth_target,
    strategy_launch_budget_multiplier: strategy_launch_budget_multiplier,
    strategy_RnD_autonomy_bias: strategy_RnD_autonomy_bias,
    strategy_radiator_mass_bias: strategy_radiator_mass_bias,
    // --- Carbon & Cost Crossover ---
    carbon_orbit: carbon_orbit,
    carbon_ground: carbon_ground,
    carbon_delta: carbon_delta,
    carbon_crossover_triggered: carbon_crossover_triggered,
    cost_orbit: cost_orbit,
    cost_ground: cost_ground,
    cost_delta: cost_delta,
    cost_crossover_triggered: cost_crossover_triggered,
    // --- Dynamic Thermal Integration ---
    temp_core_C: updatedThermalState.temp_core_C,
    temp_radiator_C: updatedThermalState.temp_radiator_C,
    thermal_mass_J_per_C: updatedThermalState.thermal_mass_J_per_C,
    heatGen_kw: updatedThermalState.heatGen_kw,
    heatReject_kw: updatedThermalState.heatReject_kw,
    net_heat_flow_kw: updatedThermalState.net_heat_flow_kw,
    active_cooling_kw: updatedThermalState.active_cooling_kw,
    thermal_drift_C_per_hr: updatedThermalState.thermal_drift_C_per_hr,
    eclipse_fraction: updatedThermalState.eclipse_fraction,
    shadowing_loss: updatedThermalState.shadowing_loss,
    // --- Utilization Metrics ---
    power_utilization_percent: updatedThermalState.power_utilization_percent,
    radiator_utilization_percent: updatedThermalState.radiator_utilization_percent,
    backhaul_utilization_percent: updatedThermalState.backhaul_utilization_percent,
    manufacturing_utilization_percent: updatedThermalState.manufacturing_utilization_percent,
    maintenance_utilization_percent: updatedThermalState.maintenance_utilization_percent,
    // --- Sustained Compute ---
    sustained_compute_flops: updatedThermalState.sustained_compute_flops,
    compute_exportable_flops: updatedThermalState.compute_exportable_flops,
    // --- Maintenance Debt ---
    global_efficiency: updatedThermalState.global_efficiency,
    // --- ECONOMICS (unified debug output) ---
    cost_per_compute_ground: cost_per_compute_ground,
    cost_per_compute_orbit: cost_per_compute_orbit,
    cost_per_compute_mix: cost_per_compute_mix,
    annual_opex_ground: annual_opex_ground,
    annual_opex_orbit: annual_opex_orbit,
    annual_opex_mix: annual_opex_mix,
    // --- LATENCY (unified debug output) ---
    latency_ground_ms: latency_ground_ms,
    latency_orbit_ms: latency_orbit_ms,
    latency_mix_ms: latency_mix_ms,
    // --- COMPUTE (unified debug output) ---
    // compute_raw_flops, compute_effective_flops, compute_exportable_flops, sustained_compute_flops already exist
    // classA_compute_flops, classB_compute_flops already exist (as classA_compute_raw, classB_compute_raw)
    // --- POWER (unified debug output) ---
    // power_total_kw, power_utilization_percent already exist
    // --- THERMAL (unified debug output) ---
    // temp_core_C, temp_radiator_C, net_heat_flow_kw, radiator_utilization_percent, active_cooling_kw already exist
    // --- BACKHAUL (unified debug output) ---
    backhaul_capacity_tbps: backhaul_capacity_tbps,
    backhaul_used_tbps: backhaul_used_tbps,
    // backhaul_utilization_percent already exists
    // --- MAINTENANCE (unified debug output) ---
    // maintenance_capacity_pods, maintenance_utilization_percent, failures_unrecovered, survival_fraction already exist
    maintenance_used_pods: maintenance_used_pods,
    // --- CARBON (unified debug output) ---
    // carbon_ground, carbon_orbit, carbon_crossover_triggered already exist
    carbon_mix: carbon_mix,
    // --- SOLAR (unified debug output) ---
    ground_full_power_uptime_percent: ground_full_power_uptime_percent,
    solar_plus_storage_uptime_percent: solar_plus_storage_uptime_percent,
    space_solar_uptime_percent: space_solar_uptime_percent,
  };
  
  addDebugStateEntry(debugEntry);
  validateState(year);
  // Run cross-year validation after adding entry
  if (year % 5 === 0) { // Run every 5 years to avoid performance issues
    validateStateAcrossYears();
  }
  
  // 10. Update deployment history
  const newDeployedByYear_A = new Map(deployedByYear_A);
  const newDeployedByYear_B = new Map(deployedByYear_B);
  newDeployedByYear_A.set(year, newA);
  newDeployedByYear_B.set(year, newB);
  
  // 11. Update state with thermal state for next year
  const newState: YearDeploymentState = {
    year: year + 1,
    strategy,
    S_A: S_A_new,
    S_B: S_B_new,
    S_A_lowLEO: S_A_lowLEO_new,
    S_A_midLEO: S_A_midLEO_new,
    S_A_sunSync: S_A_sunSync_new,
    deployedByYear_A: newDeployedByYear_A,
    deployedByYear_B: newDeployedByYear_B,
    totalComputePFLOPs: finalEffectiveCompute,
    totalPowerMW: (S_A_new * powerPerA + S_B_new * powerPerB) / 1000,
    thermalState: updatedThermalState,
  };
  
  return {
    year,
    strategy,
    newA,
    newB,
    newA_lowLEO,
    newA_midLEO,
    newA_sunSync,
    S_A: S_A_new,
    S_B: S_B_new,
    S_A_lowLEO: S_A_lowLEO_new,
    S_A_midLEO: S_A_midLEO_new,
    S_A_sunSync: S_A_sunSync_new,
    S_B_sunSync: S_B_sunSync_new,
    totalComputePFLOPs: finalEffectiveCompute,
    totalPowerMW,
    effectiveComputePFLOPs: finalEffectiveCompute,
    heatUtilization: effectiveComputeResult.heatUtilization,
    survivalFraction: effectiveComputeResult.survivalFraction,
    computePerA,
    powerPerA,
    computePerB,
    powerPerB,
    constraints: effectiveComputeResult.constraints,
    thermalState: updatedThermalState, // Return thermal state for next year
  };
}

/**
 * Get initial state (year 2025)
 */
export function getInitialDeploymentState(strategy: StrategyMode = "BALANCED"): YearDeploymentState {
  // Initialize thermal state for year 0 (no satellites yet)
  const initialThermalState = initializeThermalState(0, 0, 0, 0, 0, 0, 5.0, 12.0, START_YEAR);
  
  return {
    year: START_YEAR,
    strategy,
    S_A: 0,
    S_A_lowLEO: 0,
    S_A_midLEO: 0,
    S_A_sunSync: 0,
    S_B: 0,
    deployedByYear_A: new Map(),
    deployedByYear_B: new Map(),
    totalComputePFLOPs: 0,
    totalPowerMW: 0,
    thermalState: initialThermalState,
  };
}

/**
 * Run multi-year deployment simulation
 * 
 * @param startYear Starting year
 * @param endYear Ending year
 * @param strategyByYear Map of year -> strategy (allows mid-run strategy changes)
 */
export function runMultiYearDeployment(
  startYear: number,
  endYear: number,
  strategyByYear: Map<number, StrategyMode>
): YearDeploymentResult[] {
  let state = getInitialDeploymentState();
  const results: YearDeploymentResult[] = [];
  
  for (let year = startYear; year <= endYear; year++) {
    // Get strategy for this year (default to BALANCED if not specified)
    const strategy = strategyByYear.get(year) || "BALANCED";
    
    // Calculate deployment for this year
    const result = calculateYearDeployment(state, strategy);
    results.push(result);
    
    // Update state for next year (get thermalState from result)
    state = {
      year: year + 1,
      strategy,
      S_A: result.S_A,
      S_A_lowLEO: result.S_A_lowLEO,
      S_A_midLEO: result.S_A_midLEO,
      S_A_sunSync: result.S_A_sunSync,
      S_B: result.S_B,
      deployedByYear_A: new Map(state.deployedByYear_A),
      deployedByYear_B: new Map(state.deployedByYear_B),
      totalComputePFLOPs: result.totalComputePFLOPs,
      totalPowerMW: result.totalPowerMW,
      thermalState: result.thermalState, // Get thermal state from result
    };
    
    // Update deployment history
    state.deployedByYear_A.set(year, result.newA);
    state.deployedByYear_B.set(year, result.newB);
  }
  
  return results;
}

