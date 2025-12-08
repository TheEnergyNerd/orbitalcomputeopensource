/**
 * NEW ORBITAL POD SPEC (POWER FIRST)
 * Power-first model with 100kW minimum enforced
 */

export interface OrbitalComputePod {
  base_power_kw: number;
  thermal_capacity_kw: number;
  mass_kg: number;
  cost_usd: number;
  solar_area_m2: number;
}

/**
 * HARD BASELINE (2025 Physics Floor)
 * No pod may go below 100 kW
 */
export const BASE_POD: OrbitalComputePod = {
  base_power_kw: 100,
  thermal_capacity_kw: 300,
  mass_kg: 1500,
  solar_area_m2: 600,
  cost_usd: 2_000_000,
};

/**
 * Validate pod power - MUST be >= 100 kW
 */
export function validatePodPower(pod: OrbitalComputePod): { valid: boolean; error?: string } {
  if (pod.base_power_kw < 100) {
    return {
      valid: false,
      error: `INVALID: Pod power (${pod.base_power_kw} kW) < 100 kW minimum`,
    };
  }
  return { valid: true };
}

/**
 * Assert pod power - throws if invalid
 */
export function assertPodPower(pod: OrbitalComputePod): void {
  const validation = validatePodPower(pod);
  if (!validation.valid) {
    throw new Error(validation.error || "Pod power validation failed");
  }
}

