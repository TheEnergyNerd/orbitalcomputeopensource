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
}

// Constants
const STEFAN_BOLTZMANN = 5.67e-8; // W/(m²·K⁴)
const SPACE_TEMP_K = 2.7; // Cosmic microwave background temperature (Kelvin)
const MAX_OPERATING_TEMP_C = 85; // Maximum safe operating temperature
const FLOPS_PER_TBPS = 1e15 / 1e12; // 1000 PFLOPs per TBps (approximate)
const HEAT_GEN_EFFICIENCY = 0.95; // 95% of power becomes heat
const ACTIVE_COOLING_EFFICIENCY = 0.25; // 25% of net heat can be actively cooled
const MAX_ACTIVE_COOLING_FRACTION = 0.15; // Max 15% of power for active cooling

/**
 * Calculate heat generation from power
 */
export function calculateHeatGeneration(power_kw: number): number {
  return power_kw * HEAT_GEN_EFFICIENCY;
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
): number {
  const temp_radiator_K = temp_radiator_C + 273.15;
  const Q_rad_watts = radiatorArea_m2 * emissivity * STEFAN_BOLTZMANN * 
    (Math.pow(temp_radiator_K, 4) - Math.pow(SPACE_TEMP_K, 4));
  const Q_rad_kw = Q_rad_watts / 1000;
  
  // Apply eclipse and shadowing losses
  return Q_rad_kw * (1 - eclipse_fraction) * (1 - shadowing_loss);
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
  
  // 3. Coolant freeze during eclipse
  // If in eclipse and temp drops below -20°C, coolant can freeze
  if (state.eclipse_fraction > 0.1 && state.temp_radiator_C < -20 && !state.coolant_frozen) {
    const freeze_probability = 0.01 * state.eclipse_fraction; // Higher probability in longer eclipses
    if (Math.random() < freeze_probability) {
      failureState.coolant_frozen = true;
      failureState.coolant_freeze_ticks_remaining = Math.floor(2 + Math.random() * 4); // 2-6 hours
    }
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
  
  // 1. Calculate heat generation
  const heatGen_kw = calculateHeatGeneration(state.power_total_kw);
  
  // 2. Calculate heat rejection (with damaged radiator)
  const heatReject_kw = calculateHeatRejection(
    effective_radiator_area,
    state.emissivity,
    state.temp_radiator_C,
    state.eclipse_fraction,
    state.shadowing_loss
  );
  
  // 3. Calculate net heat flow
  const net_heat_flow_kw = heatGen_kw - heatReject_kw;
  
  // 4. Calculate active cooling (power-cooling coupling)
  // Active cooling disabled if coolant is frozen
  let active_cooling_kw = 0;
  if (!coolant_frozen) {
    active_cooling_kw = Math.min(
      net_heat_flow_kw * ACTIVE_COOLING_EFFICIENCY * pump_failure_multiplier,
      state.power_total_kw * MAX_ACTIVE_COOLING_FRACTION
    );
  }
  const active_cooling_kw_clamped = Math.max(0, active_cooling_kw);
  
  // 5. Update temperature based on net heat flow
  const effective_net_heat = net_heat_flow_kw - active_cooling_kw_clamped;
  const temp_change_C = (effective_net_heat * 3600 * dt_hours) / state.thermal_mass_J_per_C;
  const new_temp_core_C = state.temp_core_C + temp_change_C;
  
  // 6. Thermal throttling
  let compute_effective_flops = state.compute_raw_flops;
  let new_failure_rate = state.failure_rate;
  
  if (new_temp_core_C > MAX_OPERATING_TEMP_C) {
    // Throttle compute based on temperature
    const throttle_factor = MAX_OPERATING_TEMP_C / new_temp_core_C;
    compute_effective_flops = state.compute_raw_flops * throttle_factor;
    
    // Increase failure rate when overheated
    const hours_overheated = dt_hours;
    new_failure_rate += 0.005 * hours_overheated;
  }
  
  // 7. Backhaul as hard competing bottleneck (NO STATIC CLAMP)
  // compute_exportable = min(compute_effective, backhaul_capacity)
  const backhaul_compute_capacity = state.backhaul_tbps * FLOPS_PER_TBPS;
  const compute_exportable_flops = Math.min(
    compute_effective_flops,
    backhaul_compute_capacity
  );
  
  // 8. Calculate utilization metrics
  const power_utilization_percent = state.power_total_kw > 0 
    ? ((state.power_total_kw - active_cooling_kw_clamped) / state.power_total_kw) * 100
    : 0;
  
  const thermal_drift_C_per_hr = temp_change_C / dt_hours;
  
  const radiator_utilization_percent = heatReject_kw > 0 && heatGen_kw > 0
    ? (heatReject_kw / heatGen_kw) * 100
    : 0;
  
  const backhaul_utilization_percent = state.backhaul_tbps > 0
    ? (compute_exportable_flops / (state.backhaul_tbps * FLOPS_PER_TBPS)) * 100
    : 0;
  
  const manufacturing_utilization_percent = state.manufacturing_rate_pods_per_year > 0
    ? 100 // Assume always at capacity for now
    : 0;
  
  const maintenance_utilization_percent = state.maintenance_capacity_pods > 0
    ? (state.degraded_pods / state.maintenance_capacity_pods) * 100
    : 0;
  
  // 9. Maintenance debt loop
  const pods_repaired = Math.min(state.degraded_pods, state.maintenance_capacity_pods);
  const new_degraded_pods = Math.max(0, state.degraded_pods + (new_failure_rate * state.power_total_kw / 10) - pods_repaired);
  
  let new_global_efficiency = state.global_efficiency || 1.0;
  if (new_degraded_pods > state.maintenance_capacity_pods) {
    new_global_efficiency *= 0.97; // 3% efficiency loss per year when maintenance overwhelmed
  }
  
  const maintenance_debt = new_degraded_pods;
  
  // 10. Calculate sustained compute (where net_heat_flow → 0 and failure_rate → maintenance_capacity)
  // This is the theoretical maximum where system is in thermal equilibrium
  const sustained_compute_flops = state.compute_raw_flops * new_global_efficiency;
  
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
  
  // Estimate thermal mass (J/°C) - roughly 1 MJ per kW of power
  const thermal_mass_J_per_C = totalPower_kw * 1e6;
  
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
  };
  
  // Run one thermal update to initialize computed values
  return updateThermalState(initialState, 0.1, year); // Small initial step
}

