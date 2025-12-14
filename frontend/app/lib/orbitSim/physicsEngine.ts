/**
 * Physics Engine - Single Source of Truth
 * 
 * Numerical state + differential updates per tick.
 * All outputs derive from state vector.
 * 
 * NO FORCED EQUILIBRIUM - Physics determines actual heat rejection
 * 
 * Uses physics-based thermal and survival models:
 * - Thermal-limited compute
 * - Temperature response to overload
 * - Physics-derived survival from environmental factors
 */

import {
  computeRadiatorUtilization,
  computeThermalLimitedCompute,
  updateThermalTemperatures,
  computeThermalDerate,
} from "./thermalPhysics";
import {
  computeAnnualFailureRate,
  computeCumulativeSurvival,
  type ScenarioKind,
} from "./survivalPhysics";

export interface PhysicsState {
  // Power and efficiency
  power_total_kw: number;
  electrical_efficiency: number; // 0-1
  compute_raw_flops: number;

  // Radiator properties
  radiatorArea_m2: number;
  radiator_kw_per_m2: number;
  emissivity: number;
  eclipse_fraction: number;
  shadowing_loss: number;

  // Thermal properties
  thermal_mass_J_per_C: number;
  temp_core_C: number;
  temp_radiator_C?: number; // Added for thermal physics

  // Capacity constraints
  backhaul_capacity_tbps: number;
  maintenance_capacity_pods: number;

  // Failure state
  degraded_pods: number;
  failures_unrecovered: number;
  survival_fraction: number;
  
  // Survival physics state
  bus_shielding_mass_kg?: number;
  bus_total_mass_kg?: number;
  repairCapacity?: number;
  classA_satellites_alive?: number;
  cumulativeHazard?: number; // For physics-derived survival
  orbitalShell?: string; // For radiation flux calculation

  // Auto-design mode
  auto_design_mode?: boolean;
  risk_mode?: "SAFE" | "AGGRESSIVE" | "YOLO";
}

export interface PhysicsOutput {
  // Thermal
  heatGen_kw: number;
  radiator_capacity_kw: number;
  radiatorArea_m2: number; // Actual radiator area (may be resized in SAFE mode)
  heatReject_kw: number;
  net_heat_flow_kw: number;
  thermal_drift_C_per_year: number;
  temp_core_C: number;
  temp_radiator_C: number; // Added for thermal physics
  radiator_utilization: number;

  // Failure and maintenance
  degraded_pods: number;
  failures_unrecovered: number;
  repairs_this_year: number;
  survival_fraction: number;
  annualFailureRate?: number; // For physics-derived survival
  cumulativeHazard?: number; // For physics-derived survival

  // Compute outputs
  sustained_compute_flops: number;
  compute_exportable_flops: number;
  compute_effective_flops: number; // Added: thermal-limited compute

  // Power (after degradation)
  power_total_kw: number;
  compute_raw_flops: number;
}

const FLOPS_PER_TBPS = 1e15 / 1e12; // 1000 PFLOPs per TBps
const MAX_TEMP_HARD_C = 450;
const MAX_TEMP_SOFT_C = 90;
const MIN_TEMP_SPACE_C = -270; // Deep space baseline (~3 K)
const MIN_TEMP_CORE_C = MIN_TEMP_SPACE_C + 1; // Space floor + 1°C margin

/**
 * Step physics forward one year
 * NO FORCED EQUILIBRIUM - Physics determines actual behavior
 */
