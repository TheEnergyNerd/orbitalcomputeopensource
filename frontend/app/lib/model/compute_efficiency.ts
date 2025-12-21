/**
 * Single-Source-of-Truth Compute Efficiency (GFLOPS/W)
 * 
 * CANONICAL FUNCTION: This is the ONLY place where system-level GFLOPS/W is calculated.
 * Used by BOTH ground and orbit. All other code must call this function.
 */

export interface ComputeEfficiencyParams {
  chipPeakGflopsPerW: number; // Peak chip-level GFLOPS/W
  utilizationFactor: number; // 0 < utilizationFactor <= 1
  systemOverheadFactor: number; // System-level overhead (>= 1, e.g., 1.18 for PUE 1.18)
  memoryStallFactor?: number; // Memory stall penalty (<= 1, default 1.0)
}

export interface ComputeEfficiencyResult {
  effectiveGflopsPerW: number;
  debug: {
    chipPeakGflopsPerW: number;
    utilizationFactor: number;
    systemOverheadFactor: number;
    memoryStallFactor: number;
    effectiveGflopsPerW: number;
  };
}

/**
 * CANONICAL Compute Efficiency Function
 * 
 * Formula: effectiveGflopsPerW = chipPeakGflopsPerW * utilizationFactor * memoryStallFactor / systemOverheadFactor
 * 
 * This is the SINGLE SOURCE OF TRUTH for compute efficiency.
 * All other code must call this function, not calculate GFLOPS/W directly.
 * 
 * @param params Compute efficiency parameters
 * @returns Effective GFLOPS/W and debug fields
 */
export function ComputeEfficiency(
  params: ComputeEfficiencyParams
): ComputeEfficiencyResult {
  const {
    chipPeakGflopsPerW,
    utilizationFactor,
    systemOverheadFactor,
    memoryStallFactor = 1.0,
  } = params;
  
  // Validation
  if (utilizationFactor <= 0 || utilizationFactor > 1) {
    throw new Error(`utilizationFactor must be in (0, 1], got ${utilizationFactor}`);
  }
  if (systemOverheadFactor < 1) {
    throw new Error(`systemOverheadFactor must be >= 1, got ${systemOverheadFactor}`);
  }
  if (memoryStallFactor <= 0 || memoryStallFactor > 1) {
    throw new Error(`memoryStallFactor must be in (0, 1], got ${memoryStallFactor}`);
  }
  
  // CANONICAL FORMULA
  const effectiveGflopsPerW = chipPeakGflopsPerW * utilizationFactor * memoryStallFactor / systemOverheadFactor;
  
  // CRITICAL INVARIANT: effectiveGflopsPerW <= chipPeakGflopsPerW always
  if (effectiveGflopsPerW > chipPeakGflopsPerW) {
    throw new Error(
      `INVARIANT VIOLATION: effectiveGflopsPerW (${effectiveGflopsPerW}) must be <= chipPeakGflopsPerW (${chipPeakGflopsPerW}). ` +
      `Check: utilizationFactor=${utilizationFactor}, memoryStallFactor=${memoryStallFactor}, systemOverheadFactor=${systemOverheadFactor}`
    );
  }
  
  return {
    effectiveGflopsPerW,
    debug: {
      chipPeakGflopsPerW,
      utilizationFactor,
      systemOverheadFactor,
      memoryStallFactor,
      effectiveGflopsPerW,
    },
  };
}

// Legacy compatibility wrapper (deprecated - use ComputeEfficiency directly)
export function getSystemGflopsPerWatt(
  params: {
    chipName?: string;
    precision?: 'FP32' | 'FP16' | 'FP8' | 'INT8';
    peakGflopsPerWatt: number;
    utilizationFactor: number;
    systemOverheadFactor?: number;
    allowUnboundedEfficiency?: boolean;
  }
): ComputeEfficiencyResult {
  const systemOverheadFactor = params.systemOverheadFactor || (1 / 0.85); // Convert from old 0.85 to new >=1 format
  return ComputeEfficiency({
    chipPeakGflopsPerW: params.peakGflopsPerWatt,
    utilizationFactor: params.utilizationFactor,
    systemOverheadFactor,
  });
}

/**
 * Get default compute efficiency for a given chip type and year
 * Uses canonical ComputeEfficiency function
 */
export function getDefaultComputeEfficiency(
  chipName: string,
  year: number,
  precision: 'FP32' | 'FP16' | 'FP8' | 'INT8' = 'FP16',
  allowUnboundedEfficiency: boolean = false
): ComputeEfficiencyResult {
  // Default chip specifications by type
  const chipSpecs: Record<string, { chipPeakGflopsPerW: number; utilizationFactor: number; systemOverheadFactor: number }> = {
    'H100-equivalent': {
      chipPeakGflopsPerW: 200, // Peak chip-level (FP16)
      utilizationFactor: 0.70, // 70% average utilization
      systemOverheadFactor: 1.18, // PUE 1.18 equivalent
    },
    'H100-equivalent (rad-tolerant)': {
      chipPeakGflopsPerW: 180, // Slightly lower due to rad-hardening
      utilizationFactor: 0.65, // 65% utilization (thermal + radiation events)
      systemOverheadFactor: 1.18, // PUE 1.18 equivalent
    },
    'NVIDIA H100 SXM': {
      chipPeakGflopsPerW: 200,
      utilizationFactor: 0.70,
      systemOverheadFactor: 1.18, // PUE 1.18 equivalent
    },
  };
  
  const spec = chipSpecs[chipName] || chipSpecs['H100-equivalent'];
  
  // Apply Moore's Law improvement with LOGISTIC SATURATION (not unbounded exponential)
  // Logistic curve: fast growth early, plateaus at thermodynamic limit
  const GFLOPS_2025 = spec.chipPeakGflopsPerW;
  const GFLOPS_MAX = 600; // Thermodynamic ceiling (effective GFLOPS/W)
  // Convert to peak chip GFLOPS/W: maxPeak = maxEffective * systemOverhead / utilization
  const MAX_PEAK = GFLOPS_MAX * spec.systemOverheadFactor / spec.utilizationFactor;
  const HALF_SAT_YEAR = 2035; // Year at which we're halfway to max
  const STEEPNESS = 0.25; // Steepness of logistic curve
  
  const t = year - 2025;
  
  // Logistic saturation: starts exponential, plateaus at max
  // progress = 1 / (1 + exp(-k * (t - t_half)))
  const progress = 1 / (1 + Math.exp(-STEEPNESS * (t - (HALF_SAT_YEAR - 2025))));
  
  // Interpolate between 2025 baseline and max
  let adjustedPeak = GFLOPS_2025 + (MAX_PEAK - GFLOPS_2025) * progress;
  
  // If unbounded efficiency is allowed, use old exponential (for testing)
  if (allowUnboundedEfficiency) {
    const mooresLawFactor = Math.pow(1.15, yearsFrom2025);
    adjustedPeak = spec.chipPeakGflopsPerW * mooresLawFactor;
  }
  
  return ComputeEfficiency({
    chipPeakGflopsPerW: adjustedPeak,
    utilizationFactor: spec.utilizationFactor,
    systemOverheadFactor: spec.systemOverheadFactor,
  });
}

