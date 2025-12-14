/**
 * Thermal/Radiator Model for Orbital Compute
 * 
 * REALITY CHECK: Adds realistic thermal constraints based on radiator physics
 * - Radiator efficiency: ~200 W/m² in LEO
 * - Body-mounted radiators: max 20 m² (simple, reliable)
 * - Deployable radiators: max 100 m² (complex, risky)
 * - Power limits derived from thermal constraints
 */

export interface ThermalModel {
  // Radiator efficiency
  radiatorEfficiencyWPerM2: number;        // ~200W/m² typical in LEO
  
  // Radiator size limits
  maxBodyMountedRadiatorM2: number;        // Simple, reliable
  maxDeployableRadiatorM2: number;         // Complex, risky
  
  // Derived power limits (KEY CONSTRAINT)
  maxPowerSimpleThermalKw: number;         // Body-mounted only
  maxPowerComplexThermalKw: number;        // Deployable radiators
  
  // Mass penalty
  radiatorMassPerM2Kg: number;            // 5 kg/m² for panels
  
  // Cost/risk for complex thermal
  deployableRadiatorCostMultiplier: number; // 3x cost
  deployableRadiatorFailureRate: number;    // 5% deployment failures
}

export const DEFAULT_THERMAL_MODEL: ThermalModel = {
  radiatorEfficiencyWPerM2: 200,           // ~200W/m² typical in LEO
  maxBodyMountedRadiatorM2: 20,           // Simple, reliable (Starlink: 2-5 m²)
  maxDeployableRadiatorM2: 100,            // Complex, risky (ISS: 150 m² for entire station)
  maxPowerSimpleThermalKw: 4,              // 20 m² × 200 W/m² = 4 kW (85% heat = 3.4 kW heat, 0.6 kW margin)
  maxPowerComplexThermalKw: 20,            // 100 m² × 200 W/m² = 20 kW (85% heat = 17 kW heat, 3 kW margin)
  radiatorMassPerM2Kg: 5,                  // 5 kg/m² for panels
  deployableRadiatorCostMultiplier: 3.0,   // 3x cost for deployable
  deployableRadiatorFailureRate: 0.05,     // 5% deployment failures
};

/**
 * Calculate maximum power allowed by thermal constraints
 * Takes into account radiator type (body-mounted vs deployable)
 */
export function calculateMaxPowerFromThermal(
  hasDeployableRadiators: boolean,
  model: ThermalModel = DEFAULT_THERMAL_MODEL
): number {
  return hasDeployableRadiators 
    ? model.maxPowerComplexThermalKw 
    : model.maxPowerSimpleThermalKw;
}

/**
 * Calculate required radiator area for given power
 * Accounts for 85% heat generation (15% electrical losses)
 */
export function calculateRequiredRadiatorArea(
  powerKw: number,
  model: ThermalModel = DEFAULT_THERMAL_MODEL
): number {
  const heatGenKw = powerKw * 0.85; // 85% of power becomes heat
  const radiatorEfficiencyKwPerM2 = model.radiatorEfficiencyWPerM2 / 1000; // Convert to kW/m²
  const requiredAreaM2 = heatGenKw / radiatorEfficiencyKwPerM2;
  return requiredAreaM2;
}

/**
 * Check if power is thermally feasible
 * Returns true if power can be supported by available radiator area
 */
export function isPowerThermallyFeasible(
  powerKw: number,
  hasDeployableRadiators: boolean,
  model: ThermalModel = DEFAULT_THERMAL_MODEL
): boolean {
  const maxPower = calculateMaxPowerFromThermal(hasDeployableRadiators, model);
  return powerKw <= maxPower;
}

/**
 * Calculate radiator mass for given area
 */
export function calculateRadiatorMass(
  radiatorAreaM2: number,
  model: ThermalModel = DEFAULT_THERMAL_MODEL
): number {
  return radiatorAreaM2 * model.radiatorMassPerM2Kg;
}