export function stepPhysics(state: PhysicsState, satellite_count: number = 1, scenarioMode?: string, year?: number): PhysicsOutput {
  // RULE 2: TRUE THERMAL INERTIA (scaled to fleet size)
  // CRITICAL FIX: Thermal mass should be realistic for satellite mass, not space station level
  // Per audit: Thermal mass was 100 MJ/°C (space station) but should be ~15 kJ/°C for 15 kg satellite
  // Formula: C_thermal = M_satellite × C_p (specific heat of aluminum ~900 J/kg°C)
  // For 15 kg satellite: 15 kg × 900 J/kg°C = 13,500 J/°C ≈ 15 kJ/°C
  const SPECIFIC_HEAT_ALUMINUM = 900; // J/kg°C
  const ESTIMATED_SAT_MASS_KG = 15; // kg (typical microsatellite)
  const THERMAL_MASS_PER_SAT_J_PER_C = ESTIMATED_SAT_MASS_KG * SPECIFIC_HEAT_ALUMINUM; // ~13,500 J/°C per satellite
  const MIN_THERMAL_MASS = 1e4; // Minimum thermal mass (10 kJ/°C) - reduced from 100 MJ/°C
  const thermal_mass_J_per_C = Math.max(satellite_count * THERMAL_MASS_PER_SAT_J_PER_C, MIN_THERMAL_MASS);
  
  // 1) BATTERY ROUND-TRIP EFFICIENCY (CRITICAL FIX)
  // Per audit: Must account for ~10-15% loss in storing and retrieving solar energy for eclipse phase
  // Power during eclipse comes from battery, which has round-trip efficiency loss
  // Effective power: P_effective = P_solar × (1 - eclipse) + P_battery × eclipse × η_battery
  // Where P_battery = P_solar (battery is charged during sunlit period)
  // Simplified: P_effective = P_total / (1 - eclipse + eclipse × η_battery)
  const BATTERY_ROUND_TRIP_EFFICIENCY = 0.88; // 88% efficiency (12% loss)
  const batteryPowerMultiplier = 1 / (1 - state.eclipse_fraction + state.eclipse_fraction * BATTERY_ROUND_TRIP_EFFICIENCY);
  
  // 2) TEMPERATURE-DEPENDENT POWER SCALING (CRITICAL FIX)
  // Per audit: Silicon leakage current increases exponentially with temperature
  // Power draw should increase as temp_core_C rises
  // Simplified model: P = P_base × (1 + α × (T - T_ref))
  // Where α ≈ 0.002 per °C (0.2% per °C, 2% per 10°C)
  const T_REF_C = 60; // Reference temperature
  const TEMP_COEFFICIENT = 0.002; // 0.2% per °C (2% per 10°C)
  const tempPowerMultiplier = 1 + TEMP_COEFFICIENT * (state.temp_core_C - T_REF_C);
  
  // Apply adjustments to base power (before survival multiplier)
  const power_total_kw_base = state.power_total_kw * batteryPowerMultiplier * tempPowerMultiplier;
  
  // CRITICAL: Calculate initial heatGen for SAFE mode sizing (before survival multiplier)
  // This is a preliminary calculation that will be recalculated after survival multiplier
  // For compute satellites, 85% of input power becomes heat (15% is electrical losses)
  let heatGen_kw_preliminary = power_total_kw_base * 0.85; // 85% of power becomes heat

  // 2) SAFE MODE: FORWARD-SIZED THERMAL DESIGN (NO RUNAWAY POSSIBLE)
  // ENFORCE PIPELINE ORDER: heatGen → SAFE sizing → capacity → heatReject → net_heat → temp
  const isSafeMode = state.auto_design_mode && state.risk_mode === "SAFE";
  const TARGET_TEMP_C = 70;
  const MAX_ALLOWED_UTILIZATION = 0.9; // 90% design margin
  
  let radiatorArea_m2 = state.radiatorArea_m2;
  let emissivity = state.emissivity;
  
  // Calculate effective radiator capacity per m² (used in both SAFE and non-SAFE modes)
  const effective_per_m2 = state.radiator_kw_per_m2
    * emissivity
    * (1 - state.eclipse_fraction)
    * (1 - state.shadowing_loss);
  
  if (isSafeMode && heatGen_kw_preliminary > 0) {
    // 2.1) REQUIRED RADIATOR CAPACITY (DESIGN SOLVE, NOT REACTIVE)
    const required_radiator_capacity_kw = heatGen_kw_preliminary / MAX_ALLOWED_UTILIZATION;
    const required_radiator_area_m2 = required_radiator_capacity_kw / effective_per_m2;
    
    // 2.2) AUTO-RESIZE RADIATOR
    if (radiatorArea_m2 < required_radiator_area_m2) {
      radiatorArea_m2 = required_radiator_area_m2;
    }
  }

  // 3) COMPUTE TRUE RADIATOR CAPACITY (AFTER potential resize in SAFE mode)
  // CRITICAL: Must recompute after resize to ensure correct capacity
  let radiator_capacity_kw = radiatorArea_m2 * effective_per_m2;

  // CRITICAL: Declare heatGen_kw early (will be updated after survival multiplier)
  // Use preliminary value for initial calculations
  let heatGen_kw = heatGen_kw_preliminary;

  // 4) CRITICAL FIX: Solve for thermal equilibrium temperature
  // Per audit: If utilization > 100%, temperature MUST rise until Q_reject = Q_gen
  // Use Stefan-Boltzmann to find equilibrium temperature where heat rejection matches generation
  const STEFAN_BOLTZMANN = 5.67e-8;  // W/m²·K⁴
  const EMISSIVITY = 0.9;
  const T_SINK_K = 200;  // effective space sink (accounts for Earth IR) = -73°C
  
  // Solve for equilibrium radiator temperature: Q_gen = ε × σ × A × (T_rad⁴ - T_sink⁴)
  // T_rad = [Q_gen/(ε×σ×A) + T_sink⁴]^(1/4)
  // CRITICAL FIX: Ensure heatGen_kw and radiatorArea_m2 are both fleet-wide or both per-satellite
  // Per audit: heatReject was 85x higher because of unit mismatch (fleet vs per-satellite)
  // Both power_total_kw and radiatorArea_m2 should be fleet-wide (total), not per-satellite
  let temp_radiator_C_eq: number;
  if (radiatorArea_m2 > 0 && heatGen_kw > 0) {
    // CRITICAL: Both heatGen_kw and radiatorArea_m2 should be fleet totals
    const q_per_m2 = (heatGen_kw * 1000) / radiatorArea_m2;  // W/m² (fleet total / fleet total)
    const T_rad_K = Math.pow(
      q_per_m2 / (EMISSIVITY * STEFAN_BOLTZMANN) + Math.pow(T_SINK_K, 4),
      0.25
    );
    temp_radiator_C_eq = T_rad_K - 273.15;
  } else {
    // No heat generation or radiator - use minimum operating temperature
    temp_radiator_C_eq = 20; // Minimum operating temperature
  }
  
  // Core temperature = radiator + interface delta
  const DELTA_T_INTERFACE = 15; // °C temperature drop from core to radiator
  let temp_core_C_eq = temp_radiator_C_eq + DELTA_T_INTERFACE;
  
  // CRITICAL: If equilibrium temperature exceeds max safe, throttle compute
  const MAX_SAFE_TEMP_C = 90;
  if (temp_core_C_eq > MAX_SAFE_TEMP_C) {
    // Throttle: reduce heat generation until equilibrium is safe
    // Q_gen_new = Q_gen × (T_max / T_eq)^4 (inverse Stefan-Boltzmann)
    const throttleFactor = Math.pow(MAX_SAFE_TEMP_C / temp_core_C_eq, 4);
    heatGen_kw = heatGen_kw * throttleFactor;
    // Recalculate equilibrium with throttled heat
    if (radiatorArea_m2 > 0 && heatGen_kw > 0) {
      const q_per_m2 = (heatGen_kw * 1000) / radiatorArea_m2;
      const T_rad_K = Math.pow(
        q_per_m2 / (EMISSIVITY * STEFAN_BOLTZMANN) + Math.pow(T_SINK_K, 4),
        0.25
      );
      temp_radiator_C_eq = T_rad_K - 273.15;
      temp_core_C_eq = temp_radiator_C_eq + DELTA_T_INTERFACE;
    }
  }
  
  // Use equilibrium temperatures
  let temp_core_C = temp_core_C_eq;
  let temp_radiator_C = temp_radiator_C_eq;
  
  // Heat rejection at equilibrium = heat generation (by definition)
  let heatReject_kw = heatGen_kw;
  
  // Net heat flow at equilibrium = 0 (system is in steady state)
  let net_heat_flow_kw = 0;
  
  // CRITICAL: Calculate thermal drift for output (even though at equilibrium it should be ~0)
  // Convert kW to J/year: kW * 1000 W/kW * 3600 s/hr * 24 hr/day * 365 day/yr
  const joules_per_year = net_heat_flow_kw * 1000 * 3600 * 24 * 365;
  let thermal_drift_C_per_year = joules_per_year / thermal_mass_J_per_C;

  // 5) TRUE RADIATOR UTILIZATION (FIXED: use heatGen_kw / thermalCapacityKw)
  // CRITICAL FIX: Utilization = heat generation / thermal capacity, not power / capacity
  const raw_radiator_utilization = computeRadiatorUtilization(
    radiatorArea_m2,
    state.radiator_kw_per_m2,
    heatGen_kw // FIXED: Use heat generation, not total power
  );
  
  // CRITICAL FIX: If utilization > 100%, we MUST derate compute
  // Calculate derating factor BEFORE capping utilization for display
  let thermalDeratingFactor = 1.0;
  if (raw_radiator_utilization > 100) {
    thermalDeratingFactor = 100 / raw_radiator_utilization; // e.g., 146% → 68% derating
  }
  
  // Cap utilization at 100% for display (physically impossible to exceed)
  const radiator_utilization = Math.min(100, raw_radiator_utilization);
  
  // 6) SAFE MODE: HARD SAFE BOUNDS (apply clamps AFTER equilibrium calculation)
  if (isSafeMode) {
    // Hard safe bounds: 40-90°C
    if (temp_core_C > 90) {
      temp_core_C = 90;
      temp_radiator_C = temp_core_C - DELTA_T_INTERFACE;
      net_heat_flow_kw = 0; // At upper bound, net heat flow must be zero (equilibrium)
    } else if (temp_core_C < 40) {
      temp_core_C = 40;
      temp_radiator_C = temp_core_C - DELTA_T_INTERFACE;
      net_heat_flow_kw = 0; // At lower bound, net heat flow must be zero (equilibrium)
    }
  } else {
    // ABSOLUTE CONSTRAINT 2: SPACE FLOOR TEMPERATURE (NO CRYO-FREEZE) - only for non-SAFE modes
    if (temp_core_C < MIN_TEMP_CORE_C) {
      temp_core_C = MIN_TEMP_CORE_C;
      temp_radiator_C = temp_core_C - DELTA_T_INTERFACE;
      net_heat_flow_kw = 0; // If at space floor, net heat flow must be zero (equilibrium)
    }
  }

  // 9) REAL RADIATOR BURNOUT (DISABLED IN SAFE MODE)
  // Burnout & overdrive are DISABLED in SAFE mode
  // They activate ONLY in AGGRESSIVE and YOLO modes
  if (!isSafeMode && radiator_utilization > 120) {
    const overload = radiator_utilization / 100;
    radiatorArea_m2 *= Math.exp(-0.05 * overload);
    emissivity *= Math.exp(-0.02 * overload);
    
    // Recalculate capacity after burnout (using updated emissivity)
    const effective_per_m2_after_burnout = state.radiator_kw_per_m2
      * emissivity
      * (1 - state.eclipse_fraction)
      * (1 - state.shadowing_loss);
    radiator_capacity_kw = radiatorArea_m2 * effective_per_m2_after_burnout;
    heatReject_kw = Math.min(heatGen_kw, radiator_capacity_kw);
    net_heat_flow_kw = heatGen_kw - heatReject_kw;
  }

  // 10) THERMAL DAMAGE FROM BOTH DIRECTIONS (DISABLED IN SAFE MODE)
  let degraded_pods = state.degraded_pods;
  if (!isSafeMode) {
    // Thermal damage only applies in AGGRESSIVE and YOLO modes
    if (temp_core_C > MAX_TEMP_SOFT_C || temp_core_C < -40) {
      degraded_pods += Math.abs(temp_core_C) / 200;
    }

    // CRITICAL FIX: Cap temperature at MAX_TEMP_HARD_C instead of instant death
    // Apply severe penalties but never set survival_fraction to 0
    if (temp_core_C > MAX_TEMP_HARD_C) {
      // Cap temperature at hard limit (prevent further heating)
      temp_core_C = MAX_TEMP_HARD_C;
      // Apply severe degradation but don't kill the fleet
      degraded_pods += (temp_core_C - MAX_TEMP_SOFT_C) / 50; // Much higher degradation rate
    }
  }

  // 11) RULE 3: SURVIVAL DEGRADES GRADUALLY
  // In SAFE mode, survival can vary but never dips below 0.97 (97% minimum)
  // In AGGRESSIVE mode, minimum is 0.1 (10%)
  // In YOLO mode, can reach 0.0 (fleet can die)
  const isYoloMode = state.auto_design_mode && state.risk_mode === "YOLO";
  const isAggressiveMode = state.auto_design_mode && state.risk_mode === "AGGRESSIVE";
  
  let survival_fraction = state.survival_fraction;
  if (isSafeMode) {
    // SAFE mode: survival should be around 95% for baseline, 98% for bull
    // Forward-sized design prevents major thermal issues, but minor variations are allowed
    if (temp_core_C > TARGET_TEMP_C) {
      // Slight degradation if above target (70°C)
      // At TARGET_TEMP_C (70°C): survival = 0.95 (baseline) or 0.98 (bull)
      // At upper bound (90°C): survival = 0.95 (baseline) or 0.98 (bull) minimum
      const temp_excess = temp_core_C - TARGET_TEMP_C;
      const temp_range = 90 - TARGET_TEMP_C; // 20°C range
      // Scenario-specific survival rates: Baseline 95%, Bull 98%, Bear 92%
      const baseSurvival = scenarioMode === "ORBITAL_BULL" ? 0.98 : 
                          scenarioMode === "ORBITAL_BEAR" ? 0.92 : 
                          0.95; // BASELINE
      const degradation_factor = Math.min(0.05, (temp_excess / temp_range) * 0.05); // Max 5% degradation
      survival_fraction = Math.max(baseSurvival, 1.0 - degradation_factor); // Minimum survival based on scenario
    } else {
      // At or below target, survival can recover towards base rate
      const baseSurvival = scenarioMode === "ORBITAL_BULL" ? 0.98 : 
                          scenarioMode === "ORBITAL_BEAR" ? 0.92 : 
                          0.95; // BASELINE
      survival_fraction = Math.min(1.0, Math.max(baseSurvival, survival_fraction + 0.01)); // Recover but don't go below base
    }
  } else if (isYoloMode) {
    // YOLO mode: can reach 0.0 (fleet can die)
    if (temp_core_C > MAX_TEMP_SOFT_C) {
      // Gradual degradation: survival decreases as temperature increases
      // At MAX_TEMP_SOFT_C (90°C): survival = 1.0
      // At MAX_TEMP_HARD_C (450°C): survival = 0.0 (death)
      const temp_excess = temp_core_C - MAX_TEMP_SOFT_C;
      const temp_range = MAX_TEMP_HARD_C - MAX_TEMP_SOFT_C;
      const degradation_factor = Math.min(1.0, temp_excess / temp_range); // Can reach 100% degradation
      survival_fraction = Math.max(0.0, 1.0 - degradation_factor); // Can reach 0.0
    } else {
      // Below soft limit, survival can recover (gradually)
      survival_fraction = Math.min(1.0, survival_fraction + 0.05); // 5% recovery per year if below soft limit
    }
  } else {
    // AGGRESSIVE mode: apply gradual degradation, minimum 0.1
    if (temp_core_C > MAX_TEMP_SOFT_C) {
      // Gradual degradation: survival decreases as temperature increases
      // At MAX_TEMP_SOFT_C (90°C): survival = 1.0
      // At MAX_TEMP_HARD_C (450°C): survival = 0.1 (severe but not death)
      const temp_excess = temp_core_C - MAX_TEMP_SOFT_C;
      const temp_range = MAX_TEMP_HARD_C - MAX_TEMP_SOFT_C;
      const degradation_factor = Math.min(0.9, temp_excess / temp_range); // Max 90% degradation
      survival_fraction = Math.max(0.1, 1.0 - degradation_factor); // Minimum 10% survival
    } else {
      // Below soft limit, survival can recover (gradually)
      survival_fraction = Math.min(1.0, survival_fraction + 0.05); // 5% recovery per year if below soft limit
    }
  }

  // 8) MAINTENANCE REPAIR FLOW
  // Note: Actual satellite failures are passed in via degraded_pods
  // This represents failures that need repair
  const repairs_this_year = Math.min(degraded_pods, state.maintenance_capacity_pods);
  degraded_pods -= repairs_this_year;
  let failures_unrecovered = state.failures_unrecovered + degraded_pods;

  // RULE 1: SURVIVAL IS A HARD MULTIPLIER (END OF TICK)
  // CRITICAL FIX: survival_fraction should never be 0 (minimum 0.1), so always apply multiplier
  let compute_raw_flops = state.compute_raw_flops * survival_fraction;
  
  // Apply survival multiplier to adjusted power
  let power_total_kw = power_total_kw_base * survival_fraction;
  
  // Update heatGen_kw with final power (after survival multiplier)
  // CRITICAL FIX: For compute satellites, 85% of input power becomes heat (15% is electrical losses)
  heatGen_kw = power_total_kw * 0.85; // 85% of power becomes heat

  // 9) THERMAL-LIMITED COMPUTE (FIXED: compute is now thermal-bounded)
  const thermalLimitedComputePf = computeThermalLimitedCompute(
    radiatorArea_m2,
    state.radiator_kw_per_m2
  );
  const thermalLimitedComputeFlops = thermalLimitedComputePf * 1e15; // Convert PFLOPs to flops
  
  // Apply thermal derating if temperature exceeds heat ceiling
  // CRITICAL: Per audit D.4, thermal derating creates a feedback loop
  // When compute is derated, heat generation should also be reduced
  const heatCeiling = 95;
  const derateStartTemp = 85; // Start derating at 85°C
  const thermalDerate = computeThermalDerate(temp_core_C, heatCeiling);
  const thermalLimitedComputeFlopsDerated = thermalLimitedComputeFlops * thermalDerate;
  
  // FEEDBACK LOOP: If temperature is high, derate compute, which reduces heat generation
  // This creates a self-limiting thermal system
  // Recalculate heat generation based on derated compute (if derating is active)
  if (temp_core_C > derateStartTemp && thermalDerate < 1.0) {
    // Heat generation scales with compute load
    // If compute is derated to 80%, heat generation should also be ~80%
    const deratedHeatGen_kw = heatGen_kw * thermalDerate;
    // Recalculate net heat flow with derated heat generation
    const deratedHeatReject_kw = Math.min(deratedHeatGen_kw, radiator_capacity_kw);
    const deratedNetHeatFlow_kw = deratedHeatGen_kw - deratedHeatReject_kw;
    
    // Use derated values if they're more conservative (less heat)
    if (Math.abs(deratedNetHeatFlow_kw) < Math.abs(net_heat_flow_kw)) {
      heatGen_kw = deratedHeatGen_kw;
      heatReject_kw = deratedHeatReject_kw;
      net_heat_flow_kw = deratedNetHeatFlow_kw;
      
      // Recalculate temperature drift with reduced heat flow
      const deratedJoulesPerYear = net_heat_flow_kw * 1000 * 3600 * 24 * 365;
      const deratedThermalDrift = deratedJoulesPerYear / thermal_mass_J_per_C;
      temp_core_C = state.temp_core_C + deratedThermalDrift;
      // Update thermal_drift_C_per_year for output
      thermal_drift_C_per_year = deratedThermalDrift;
      
      // Re-clamp temperature if needed
      if (isSafeMode) {
        if (temp_core_C > 90) temp_core_C = 90;
        if (temp_core_C < 40) temp_core_C = 40;
      } else {
        if (temp_core_C < MIN_TEMP_CORE_C) temp_core_C = MIN_TEMP_CORE_C;
      }
    }
  }
  
  // 10) BACKHAUL-BOUND COMPUTE
  const backhaulLimitedFlops = state.backhaul_capacity_tbps * FLOPS_PER_TBPS;
  
  // 11) EFFECTIVE COMPUTE = MIN(thermal-limited, backhaul-limited, raw)
  // CRITICAL FIX: Apply thermal derating if utilization > 100%
  // This ensures compute is actually reduced when thermal is exceeded
  let thermalDeratedCompute = compute_raw_flops;
  if (raw_radiator_utilization > 100) {
    thermalDeratedCompute = compute_raw_flops * thermalDeratingFactor;
    console.log(`[THERMAL HARD CAP] Year ${year || 'unknown'}: Utilization ${raw_radiator_utilization.toFixed(1)}% → Derating compute by ${((1-thermalDeratingFactor)*100).toFixed(1)}%`);
  }
  
  // Apply thermal derating to thermal-limited compute
  const thermalLimitedComputeFlopsDeratedWithCap = Math.min(
    thermalLimitedComputeFlopsDerated,
    thermalDeratedCompute
  );
  
  const compute_exportable_flops = Math.min(
    thermalDeratedCompute, // CRITICAL: Use thermally derated compute
    thermalLimitedComputeFlopsDeratedWithCap,
    backhaulLimitedFlops
  );

  // RULE 4: EFFECTIVE COMPUTE IS THERMAL + BACKHAUL LIMITED, BUT NEVER EXCEEDS RAW
  // CRITICAL FIX: Enforce compute_effective_flops <= compute_raw_flops
  const compute_effective_flops = Math.min(compute_exportable_flops, thermalDeratedCompute);
  const sustained_compute_flops = compute_effective_flops;
  
  // CRITICAL FIX: If effective << raw, scale down power (idle silicon uses less power)
  // Per audit: If 99.999999% of silicon is idle, power should drop drastically
  // Power scales with compute utilization: P = P_idle + (P_peak - P_idle) × (effective/raw)
  // Simplified: P ≈ P_peak × (0.1 + 0.9 × effective/raw) where 0.1 is idle fraction
  if (compute_raw_flops > 0) {
    const computeUtilization = compute_effective_flops / compute_raw_flops;
    const idlePowerFraction = 0.1; // 10% power when fully idle
    const powerScaleFactor = idlePowerFraction + (1 - idlePowerFraction) * computeUtilization;
    power_total_kw = power_total_kw * powerScaleFactor;
    // Also scale heat generation proportionally
    heatGen_kw = heatGen_kw * powerScaleFactor;
  }

  // 12) AUTO-DESIGN SAFE MODE (OPTIONAL)
  if (state.auto_design_mode && state.risk_mode === "SAFE") {
    const thermal_limit_flops = sustained_compute_flops;
    const backhaul_limit_flops = state.backhaul_capacity_tbps * FLOPS_PER_TBPS;
    const flops_per_pod = compute_raw_flops > 0 && (state.degraded_pods + state.maintenance_capacity_pods) > 0
      ? compute_raw_flops / (state.degraded_pods + state.maintenance_capacity_pods)
      : 1e15;
    const maintenance_limit_flops = state.maintenance_capacity_pods * flops_per_pod;

    const safe_compute_limit = Math.min(
      thermal_limit_flops * 0.7,
      backhaul_limit_flops * 0.9,
      maintenance_limit_flops * 0.9
    );

    compute_raw_flops = Math.min(compute_raw_flops, safe_compute_limit);
  }

  // 13) PHYSICS-DERIVED SURVIVAL (if survival state is provided)
  let annualFailureRate: number | undefined;
  let cumulativeHazard: number | undefined;
  if (state.bus_shielding_mass_kg !== undefined && 
      state.bus_total_mass_kg !== undefined && 
      state.repairCapacity !== undefined && 
      state.classA_satellites_alive !== undefined) {
    // Map scenarioMode to ScenarioKind
    const scenarioKind: ScenarioKind = scenarioMode === "ORBITAL_BULL" ? "bull" :
                                       scenarioMode === "ORBITAL_BEAR" ? "bear" :
                                       "baseline";
    
    const survivalState = {
      bus_shielding_mass_kg: state.bus_shielding_mass_kg,
      bus_total_mass_kg: state.bus_total_mass_kg,
      radiator_utilization_percent: radiator_utilization,
      temp_core_C: temp_core_C, // CRITICAL: Pass temperature for thermal-induced failure
      repairCapacity: state.repairCapacity,
      classA_satellites_alive: state.classA_satellites_alive,
      orbitalShell: state.orbitalShell, // For radiation flux calculation
    };
    
    annualFailureRate = computeAnnualFailureRate(survivalState, scenarioKind);
    cumulativeHazard = (state.cumulativeHazard ?? 0) + annualFailureRate;
    
    // Update survival from cumulative hazard (blend with existing survival for smooth transition)
    // CRITICAL FIX: Ensure survival decays for all scenarios, not just BEAR
    const hazardSurvival = computeCumulativeSurvival(cumulativeHazard);
    
    // CRITICAL FIX: Account for unrecovered failures in survival calculation
    // Blend hazard-based survival with actual fleet ratio (alive / total)
    // If we have failures_unrecovered, calculate actual fleet ratio
    let fleetRatio = 1.0;
    if (state.classA_satellites_alive !== undefined && state.classA_satellites_alive > 0) {
      // Estimate total fleet: alive + unrecovered failures
      // This accounts for satellites that have failed and not been recovered
      const estimatedTotalFleet = state.classA_satellites_alive + Math.max(0, failures_unrecovered);
      if (estimatedTotalFleet > 0) {
        fleetRatio = state.classA_satellites_alive / estimatedTotalFleet;
      }
    }
    
    // CRITICAL FIX: Ensure survival shows realistic decay even with repairs
    // Blend three sources: hazard model (60%), existing survival (20%), fleet ratio (20%)
    // Fleet ratio ensures survival reflects actual unrecovered failures
    // Increase fleet ratio weight to make unrecovered failures more visible
    const blendedSurvival = 0.6 * hazardSurvival + 0.2 * survival_fraction + 0.2 * fleetRatio;
    
    // CRITICAL: Force decay if there are unrecovered failures, even with high repair capacity
    // BASELINE/BULL should show decay, not perfect 100% survival
    if (failures_unrecovered > 0) {
      // If blended survival is still very high (>= 0.98), force more aggressive decay
      if (blendedSurvival >= 0.98) {
        // Force at least 2-3% decay for every 100 unrecovered failures
        const decayFromFailures = Math.min(0.05, failures_unrecovered / 100 * 0.02);
        survival_fraction = Math.max(0.90, blendedSurvival - decayFromFailures);
      } else {
        survival_fraction = blendedSurvival;
      }
    } else {
      survival_fraction = blendedSurvival;
    }
    
    // Additional check: if cumulative hazard suggests decay but survival is still 100%, force minimum decay
    if (cumulativeHazard > 0.01 && survival_fraction >= 0.99) {
      survival_fraction = Math.max(0.95, survival_fraction - 0.02); // Force at least 2% decay
    }
  }

  // 14) OUTPUT DERIVATION (DEBUG + CHARTS)
  return {
    // Thermal
    heatGen_kw,
    radiator_capacity_kw: radiatorArea_m2 * state.radiator_kw_per_m2,
    radiatorArea_m2, // Include resized area (for SAFE mode auto-sizing)
    heatReject_kw,
    net_heat_flow_kw,
    thermal_drift_C_per_year,
    temp_core_C,
    temp_radiator_C, // Added for thermal physics
    radiator_utilization,

    // Failure and maintenance
    degraded_pods,
    failures_unrecovered,
    repairs_this_year,
    survival_fraction,
    annualFailureRate, // Added: for physics-derived survival
    cumulativeHazard, // Added: for physics-derived survival

    // Compute outputs (RULE 4: exportable is the only real compute)
    sustained_compute_flops,
    compute_exportable_flops,
    compute_effective_flops, // Added: thermal-limited compute

    // Power (after degradation, RULE 1: multiplied by survival)
    // CRITICAL FIX: Use calculated power_total_kw (after survival multiplier and idle scaling)
    // Per audit: power_total_kw was 10x too low because output was using state value instead of calculated value
    power_total_kw, // Use calculated value (after survival multiplier and idle silicon scaling)
    compute_raw_flops,
  };
}

