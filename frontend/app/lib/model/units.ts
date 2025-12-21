/**
 * Canonical Compute Units
 * 
 * SINGLE SOURCE OF TRUTH for unit conversions.
 * All code must use these constants, never hardcode conversions.
 */

export const COMPUTE_UNITS = {
  /** 1 PFLOP = 1e6 GFLOPS */
  GFLOPS_PER_PFLOP: 1e6,
  
  /** 1 GFLOPS = 1e9 FLOPS */
  FLOPS_PER_GFLOP: 1e9,
  
  /** 1 PFLOP = 1e15 FLOPS */
  FLOPS_PER_PFLOP: 1e15,
  
  /** 1 TFLOPS = 1e12 FLOPS */
  FLOPS_PER_TFLOP: 1e12,
  
  /** 1 PFLOP = 1e3 TFLOPS */
  TFLOPS_PER_PFLOP: 1e3,
} as const;

/**
 * Validate GFLOPS/W is in expected range for system-level efficiency
 * @param gflopsPerWatt Value to validate
 * @param context Context for error message
 * @returns Sanitized value (clamped to valid range if needed)
 */
export function validateGflopsPerWatt(
  gflopsPerWatt: number,
  context: string = 'unknown'
): number {
  // Minimum: 20 GFLOPS/W (accommodates orbital systems with radiation hardening overhead, ~25 GFLOPS/W)
  // Maximum: 5000 GFLOPS/W (future FP8 systems)
  const MIN_SYSTEM_GFLOPS_PER_W = 20;
  const MAX_SYSTEM_GFLOPS_PER_W = 5000;
  
  if (!isFinite(gflopsPerWatt) || gflopsPerWatt <= 0) {
    throw new Error(
      `[UNITS] Invalid GFLOPS/W in ${context}: ${gflopsPerWatt}. ` +
      `Must be finite and positive.`
    );
  }
  
  if (gflopsPerWatt < MIN_SYSTEM_GFLOPS_PER_W || gflopsPerWatt > MAX_SYSTEM_GFLOPS_PER_W) {
    // This is a units error - log and throw
    throw new Error(
      `[UNITS] GFLOPS/W unit corruption detected in ${context}: ${gflopsPerWatt}. ` +
      `Expected range: [${MIN_SYSTEM_GFLOPS_PER_W}, ${MAX_SYSTEM_GFLOPS_PER_W}] GFLOPS/W for system-level. ` +
      `This suggests a unit conversion error (e.g., dividing by 1e9 or 1e12).`
    );
  }
  
  return gflopsPerWatt;
}

/**
 * Convert PFLOPS/W to GFLOPS/W
 */
export function pflopsPerWattToGflops(pflopsPerWatt: number): number {
  return pflopsPerWatt * COMPUTE_UNITS.GFLOPS_PER_PFLOP;
}

/**
 * Convert GFLOPS/W to PFLOPS/W
 */
export function gflopsPerWattToPflops(gflopsPerWatt: number): number {
  return gflopsPerWatt / COMPUTE_UNITS.GFLOPS_PER_PFLOP;
}

/**
 * Convert FLOPS/W to GFLOPS/W
 */
export function flopsPerWattToGflops(flopsPerWatt: number): number {
  return flopsPerWatt / COMPUTE_UNITS.FLOPS_PER_GFLOP;
}

