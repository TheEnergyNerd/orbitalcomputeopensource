/**
 * NEW LAUNCH POWER MODEL (GW/YR SYSTEM)
 * Starship-equivalent launch system
 */

export interface LaunchVehicle {
  power_per_launch_MW: number;
  satellites_per_launch: number;
  cost_per_launch_usd: number;
}

export const STARSHIP_EQUIV: LaunchVehicle = {
  power_per_launch_MW: 6, // 6 MW per launch
  satellites_per_launch: 60, // 60 satellites per launch
  cost_per_launch_usd: 10_000_000, // $10M per launch
};

/**
 * Calculate annual orbital power injection
 * Annual_Orbital_Power_GW = launches_per_year × power_per_launch_MW / 1000
 */
export function calculateAnnualOrbitalPower(
  launches_per_year: number,
  vehicle: LaunchVehicle = STARSHIP_EQUIV
): number {
  return (launches_per_year * vehicle.power_per_launch_MW) / 1000; // Convert to GW
}

/**
 * Calculate total orbital power accumulation
 */
export function calculateTotalOrbitalPower(
  initial_power_GW: number,
  annual_power_GW: number,
  years: number
): number {
  return initial_power_GW + (annual_power_GW * years);
}

/**
 * Calculate total orbital compute from power
 */
export function calculateTotalOrbitalCompute(
  total_power_GW: number,
  year: number,
  flops_per_watt: number
): number {
  const total_power_watts = total_power_GW * 1e9; // Convert GW to watts
  return (total_power_watts * flops_per_watt) / 1e15; // Convert to PFLOPs
}

