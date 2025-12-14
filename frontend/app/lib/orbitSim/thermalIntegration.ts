/**
 * Dynamic Thermal Integration Module
 * 
 * Replaces static heat ceilings with live thermal calculations:
 * - Power → Heat → Temperature integration
 * - Thermal throttling based on actual temperature
 * - Power-cooling coupling
 * - Eclipse and shadowing effects
 */

export interface ThermalState {
  // Core state
  power_total_kw: number;
  compute_raw_flops: number;
  compute_effective_flops: number;
  
  // Thermal state
  temp_core_C: number; // Core temperature in Celsius
  temp_radiator_C: number; // Radiator temperature in Celsius
  thermal_mass_J_per_C: number; // Thermal mass (Joules per degree C)
  
  // Radiator properties
  radiatorArea_m2: number;
  emissivity: number;
  eclipse_fraction: number; // Fraction of orbit in eclipse
  shadowing_loss: number; // Loss from Earth shadowing
  
  // Backhaul
  backhaul_tbps: number;
  
  // Manufacturing & Maintenance
  manufacturing_rate_pods_per_year: number;
  maintenance_capacity_pods: number;
  
  // Failure state
  failure_rate: number; // Failures per year per pod
  degraded_pods: number; // Number of pods in degraded state
  
  // Computed values
  heatGen_kw: number;
  heatReject_kw: number;
  net_heat_flow_kw: number;
  active_cooling_kw: number;
  compute_exportable_flops: number;
  sustained_compute_flops: number;
  
  // Utilization metrics
  power_utilization_percent: number;
  thermal_drift_C_per_hr: number;
  radiator_utilization_percent: number;
  backhaul_utilization_percent: number;
  manufacturing_utilization_percent: number;
  maintenance_utilization_percent: number;
  
  // Maintenance debt
  maintenance_debt: number;
  global_efficiency: number;
  
  // Failure mode states
  radiator_damage_fraction: number; // 0-1, fraction of radiator area lost to micrometeoroids
  pump_failure_active: boolean; // Active cooling pump failure
  coolant_frozen: boolean; // Coolant frozen during eclipse
  coolant_freeze_ticks_remaining: number; // Ticks until coolant unfreezes
  
  // Cumulative failure drivers
  cumulative_radiation_dose: number; // Arbitrary units, accumulates over time
  cumulative_thermal_excursions: number; // Count of times temp exceeded max
  thermal_oscillation_amplitude: number; // Temperature oscillation during eclipse
  
  // Auto-design safety state
  auto_design_mode: boolean;
  risk_mode: RiskMode;
  lost_fraction: number; // Fraction of fleet lost to thermal death (0-1)
  radiator_burnout_factor: number; // Cumulative radiator degradation (1.0 = pristine)
}

// Constants
const STEFAN_BOLTZMANN = 5.67e-8; // W/(m²·K⁴)
const SPACE_TEMP_K = 2.7; // Cosmic microwave background temperature (Kelvin)
const MAX_OPERATING_TEMP_C = 85; // Maximum safe operating temperature (legacy, kept for compatibility)
export const FLOPS_PER_TBPS = 1e15 / 1e12; // 1000 PFLOPs per TBps (approximate)
// CRITICAL: Electrical efficiency - fraction of power that does useful work
// Waste heat = power * (1 - electrical_efficiency)
const ELECTRICAL_EFFICIENCY = 0.85; // 85% electrical efficiency, 15% becomes waste heat
const ACTIVE_COOLING_EFFICIENCY = 0.25; // 25% of net heat can be actively cooled
const MAX_ACTIVE_COOLING_FRACTION = 0.15; // Max 15% of power for active cooling

// Fixed thermal mass per satellite class (J/°C) - MUST NOT scale with power
const THERMAL_MASS_CLASS_A = 2e6; // 2 MJ/°C per Class A satellite
const THERMAL_MASS_CLASS_B = 5e6; // 5 MJ/°C per Class B satellite

