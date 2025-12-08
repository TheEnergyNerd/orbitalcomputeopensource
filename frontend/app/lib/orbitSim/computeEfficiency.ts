/**
 * Power → Compute Scaling Curve (Authoritative Model)
 * Efficiency(t) = 12.5 W/TFLOP × 0.85^((t - 2025)/2)
 * ~15% efficiency gain every 2 years
 */

export interface ComputeEfficiencyCurve {
  year: number;
  watts_per_tflop: number; // W/TFLOP (inverse of efficiency)
  flops_per_watt: number; // FLOPS/W
}

const BASE_EFFICIENCY_W_PER_TFLOP = 12.5; // 2025 baseline
const EFFICIENCY_DECAY_RATE = 0.85; // 15% improvement every 2 years
const BASE_YEAR = 2025;

/**
 * Calculate efficiency at a given year
 * Efficiency(t) = 12.5 W/TFLOP × 0.85^((t - 2025)/2)
 */
export function getEfficiencyAtYear(year: number): number {
  const yearsSinceBase = year - BASE_YEAR;
  const wattsPerTflop = BASE_EFFICIENCY_W_PER_TFLOP * Math.pow(EFFICIENCY_DECAY_RATE, yearsSinceBase / 2);
  return wattsPerTflop;
}

/**
 * Calculate compute from power using efficiency curve
 * Formula: compute_PFLOPs = (sat_power_kW × 1000 / W_per_TFLOP) / 1e6
 * 
 * @param powerWatts - Power in watts (sat_power_kW × 1000)
 * @param year - Year for efficiency calculation
 * @returns Compute in PFLOPs
 */
export function calculateComputeFromPower(powerWatts: number, year: number): number {
  const wattsPerTflop = getEfficiencyAtYear(year); // W_per_TFLOP
  // compute_PFLOPs = (sat_power_kW × 1000 / W_per_TFLOP) / 1e6
  // Since powerWatts = sat_power_kW × 1000, we have:
  const computeTflops = powerWatts / wattsPerTflop; // TFLOPs
  return computeTflops / 1e6; // Convert to PFLOPs (1 PFLOP = 1e6 TFLOPs, not 1e3)
}

/**
 * Get efficiency curve data points for visualization
 */
export function getEfficiencyCurveData(startYear: number = 2025, endYear: number = 2040): ComputeEfficiencyCurve[] {
  const curve: ComputeEfficiencyCurve[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const wattsPerTflop = getEfficiencyAtYear(year);
    const flopsPerWatt = 1e12 / wattsPerTflop; // Convert W/TFLOP to FLOPS/W
    curve.push({
      year,
      watts_per_tflop: wattsPerTflop,
      flops_per_watt: flopsPerWatt,
    });
  }
  return curve;
}

// Legacy compatibility - keep for existing code
export const COMPUTE_EFFICIENCY: ComputeEfficiencyCurve[] = getEfficiencyCurveData(2025, 2040);

/**
 * Legacy function for backward compatibility
 */
export function getComputeEfficiency(year: number): number {
  const wattsPerTflop = getEfficiencyAtYear(year);
  return 1e12 / wattsPerTflop; // Convert to FLOPS/W
}

