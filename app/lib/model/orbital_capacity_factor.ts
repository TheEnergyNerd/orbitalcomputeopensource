/**
 * Single-Source-of-Truth Orbital Capacity Factor
 * 
 * This module is the ONLY place where orbital capacity factor is calculated.
 * All other code should call this function, not calculate CF directly.
 * 
 * Capacity factor accounts for:
 * - Eclipse (sun fraction)
 * - Panel degradation
 * - Radiation downtime
 * - Operational uptime
 */

export interface OrbitalCapacityFactorParams {
  year: number;
  sunFraction: number; // Fraction of time in sun (0.98 for terminator, 0.65 for LEO with eclipse)
  satelliteAge?: number; // Average age of satellite in fleet (default: 3 years)
  enableDegradation?: boolean; // Enable degradation over time (default: true)
}

export interface OrbitalCapacityFactorResult {
  capacityFactor: number;
  provenance: {
    cfBase: number; // Base (1.0)
    cfEclipse: number; // After eclipse adjustment (sunFraction)
    cfDegradation: number; // After panel degradation
    cfRadiationDowntime: number; // After radiation derate
    cfUptime: number; // Final after uptime adjustment
    capacityFactor: number; // Final capacity factor
  };
}

/**
 * Compute orbital capacity factor (SINGLE SOURCE OF TRUTH)
 * 
 * This function is the ONLY place capacity factor should be calculated.
 * All other code should call this function, not recalculate CF.
 * 
 * @param params Capacity factor parameters
 * @returns Capacity factor and provenance
 */
export function computeOrbitalCapacityFactor(
  params: OrbitalCapacityFactorParams
): OrbitalCapacityFactorResult {
  const {
    year,
    sunFraction,
    satelliteAge = 3,
    enableDegradation = true,
  } = params;
  
  // Base: 1.0 (perfect availability)
  const cfBase = 1.0;
  
  // Eclipse: fraction of time in sun
  // Invariant: 0 < sunFraction <= 1
  if (sunFraction <= 0 || sunFraction > 1) {
    throw new Error(`sunFraction must be in (0, 1], got ${sunFraction}`);
  }
  const cfEclipse = sunFraction;
  
  // Panel degradation: ~2.5% per year of satellite age
  const panelDegradation = enableDegradation
    ? Math.pow(0.975, satelliteAge) // ~2.5% per year
    : 1.0;
  const cfDegradation = cfEclipse * panelDegradation;
  
  // Radiation derate: fleet-wide degradation over time (0.3% per year from 2025)
  const yearsFromBase = year - 2025;
  const radiationDerate = enableDegradation
    ? Math.max(0.90, 1 - 0.003 * yearsFromBase) // Cap at 10% max derate
    : 1.0;
  const cfRadiationDowntime = cfDegradation * radiationDerate;
  
  // Uptime: operational availability (improves with experience)
  const baseUptime = 0.95;
  const uptimeImprovement = 0.001 * yearsFromBase; // Gets better with experience
  const uptime = Math.min(0.99, baseUptime + uptimeImprovement);
  const cfUptime = cfRadiationDowntime * uptime;
  
  // Final capacity factor (must be in [0, 0.99])
  const capacityFactor = Math.max(0, Math.min(0.99, cfUptime));
  
  // Invariant: capacity factor must be in (0, 0.99]
  if (capacityFactor <= 0 || capacityFactor > 0.99) {
    throw new Error(`capacityFactor must be in (0, 0.99], got ${capacityFactor}`);
  }
  
  return {
    capacityFactor,
    provenance: {
      cfBase,
      cfEclipse,
      cfDegradation,
      cfRadiationDowntime,
      cfUptime,
      capacityFactor,
    },
  };
}

/**
 * Validate capacity factor monotonicity (degradation must be non-increasing)
 */
export function validateCapacityFactorMonotonicity(
  trajectory: Array<{ year: number; capacityFactor: number }>
): { valid: boolean; violations: Array<{ year: number; prevCf: number; currCf: number }> } {
  const violations: Array<{ year: number; prevCf: number; currCf: number }> = [];
  
  for (let i = 1; i < trajectory.length; i++) {
    const prev = trajectory[i - 1];
    const curr = trajectory[i];
    
    // If degradation is enabled, CF should be non-increasing
    // (allowing small floating point differences)
    if (curr.capacityFactor > prev.capacityFactor + 1e-6) {
      violations.push({
        year: curr.year,
        prevCf: prev.capacityFactor,
        currCf: curr.capacityFactor,
      });
    }
  }
  
  return {
    valid: violations.length === 0,
    violations,
  };
}