// Auto-design safety constants
export const TARGET_CORE_TEMP_C = 70;
export const MAX_CORE_TEMP_SOFT_C = 90;
export const MAX_CORE_TEMP_HARD_C = 450;
export const THERMAL_SAFETY_MARGIN_SAFE = 0.7;
export const THERMAL_SAFETY_MARGIN_AGGRESSIVE = 0.95;
export const BACKHAUL_SAFETY_MARGIN_SAFE = 0.9;
export const BACKHAUL_SAFETY_MARGIN_AGGRESSIVE = 1.0;
export const MAINT_SAFETY_MARGIN_SAFE = 0.9;
export const MAINT_SAFETY_MARGIN_AGGRESSIVE = 1.0;

export type RiskMode = "SAFE" | "AGGRESSIVE" | "YOLO";

export function calculateHeatGeneration(power_kw: number): number {
  // FIX: 85% of bus power becomes heat (15% is electrical losses)
  return power_kw * 0.85; // 85% of power becomes heat
}

/**
 * Calculate heat rejection from radiator
 * Q_rad = A * ε * σ * (T_rad^4 - T_space^4) * (1 - eclipse) * (1 - shadowing)
 */
export function calculateHeatRejection(
  radiatorArea_m2: number,
  emissivity: number,
  temp_radiator_C: number,
  eclipse_fraction: number,
  shadowing_loss: number
): { heatReject_kw: number; radiator_capacity_kw: number } {
  const temp_radiator_K = temp_radiator_C + 273.15;
  
  // Maximum radiator capacity (no eclipse/shadowing)
  const Q_rad_max_watts = radiatorArea_m2 * emissivity * STEFAN_BOLTZMANN * 
    (Math.pow(temp_radiator_K, 4) - Math.pow(SPACE_TEMP_K, 4));
  const radiator_capacity_kw = Q_rad_max_watts / 1000;
  
  // Actual heat rejection (with eclipse and shadowing losses)
  const heatReject_kw = radiator_capacity_kw * (1 - eclipse_fraction) * (1 - shadowing_loss);
  
  return {
    heatReject_kw: Math.max(0, heatReject_kw),
    radiator_capacity_kw: Math.max(0, radiator_capacity_kw),
  };
}

/**
 * Probabilistic failure modes
 */
function applyFailureModes(
  state: ThermalState,
  dt_hours: number,
  year: number
): Partial<ThermalState> {
  const totalPods = state.power_total_kw > 0 ? Math.floor(state.power_total_kw / 10) : 0; // Rough estimate
  const failureState: Partial<ThermalState> = {
    radiator_damage_fraction: state.radiator_damage_fraction || 0,
    pump_failure_active: state.pump_failure_active || false,
    coolant_frozen: state.coolant_frozen || false,
    coolant_freeze_ticks_remaining: state.coolant_freeze_ticks_remaining || 0,
  };
  
  // 1. Micrometeoroid hits → radiator damage
  // Probability: ~0.1% per pod per year
  const micrometeoroid_probability = 0.001 * totalPods * (dt_hours / 8760);
  if (Math.random() < micrometeoroid_probability) {
    // Random loss of 0.1-2% of radiator area
    const damage = 0.001 + Math.random() * 0.019;
    failureState.radiator_damage_fraction = Math.min(0.5, (state.radiator_damage_fraction || 0) + damage);
  }
  
  // 2. Pump failures → active cooling efficiency reduced
  // Probability: ~0.05% per pod per year
  const pump_failure_probability = 0.0005 * totalPods * (dt_hours / 8760);
  if (Math.random() < pump_failure_probability) {
    failureState.pump_failure_active = true;
  } else if (state.pump_failure_active && Math.random() < 0.1) {
    // 10% chance per tick to recover from pump failure
    failureState.pump_failure_active = false;
  }
  
  // 3. Eclipse-induced failures
  // Cooling collapse risk during eclipse
  if (state.eclipse_fraction > 0.1) {
    // Coolant freeze risk (if temp drops below -20°C)
    if (state.temp_radiator_C < -20 && !state.coolant_frozen) {
      const freeze_probability = 0.01 * state.eclipse_fraction; // Higher probability in longer eclipses
      if (Math.random() < freeze_probability) {
        failureState.coolant_frozen = true;
        failureState.coolant_freeze_ticks_remaining = Math.floor(2 + Math.random() * 4); // 2-6 hours
      }
    }
    
    // Pump restart failure chance after eclipse
    if (!state.coolant_frozen && state.pump_failure_active && Math.random() < 0.15 * state.eclipse_fraction) {
      // Pump may fail to restart after eclipse (15% chance per eclipse fraction)
      failureState.pump_failure_active = true;
    }
    
    // Thermal oscillation during eclipse (handled in main update function)
  }
  
  // Unfreeze coolant after timer expires
  if (state.coolant_frozen && state.coolant_freeze_ticks_remaining > 0) {
    failureState.coolant_freeze_ticks_remaining = state.coolant_freeze_ticks_remaining - (dt_hours / 8760);
    if (failureState.coolant_freeze_ticks_remaining <= 0) {
      failureState.coolant_frozen = false;
      failureState.coolant_freeze_ticks_remaining = 0;
    }
  }
  
  return failureState;
}

