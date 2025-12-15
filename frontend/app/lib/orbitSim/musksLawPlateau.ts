/**
 * Musk's Law Plateau Model
 * 
 * Implements physics/economics-based floor for launch cost decline
 * Launch costs can't decline forever - there are floor costs that even
 * full reusability can't eliminate
 */

/**
 * Get launch cost per kg with realistic floor
 * Uses asymptotic decay toward a physics/economics floor
 * 
 * @param year - Year to calculate for
 * @param baseYear - Base year (default 2025)
 * @param baseCostPerKg - Base cost in base year (default $1,500/kg - current SpaceX internal cost)
 * @returns Cost per kg to LEO in USD
 */
export function getLaunchCostPerKg(
  year: number,
  baseYear: number = 2025,
  baseCostPerKg: number = 1500
): number {
  // Cost floor - can't go below this regardless of reuse/scale
  // Based on: propellant ($0.50/kg) + ops ($0.50/kg) + recovery ($0.20/kg) + 
  //           refurb ($0.30/kg) + insurance ($0.50/kg) + amortization ($1.20/kg)
  // Total: ~$3.20/kg minimum per launch at 100 tons payload = ~$32/kg
  const floorCostPerKg = 30; // ~$30/kg is likely the physics floor
  
  // Exponential decay toward floor
  // Asymptotic approach: cost = floor + (base - floor) * e^(-rate * years)
  // Updated decay rate to reach ~$100/kg by 2040 from $1,500/kg in 2025
  // Rate calculated: -ln((100-30)/(1500-30)) / 15 = 0.203 (20.3% per year)
  const decayRate = 0.203; // How fast we approach floor (20.3% per year to reach ~$100/kg by 2040)
  const yearsFromBase = year - baseYear;
  
  // Asymptotic approach: cost = floor + (base - floor) * e^(-rate * years)
  const decayFactor = Math.exp(-decayRate * yearsFromBase);
  const cost = floorCostPerKg + (baseCostPerKg - floorCostPerKg) * decayFactor;
  
  return Math.max(cost, floorCostPerKg); // Ensure we never go below floor
}

/**
 * Get launch cost curve data for visualization
 */
export function getLaunchCostCurve(
  startYear: number = 2025,
  endYear: number = 2050,
  baseYear: number = 2025,
  baseCostPerKg: number = 1500
): Array<{year: number, costPerKg: number}> {
  const data = [];
  for (let year = startYear; year <= endYear; year++) {
    data.push({
      year,
      costPerKg: getLaunchCostPerKg(year, baseYear, baseCostPerKg),
    });
  }
  return data;
}

/**
 * Calculate launch cost breakdown (for understanding the floor)
 */
export interface LaunchCostBreakdown {
  propellant: number;        // Per-launch propellant cost
  launchOps: number;         // Ground crew, range, etc.
  recoveryOps: number;       // Ship recovery, booster catch
  refurbishment: number;     // Inspection, repairs, tile replacement
  insurance: number;         // Liability, payload insurance
  vehicleAmortization: number; // Vehicle cost / flights
  padAmortization: number;   // Pad infrastructure
  totalPerLaunch: number;    // Total per-launch floor
  costPerKg: number;         // At 100 tons payload
}

export function getLaunchCostBreakdown(): LaunchCostBreakdown {
  const payloadKg = 100_000; // 100 tons
  
  const breakdown: LaunchCostBreakdown = {
    propellant: 500_000,        // ~$0.50/kg for 100 ton payload
    launchOps: 500_000,         // Ground crew, range, etc.
    recoveryOps: 200_000,       // Ship recovery, booster catch
    refurbishment: 300_000,     // Inspection, repairs, tile replacement
    insurance: 500_000,         // Liability, payload insurance
    vehicleAmortization: 1_000_000, // $100M vehicle / 100 flights
    padAmortization: 200_000,       // Pad infrastructure
    totalPerLaunch: 0,
    costPerKg: 0,
  };
  
  breakdown.totalPerLaunch = 
    breakdown.propellant +
    breakdown.launchOps +
    breakdown.recoveryOps +
    breakdown.refurbishment +
    breakdown.insurance +
    breakdown.vehicleAmortization +
    breakdown.padAmortization;
  
  breakdown.costPerKg = breakdown.totalPerLaunch / payloadKg;
  
  return breakdown;
}