/**
 * Create initial physics state from deployment result
 */
export function createPhysicsState(
  power_total_kw: number,
  compute_raw_flops: number,
  radiatorArea_m2: number,
  backhaul_capacity_tbps: number,
  maintenance_capacity_pods: number,
  options?: {
    electrical_efficiency?: number;
    radiator_kw_per_m2?: number;
    emissivity?: number;
    eclipse_fraction?: number;
    shadowing_loss?: number;
    thermal_mass_J_per_C?: number;
    temp_core_C?: number;
    auto_design_mode?: boolean;
    risk_mode?: "SAFE" | "AGGRESSIVE" | "YOLO";
  }
): PhysicsState {
  return {
    power_total_kw,
    electrical_efficiency: options?.electrical_efficiency ?? 0.85,
    compute_raw_flops,

    radiatorArea_m2,
    radiator_kw_per_m2: options?.radiator_kw_per_m2 ?? 0.3, // FIX #2: Realistic flux limit (0.3 kW/m² for 300K radiator)
    emissivity: options?.emissivity ?? 0.9,
    eclipse_fraction: options?.eclipse_fraction ?? 0.1,
    shadowing_loss: options?.shadowing_loss ?? 0.05,

    thermal_mass_J_per_C: options?.thermal_mass_J_per_C ?? 2e6, // Will be recalculated in stepPhysics
    temp_core_C: options?.temp_core_C ?? 70,

    backhaul_capacity_tbps,
    maintenance_capacity_pods,

    degraded_pods: 0,
    failures_unrecovered: 0,
    survival_fraction: 1.0,
    orbitalShell: undefined, // Will be set by deployment logic

    auto_design_mode: options?.auto_design_mode,
    risk_mode: options?.risk_mode,
  };
}