/**
 * Calculate net heat flow and update temperature
 */
export function updateThermalState(
  state: ThermalState,
  dt_hours: number = 8760, // 1 year in hours
  year: number = 2025
): ThermalState {
  // 0. Apply probabilistic failure modes
  const failureModes = applyFailureModes(state, dt_hours, year);
  const effective_radiator_area = state.radiatorArea_m2 * (1 - (failureModes.radiator_damage_fraction || 0));
  const pump_failure_multiplier = failureModes.pump_failure_active ? 1.3 : 1.0; // 30% more power needed
  const coolant_frozen = failureModes.coolant_frozen || false;
  
  const heatGen_kw = calculateHeatGeneration(state.power_total_kw);
  
  // 2. Calculate heat rejection
  const heatRejectionResult = calculateHeatRejection(
    effective_radiator_area,
    state.emissivity,
    state.temp_radiator_C,
    state.eclipse_fraction,
    state.shadowing_loss
  );
  const heatReject_kw = heatRejectionResult.heatReject_kw;
  const radiator_capacity_kw = heatRejectionResult.radiator_capacity_kw;
  
  let net_heat_flow_kw = heatGen_kw - heatReject_kw;
  
  const radiator_utilization_for_overdrive = radiator_capacity_kw > 1e-6
    ? (heatGen_kw / radiator_capacity_kw) * 100
    : 0;
  let radiator_burnout_factor = state.radiator_burnout_factor || 1.0;
  
  if (radiator_utilization_for_overdrive > 100) {
    net_heat_flow_kw *= 1.5;
  }
  if (radiator_utilization_for_overdrive > 110) {
    radiator_burnout_factor *= 0.98;
    state.emissivity *= 0.99;
  }
  
  // 4. Calculate active cooling (power-cooling coupling)
  // Active cooling disabled if coolant is frozen
  let active_cooling_kw = 0;
  if (!coolant_frozen && net_heat_flow_kw > 0) {
    // Only cool if we have excess heat (net_heat_flow > 0)
    active_cooling_kw = Math.min(
      net_heat_flow_kw * ACTIVE_COOLING_EFFICIENCY * pump_failure_multiplier,
      state.power_total_kw * MAX_ACTIVE_COOLING_FRACTION
    );
  }
  const active_cooling_kw_clamped = Math.max(0, active_cooling_kw);
  
  // 5. Calculate radiator utilization (BEFORE temperature update)
  const radiator_utilization_ratio = heatGen_kw > 0 ? heatReject_kw / heatGen_kw : 1.0;
  
  const effective_net_heat = net_heat_flow_kw - active_cooling_kw_clamped;
  const thermal_mass_safe = Math.max(state.thermal_mass_J_per_C, 1e6);
  let temp_change_C = (effective_net_heat * 3600 * dt_hours) / thermal_mass_safe;
  
  // 6a. If radiator utilization > 100%, temperature must rise SUPER-LINEARLY
  if (radiator_utilization_ratio < 1.0) {
    // Heat rejection insufficient - super-linear temperature rise
    const deficit = 1.0 - radiator_utilization_ratio;
    // Super-linear scaling: temp rise ∝ (deficit)^2.5
    const superlinear_multiplier = Math.pow(deficit, 2.5) * 3.0; // Amplify by 3x
    temp_change_C *= (1.0 + superlinear_multiplier);
    
    // Additional overdrive penalty: temp rises faster when overdriven
    const overdrive_factor = 1.0 + (1.0 - radiator_utilization_ratio) * 2.0; // Up to 3x faster
    temp_change_C *= overdrive_factor;
  }
  
  // 6b. Eclipse-induced thermal oscillation
  let thermal_oscillation = 0;
  if (state.eclipse_fraction > 0.1) {
    // Temperature oscillates during eclipse (heating/cooling cycles)
    const oscillation_amplitude = state.eclipse_fraction * 5.0; // Up to 5°C oscillation
    thermal_oscillation = Math.sin(year * 0.5) * oscillation_amplitude; // Oscillates with year
    temp_change_C += thermal_oscillation * (dt_hours / 8760); // Scale by time fraction
  }
  
  const new_temp_core_C = state.temp_core_C + temp_change_C;
  let lost_fraction = state.lost_fraction || 0;
  let thermal_overstress_term = 0;
  
  if (new_temp_core_C > MAX_CORE_TEMP_HARD_C) {
    // Hard death: satellite/fleet segment is LOST
    const death_fraction = Math.min(1.0, (new_temp_core_C - MAX_CORE_TEMP_HARD_C) / 100); // Gradual death above hard limit
    lost_fraction = Math.max(lost_fraction, death_fraction);
    
    // Remove lost fraction from system
    // (This will be applied to reduce power_total_kw, compute_raw_flops, etc. in the return)
  } else if (new_temp_core_C > MAX_CORE_TEMP_SOFT_C && new_temp_core_C <= MAX_CORE_TEMP_HARD_C) {
    // Soft limit exceeded: severe throttling and overstress
    const overstress_ratio = (new_temp_core_C - MAX_CORE_TEMP_SOFT_C) / (MAX_CORE_TEMP_HARD_C - MAX_CORE_TEMP_SOFT_C);
    thermal_overstress_term = overstress_ratio * 0.1; // Up to 10% failure rate increase
  }
  
  // 7. Update cumulative failure drivers
  let cumulative_radiation_dose = (state.cumulative_radiation_dose || 0) + (dt_hours / 8760) * 0.1; // Accumulates over time
  let cumulative_thermal_excursions = state.cumulative_thermal_excursions || 0;
  if (new_temp_core_C > MAX_CORE_TEMP_SOFT_C) {
    cumulative_thermal_excursions += 1; // Count thermal excursions (using soft limit)
  }
  
  // 8. Thermal throttling and failure rate (MUST spike if radiator utilization > 1)
  let compute_effective_flops = state.compute_raw_flops;
  let new_failure_rate = state.failure_rate;
  
  // Base failure rate from cumulative drivers
  const base_failure_rate = 0.03; // 3% base
  const radiation_penalty = cumulative_radiation_dose * 0.01; // 1% per unit radiation
  const thermal_excursion_penalty = cumulative_thermal_excursions * 0.005; // 0.5% per excursion
  const maintenance_debt_penalty = (state.maintenance_debt || 0) > 0 ? (state.maintenance_debt / 100) * 0.01 : 0;
  
  new_failure_rate = base_failure_rate + radiation_penalty + thermal_excursion_penalty + maintenance_debt_penalty;
  
  // Add thermal overstress term
  new_failure_rate += thermal_overstress_term;
  
  if (new_temp_core_C > MAX_CORE_TEMP_SOFT_C) {
    // Throttle compute based on temperature (using soft limit)
    const throttle_factor = MAX_CORE_TEMP_SOFT_C / new_temp_core_C;
    compute_effective_flops = state.compute_raw_flops * throttle_factor;
    
    // Increase failure rate when overheated (additional penalty)
    const hours_overheated = dt_hours;
    new_failure_rate += 0.005 * hours_overheated;
  }
  
  // Apply lost fraction: reduce compute and power for lost satellites
  if (lost_fraction > 0) {
    compute_effective_flops *= (1.0 - lost_fraction);
    // Power reduction will be applied in the return statement
  }
  
  // 8a. If radiator utilization > 1, FAILURE RATE MUST SPIKE and compute MUST THROTTLE HARD
  if (radiator_utilization_ratio < 1.0) {
    const deficit = 1.0 - radiator_utilization_ratio;
    // Failure rate spike: exponential with deficit
    new_failure_rate *= (1.0 + Math.pow(deficit, 2) * 5.0); // Up to 5x multiplier
    
    // Hard compute throttle: compute scales with (radiator_utilization)^2
    const throttle_factor = Math.pow(radiator_utilization_ratio, 2);
    compute_effective_flops = state.compute_raw_flops * throttle_factor;
  }
  
  // 9. Backhaul as hard competing bottleneck (NO STATIC CLAMP, NO HIDDEN CLAMPS)
  // compute_exportable = min(compute_effective, backhaul_bandwidth_total * flops_per_tbps)
  // backhaul_bandwidth_total is in TBps (already calculated in state.backhaul_tbps)
  const backhaul_capacity_tbps = state.backhaul_tbps; // TBps
  const backhaul_compute_capacity = backhaul_capacity_tbps * FLOPS_PER_TBPS;
  
  // REAL COMPETITION: compute_exportable = min(compute_effective, backhaul_capacity)
  let compute_exportable_flops = Math.min(
    compute_effective_flops,
    backhaul_compute_capacity
  );
  
  // Calculate backhaul used from flows: backhaul_used_tbps = compute_exportable_flops / flops_per_tbps
  // CRITICAL: Use compute_exportable_flops, not compute_effective_flops
  const backhaul_used_tbps_from_flows = compute_exportable_flops > 0
    ? compute_exportable_flops / FLOPS_PER_TBPS
    : 0;
  
  // SUSTAINED COMPUTE MUST GATE: compute_effective cannot exceed sustained_compute
  // (sustained_compute calculated below, but we need to gate here)
  // This will be applied after sustained_compute is calculated
  
  // 10. Maintenance debt loop (MUST dominate survival) - Calculate FIRST before using in utilization metrics
  // CRITICAL: Maintenance capacity is consumed by repairs, not just available
  const pods_repaired = Math.min(state.degraded_pods, state.maintenance_capacity_pods);
  const totalPods = state.power_total_kw > 0 ? Math.floor(state.power_total_kw / 10) : 0; // Rough estimate
  const new_failures = new_failure_rate * totalPods * (dt_hours / 8760);
  const new_degraded_pods = Math.max(0, state.degraded_pods + new_failures - pods_repaired);
  
  // 11. Calculate maintenance utilization ratio and global efficiency (needed for power utilization)
  // CRITICAL: Utilization = (degraded_pods + repairs_this_year) / capacity
  // This ensures repairs consume capacity
  const maintenance_used_pods = new_degraded_pods + pods_repaired; // Total maintenance work (failures + repairs)
  const maintenance_utilization_ratio = state.maintenance_capacity_pods > 0
    ? maintenance_used_pods / state.maintenance_capacity_pods
    : 0;
  
  let new_global_efficiency = state.global_efficiency || 1.0;
  let failures_unrecovered = new_degraded_pods - pods_repaired;
  let survival_fraction = totalPods > 0 ? (totalPods - new_degraded_pods) / totalPods : 1.0;
  
  // If maintenance_utilization > 1, failures_unrecovered MUST grow, survival_fraction MUST fall, global_efficiency MUST decay
  // ALSO: power and compute MUST be reduced
  let power_scale_from_maintenance = 1.0;
  let compute_scale_from_maintenance = 1.0;
  if (maintenance_utilization_ratio > 1.0) {
    // Failures exceed recovery capacity - maintenance is overloaded
    const overload_factor = maintenance_utilization_ratio; // e.g., 2.0 = 200% utilization
    
    // Unrecovered failures grow with overload
    failures_unrecovered = Math.max(failures_unrecovered, (maintenance_utilization_ratio - 1.0) * state.maintenance_capacity_pods);
    
    // Survival fraction MUST decay when maintenance is overloaded
    // More overload = more failures pile up = lower survival
    const survival_decay = Math.pow(0.9, maintenance_utilization_ratio - 1.0); // 10% decay per unit over capacity
    survival_fraction = Math.max(0.1, survival_fraction * survival_decay);
    
    // Global efficiency decays exponentially with maintenance overload
    const efficiency_decay = Math.pow(0.95, maintenance_utilization_ratio - 1.0); // 5% decay per unit over capacity
    new_global_efficiency *= efficiency_decay;
    
    // REDUCE POWER AND COMPUTE when maintenance is overloaded
    power_scale_from_maintenance = survival_fraction;
    compute_scale_from_maintenance = survival_fraction;
  }
  
  // 12. Calculate sustained compute EARLY (needed for power utilization check)
  // This is the theoretical maximum where system is in thermal equilibrium
  let sustained_compute_flops = state.compute_raw_flops * new_global_efficiency;
  
  // SUSTAINED COMPUTE MUST GATE: If sustained_compute == 0, everything is 0
  if (sustained_compute_flops <= 0) {
    compute_effective_flops = 0;
    compute_exportable_flops = 0;
  } else {
    // Gate compute_effective by sustained_compute
    compute_effective_flops = Math.min(compute_effective_flops, sustained_compute_flops);
    // Recalculate compute_exportable with gated compute_effective
    compute_exportable_flops = Math.min(compute_effective_flops, backhaul_compute_capacity);
  }
  
  // 13. Calculate utilization metrics (MUST BE DYNAMIC, MUST STAY PHYSICAL)
  // Power utilization = min of all limit factors
  const thermal_limit_factor = radiator_utilization_ratio > 0 ? Math.min(1.0, radiator_utilization_ratio) : 0;
  const maintenance_limit_factor = state.maintenance_capacity_pods > 0 
    ? Math.min(1.0, (state.maintenance_capacity_pods - new_degraded_pods) / state.maintenance_capacity_pods)
    : 1.0;
  const backhaul_limit_factor = compute_effective_flops > 0
    ? Math.min(1.0, compute_exportable_flops / compute_effective_flops)
    : 0;
  const autonomy_limit_factor = new_global_efficiency; // From maintenance debt (now calculated above)
  
  // Power utilization is the minimum of all constraints
  // MUST CLAMP: power_utilization_percent ∈ [0, 100]
  let power_utilization_factor = Math.min(
    thermal_limit_factor,
    maintenance_limit_factor,
    backhaul_limit_factor,
    autonomy_limit_factor,
    1.0 - lost_fraction, // Lost fraction reduces power utilization
    1.0 // Never exceed 100%
  );
  
  // If sustained_compute == 0, power_utilization MUST be 0
  if (sustained_compute_flops <= 0) {
    power_utilization_factor = 0;
  }
  
  // Clamp to [0, 1] (NO negative, NO >100%)
  power_utilization_factor = Math.max(0, Math.min(1.0, power_utilization_factor));
  const power_utilization_percent = power_utilization_factor * 100;
  
  const thermal_drift_C_per_hr = temp_change_C / dt_hours;
  
  // CRITICAL FIX: Utilization can NEVER exceed 100% (physically impossible)
  // Per Anno feedback: "radiator_utilization_percent: 146.3% is physically impossible"
  const radiator_utilization_percent = radiator_capacity_kw > 1e-6
    ? Math.max(0, Math.min(100, (heatGen_kw / radiator_capacity_kw) * 100)) // CRITICAL: Cap at 100%
    : (heatGen_kw > 0 ? 100 : 0);
  
  const backhaul_utilization_percent = backhaul_capacity_tbps > 1e-9
    ? Math.max(0, Math.min(100, (backhaul_used_tbps_from_flows / backhaul_capacity_tbps) * 100))
    : (backhaul_used_tbps_from_flows > 0 ? 100 : 0);
  
  const manufacturing_utilization_percent = state.manufacturing_rate_pods_per_year > 1e-9
    ? Math.max(0, Math.min(100, 100)) // Assume always at capacity for now
    : 0;
  
  const maintenance_used_pods_from_debt = failures_unrecovered + new_failures;
  const repairCapacity = state.maintenance_capacity_pods;
  
  const maintenance_utilization_percent = repairCapacity > 1e-6
    ? Math.max(0, Math.min(300, (maintenance_used_pods_from_debt / repairCapacity) * 100))
    : (maintenance_used_pods_from_debt > 0 ? 300 : 0);
  
  const maintenance_debt = failures_unrecovered;
  
  return {
    ...state,
    heatGen_kw,
    heatReject_kw,
    net_heat_flow_kw: effective_net_heat,
    active_cooling_kw: active_cooling_kw_clamped,
    temp_core_C: new_temp_core_C,
    compute_effective_flops,
    compute_exportable_flops,
    sustained_compute_flops,
    failure_rate: new_failure_rate,
    degraded_pods: new_degraded_pods,
    power_utilization_percent,
    thermal_drift_C_per_hr,
    radiator_utilization_percent,
    backhaul_utilization_percent,
    manufacturing_utilization_percent,
    maintenance_utilization_percent,
    maintenance_debt,
    global_efficiency: new_global_efficiency,
    // Failure mode states
    radiator_damage_fraction: failureModes.radiator_damage_fraction ?? state.radiator_damage_fraction ?? 0,
    pump_failure_active: failureModes.pump_failure_active ?? state.pump_failure_active ?? false,
    coolant_frozen: failureModes.coolant_frozen ?? state.coolant_frozen ?? false,
    coolant_freeze_ticks_remaining: failureModes.coolant_freeze_ticks_remaining ?? state.coolant_freeze_ticks_remaining ?? 0,
    // Cumulative failure drivers
    cumulative_radiation_dose,
    cumulative_thermal_excursions,
    thermal_oscillation_amplitude: Math.abs(thermal_oscillation),
    // Auto-design safety state
    auto_design_mode: state.auto_design_mode ?? true,
    risk_mode: state.risk_mode ?? "SAFE",
    lost_fraction,
    radiator_burnout_factor,
    // Apply lost fraction and maintenance scaling to power and compute
    power_total_kw: state.power_total_kw * (1.0 - lost_fraction) * power_scale_from_maintenance,
    compute_raw_flops: state.compute_raw_flops * (1.0 - lost_fraction) * compute_scale_from_maintenance,
    radiatorArea_m2: state.radiatorArea_m2 * radiator_burnout_factor * (1.0 - lost_fraction),
  };
}

