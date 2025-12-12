/**
 * Thermal Physics Module
 * 
 * Implements physics-based thermal calculations:
 * - Radiator utilization from actual power and capacity
 * - Thermal-limited compute
 * - Temperature response to overload
 */

export interface ThermalState {
  radiatorArea_m2: number;
  radiator_kw_per_m2: number;
  power_total_kw: number;
  temp_core_C: number;
  temp_radiator_C: number;
  heatCeiling: number;
}

// Watts per PFLOP of sustained load (configurable)
const WATTS_PER_PFLOP = 10_000; // 10kW per PFLOP

/**
 * Compute radiator utilization as heat generation / thermal capacity
 * Returns utilization as a percentage (0-100+)
 * CRITICAL FIX: Use heat generation, not total power
 */
export function computeRadiatorUtilization(
  radiatorArea_m2: number,
  radiator_kw_per_m2: number,
  heatGen_kw: number // FIXED: Use heat generation, not power_total_kw
): number {
  const thermalCapacityKw = radiatorArea_m2 * radiator_kw_per_m2; // kW
  if (thermalCapacityKw <= 0) return 0;

  const utilization = heatGen_kw / thermalCapacityKw; // dimensionless
  // Convert to % for debug/plots
  // CRITICAL: Cap at reasonable maximum for reporting, but allow >100% to indicate overload
  return Math.min(utilization * 100, 10000); // Cap at 10000% for reporting
}

/**
 * Compute thermal-limited compute capacity
 * Returns maximum compute in PFLOPs given thermal constraints
 */
export function computeThermalLimitedCompute(
  radiatorArea_m2: number,
  radiator_kw_per_m2: number
): number {
  const thermalCapacityKw = radiatorArea_m2 * radiator_kw_per_m2;
  const maxThermalComputePf = (thermalCapacityKw * 1000) / WATTS_PER_PFLOP;
  return maxThermalComputePf;
}

/**
 * Update temperatures based on thermal overload using Stefan-Boltzmann law
 * CRITICAL FIX: Calculate from heat balance, ensure T_core > T_radiator
 * Per audit: Use Stefan-Boltzmann to calculate radiator temperature from heat rejection
 */
export function updateThermalTemperatures(
  state: ThermalState,
  utilization_percent: number,
  heatReject_kw: number // CRITICAL: Pass actual heat rejection, not just utilization
): { temp_core_C: number; temp_radiator_C: number } {
  const STEFAN_BOLTZMANN = 5.67e-8;  // W/m²·K⁴
  const EMISSIVITY = 0.9;
  const T_SINK_K = 200;  // effective space sink (accounts for Earth IR) = -73°C
  
  // CRITICAL FIX: Calculate radiator temperature from heat balance using Stefan-Boltzmann
  // Q = ε × σ × A × (T_rad⁴ - T_sink⁴)
  // Solving for T_rad: T_rad = [Q/(ε×σ×A) + T_sink⁴]^(1/4)
  if (state.radiatorArea_m2 > 0 && heatReject_kw > 0) {
    const q_per_m2 = (heatReject_kw * 1000) / state.radiatorArea_m2;  // W/m²
    const T_rad_K = Math.pow(
      q_per_m2 / (EMISSIVITY * STEFAN_BOLTZMANN) + Math.pow(T_SINK_K, 4),
      0.25
    );
    const temp_radiator_C = T_rad_K - 273.15;
    
    // CRITICAL: Core must be warmer than radiator for heat to flow
    // Typical heat pipe ΔT is 10-30K depending on design
    const DELTA_T_INTERFACE = 15; // °C temperature drop from core to radiator
    const temp_core_C = temp_radiator_C + DELTA_T_INTERFACE;
    
    return { temp_core_C, temp_radiator_C };
  }
  
  // CRITICAL FIX: Fallback should still respect thermodynamics
  // Even at zero load, radiator should be above ambient (not -60°C)
  // Minimum operating temperature: ~20°C (above deep space ~3K, accounting for Earth IR)
  const util = utilization_percent / 100; // 1.0 == design point
  const baseCore = 60;     // °C at design load
  const baseRad = 40;      // °C radiator at design
  const overload = Math.max(0, util - 1);

  // Very rough model: core heats as overload^0.7
  let temp_core_C = baseCore + 25 * Math.pow(overload, 0.7);
  let temp_radiator_C = baseRad + 15 * Math.pow(overload, 0.5);
  
  // CRITICAL: Ensure minimum operating temperatures (not cold soak)
  // Radiator must be above ambient to reject heat
  const MIN_RADIATOR_TEMP_C = 20; // Minimum operating temperature (above ambient)
  const MIN_CORE_TEMP_C = 30; // Minimum core temperature (above radiator)
  temp_radiator_C = Math.max(temp_radiator_C, MIN_RADIATOR_TEMP_C);
  temp_core_C = Math.max(temp_core_C, temp_radiator_C + 10); // Ensure core > radiator
  
  // CRITICAL: Ensure core > radiator (thermodynamic requirement)
  if (temp_core_C <= temp_radiator_C) {
    temp_core_C = temp_radiator_C + 10; // Force minimum 10°C difference
  }

  return { temp_core_C, temp_radiator_C };
}

/**
 * Apply thermal derating to compute if temperature exceeds heat ceiling
 * Returns derate factor (0-1) to apply to compute
 */
export function computeThermalDerate(
  temp_core_C: number,
  heatCeiling: number
): number {
  if (temp_core_C <= heatCeiling) {
    return 1.0; // No derating
  }

  const over = temp_core_C - heatCeiling;
  const derateFactor = Math.max(0.3, 1 - over / 40); // Derate down to 30%
  return derateFactor;
}

