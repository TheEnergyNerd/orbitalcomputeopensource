/**
 * Auto-Design Safety Module
 * 
 * Separates user sliders (intent) from actual design parameters.
 * Applies safety margins to prevent thermal death while allowing
 * risk modes (SAFE, AGGRESSIVE, YOLO) to override.
 */

import {
  TARGET_CORE_TEMP_C,
  MAX_CORE_TEMP_SOFT_C,
  MAX_CORE_TEMP_HARD_C,
  THERMAL_SAFETY_MARGIN_SAFE,
  THERMAL_SAFETY_MARGIN_AGGRESSIVE,
  BACKHAUL_SAFETY_MARGIN_SAFE,
  BACKHAUL_SAFETY_MARGIN_AGGRESSIVE,
  MAINT_SAFETY_MARGIN_SAFE,
  MAINT_SAFETY_MARGIN_AGGRESSIVE,
  FLOPS_PER_TBPS,
  type RiskMode,
  calculateHeatRejection,
} from "./thermalIntegration";

export interface UserSliders {
  slider_compute_scale: number; // 0-1
  slider_radiator_scale: number; // 0-1
  slider_backhaul_scale: number; // 0-1
  slider_maintenance_scale: number; // 0-1
}

export interface BaseDesignParams {
  base_compute_flops: number;
  base_radiator_area: number; // m²
  base_backhaul_tbps: number;
  base_maintenance_cap: number; // pods per year
}

export interface TargetDesignParams {
  target_compute_flops: number;
  target_radiator_area: number; // m²
  target_backhaul_tbps: number;
  target_maintenance_cap: number; // pods per year
}

/**
 * Derive target design parameters from user sliders
 * Sliders are intent only, not directly used in physics
 */
export function deriveTargetDesign(
  sliders: UserSliders,
  base: BaseDesignParams
): TargetDesignParams {
  // Simple linear scaling function (can be made more complex)
  const f = (scale: number) => 0.1 + scale * 0.9; // Maps 0-1 to 0.1-1.0 (never zero)
  
  return {
    target_compute_flops: base.base_compute_flops * f(sliders.slider_compute_scale),
    target_radiator_area: base.base_radiator_area * f(sliders.slider_radiator_scale),
    target_backhaul_tbps: base.base_backhaul_tbps * f(sliders.slider_backhaul_scale),
    target_maintenance_cap: base.base_maintenance_cap * f(sliders.slider_maintenance_scale),
  };
}

/**
 * Calculate sustained compute from radiators at target temperature
 */
function calculateSustainedComputeFromRadiators(
  radiatorArea_m2: number,
  emissivity: number,
  targetTemp_C: number,
  eclipse_fraction: number,
  shadowing_loss: number
): number {
  // Calculate heat rejection at target temperature
  const heatReject_kw = calculateHeatRejection(
    radiatorArea_m2,
    emissivity,
    targetTemp_C,
    eclipse_fraction,
    shadowing_loss
  );
  
  // Convert heat rejection to compute (assuming 95% heat generation efficiency)
  // heatGen = compute * 0.95, so compute = heatGen / 0.95
  // At equilibrium: heatGen = heatReject, so compute = heatReject / 0.95
  const compute_kw = heatReject_kw / 0.95;
  
  // Convert kW to FLOPS (rough approximation: 1 kW ≈ 100 PFLOPs)
  const compute_flops = compute_kw * 100 * 1e15; // Convert to FLOPS
  
  return compute_flops;
}

/**
 * Auto-design safety loop
 * Clamps compute to safe limits based on thermal, backhaul, and maintenance constraints
 */
export function applyAutoDesignSafety(
  target: TargetDesignParams,
  risk_mode: RiskMode,
  auto_design_mode: boolean,
  emissivity: number,
  eclipse_fraction: number,
  shadowing_loss: number,
  flops_per_pod: number = 1e15 // Default: 1 PFLOP per pod
): { safe_compute_flops: number; thermal_limit: number; backhaul_limit: number; maintenance_limit: number } {
  // If YOLO mode, skip safety clamp entirely
  if (risk_mode === "YOLO" || !auto_design_mode) {
    return {
      safe_compute_flops: target.target_compute_flops,
      thermal_limit: Infinity,
      backhaul_limit: Infinity,
      maintenance_limit: Infinity,
    };
  }
  
  // Get safety margins based on risk mode
  const thermal_margin = risk_mode === "AGGRESSIVE" 
    ? THERMAL_SAFETY_MARGIN_AGGRESSIVE 
    : THERMAL_SAFETY_MARGIN_SAFE;
  const backhaul_margin = risk_mode === "AGGRESSIVE"
    ? BACKHAUL_SAFETY_MARGIN_AGGRESSIVE
    : BACKHAUL_SAFETY_MARGIN_SAFE;
  const maint_margin = risk_mode === "AGGRESSIVE"
    ? MAINT_SAFETY_MARGIN_AGGRESSIVE
    : MAINT_SAFETY_MARGIN_SAFE;
  
  // Compute limits from each constraint
  const compute_thermal_limit = calculateSustainedComputeFromRadiators(
    target.target_radiator_area,
    emissivity,
    TARGET_CORE_TEMP_C,
    eclipse_fraction,
    shadowing_loss
  );
  
  const compute_backhaul_limit = target.target_backhaul_tbps * FLOPS_PER_TBPS;
  
  const compute_maintenance_lim = target.target_maintenance_cap * flops_per_pod;
  
  // Apply safety margins
  const safe_thermal_limit = compute_thermal_limit * thermal_margin;
  const safe_backhaul_limit = compute_backhaul_limit * backhaul_margin;
  const safe_maintenance_limit = compute_maintenance_lim * maint_margin;
  
  // Final safe compute is minimum of all limits
  const safe_compute_flops = Math.min(
    target.target_compute_flops,
    safe_thermal_limit,
    safe_backhaul_limit,
    safe_maintenance_limit
  );
  
  return {
    safe_compute_flops,
    thermal_limit: safe_thermal_limit,
    backhaul_limit: safe_backhaul_limit,
    maintenance_limit: safe_maintenance_limit,
  };
}