/**
 * Initialize thermal state from satellite counts and properties
 */
export function initializeThermalState(
  satelliteCountA: number,
  satelliteCountB: number,
  powerPerA_kw: number,
  powerPerB_kw: number,
  computePerA_PFLOPs: number,
  computePerB_PFLOPs: number,
  radiatorAreaPerA_m2: number = 5.0,
  radiatorAreaPerB_m2: number = 12.0,
  year: number = 2025
): ThermalState {
  const totalPower_kw = (satelliteCountA * powerPerA_kw) + (satelliteCountB * powerPerB_kw);
  const totalCompute_flops = ((satelliteCountA * computePerA_PFLOPs) + (satelliteCountB * computePerB_PFLOPs)) * 1e15;
  const totalRadiatorArea_m2 = (satelliteCountA * radiatorAreaPerA_m2) + (satelliteCountB * radiatorAreaPerB_m2);
  
  // FIXED thermal mass per satellite class (MUST NOT scale with power)
  const thermal_mass_J_per_C = (satelliteCountA * THERMAL_MASS_CLASS_A) + (satelliteCountB * THERMAL_MASS_CLASS_B);
  
  // Initial temperatures (ambient + some operating margin)
  const temp_core_C = 25; // Start at room temperature
  const temp_radiator_C = 20; // Radiator slightly cooler
  
  // Eclipse fraction (varies by orbit, average ~30% for LEO)
  const eclipse_fraction = 0.30;
  
  // Shadowing loss (Earth shadowing, ~5%)
  const shadowing_loss = 0.05;
  
  // Emissivity (typical radiator coating)
  const emissivity = 0.90;
  
  // Backhaul capacity (scales with satellite count)
  // Convert from Gbps to TBps: 1 TBps = 1000 Gbps
  const backhaul_gbps = (satelliteCountA + satelliteCountB) * 50; // 50 Gbps per satellite
  const backhaul_tbps = backhaul_gbps / 1000; // Convert to TBps
  
  // Manufacturing and maintenance (scale with fleet size)
  const manufacturing_rate_pods_per_year = Math.max(100, (satelliteCountA + satelliteCountB) * 0.1);
  const maintenance_capacity_pods = Math.max(50, (satelliteCountA + satelliteCountB) * 0.05);
  
  // Initial failure rate (2-4% per year)
  const failure_rate = 0.03;
  
  const initialState: ThermalState = {
    power_total_kw: totalPower_kw,
    compute_raw_flops: totalCompute_flops,
    compute_effective_flops: totalCompute_flops,
    temp_core_C,
    temp_radiator_C,
    thermal_mass_J_per_C,
    radiatorArea_m2: totalRadiatorArea_m2,
    emissivity,
    eclipse_fraction,
    shadowing_loss,
    backhaul_tbps,
    manufacturing_rate_pods_per_year,
    maintenance_capacity_pods,
    failure_rate,
    degraded_pods: 0,
    heatGen_kw: 0,
    heatReject_kw: 0,
    net_heat_flow_kw: 0,
    active_cooling_kw: 0,
    compute_exportable_flops: totalCompute_flops,
    sustained_compute_flops: totalCompute_flops,
    power_utilization_percent: 100,
    thermal_drift_C_per_hr: 0,
    radiator_utilization_percent: 0,
    backhaul_utilization_percent: 0,
    manufacturing_utilization_percent: 0,
    maintenance_utilization_percent: 0,
    maintenance_debt: 0,
    global_efficiency: 1.0,
    // Failure mode states (initialized)
    radiator_damage_fraction: 0,
    pump_failure_active: false,
    coolant_frozen: false,
    coolant_freeze_ticks_remaining: 0,
    // Cumulative failure drivers (initialized)
    cumulative_radiation_dose: 0,
    cumulative_thermal_excursions: 0,
    thermal_oscillation_amplitude: 0,
    // Auto-design safety state (initialized)
    auto_design_mode: true,
    risk_mode: "SAFE",
    lost_fraction: 0,
    radiator_burnout_factor: 1.0,
  };
  
  // Run one thermal update to initialize computed values
  return updateThermalState(initialState, 0.1, year); // Small initial step
}

