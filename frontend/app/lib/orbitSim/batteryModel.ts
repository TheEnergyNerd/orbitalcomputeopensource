/**
 * Battery Technology Progression Model
 * Tracks battery density, cost, and eclipse tolerance over time
 */

export interface BatterySpec {
  density_wh_per_kg: number; // Energy density in Wh/kg
  cost_usd_per_kwh: number; // Cost in $/kWh
}

export interface BatteryProgression {
  [year: number]: BatterySpec;
}

/**
 * Battery technology progression from 2025 to 2040
 */
export const BATTERY_PROGRESSION: BatteryProgression = {
  2025: { density_wh_per_kg: 250, cost_usd_per_kwh: 200 },
  2028: { density_wh_per_kg: 350, cost_usd_per_kwh: 120 },
  2032: { density_wh_per_kg: 500, cost_usd_per_kwh: 80 },
  2036: { density_wh_per_kg: 700, cost_usd_per_kwh: 50 },
  2040: { density_wh_per_kg: 1000, cost_usd_per_kwh: 30 },
};

/**
 * Interpolate battery specs for a given year
 */
export function getBatterySpec(year: number): BatterySpec {
  const years = Object.keys(BATTERY_PROGRESSION).map(Number).sort((a, b) => a - b);
  
  // If before first year, use first year
  if (year <= years[0]) {
    return BATTERY_PROGRESSION[years[0]];
  }
  
  // If after last year, use last year
  if (year >= years[years.length - 1]) {
    return BATTERY_PROGRESSION[years[years.length - 1]];
  }
  
  // Find surrounding years
  let lowerYear = years[0];
  let upperYear = years[years.length - 1];
  
  for (let i = 0; i < years.length - 1; i++) {
    if (year >= years[i] && year <= years[i + 1]) {
      lowerYear = years[i];
      upperYear = years[i + 1];
      break;
    }
  }
  
  // Linear interpolation
  const lower = BATTERY_PROGRESSION[lowerYear];
  const upper = BATTERY_PROGRESSION[upperYear];
  const t = (year - lowerYear) / (upperYear - lowerYear);
  
  return {
    density_wh_per_kg: lower.density_wh_per_kg + (upper.density_wh_per_kg - lower.density_wh_per_kg) * t,
    cost_usd_per_kwh: lower.cost_usd_per_kwh + (upper.cost_usd_per_kwh - lower.cost_usd_per_kwh) * t,
  };
}

/**
 * Calculate eclipse tolerance (minutes) for given battery and power
 */
export function calculateEclipseTolerance(
  batteryDensityWhKg: number,
  powerKw: number,
  batteryMassBudgetKg: number
): number {
  const capacityWh = batteryDensityWhKg * batteryMassBudgetKg;
  const eclipseMinutes = (capacityWh / 1000) / powerKw * 60;
  return eclipseMinutes;
}

/**
 * Calculate battery cost and mass for given power and eclipse duration
 */
export function calculateBatteryRequirements(
  year: number,
  powerKw: number,
  eclipseMinutes: number
): {
  capacityNeededKwh: number;
  massKg: number;
  costUsd: number;
} {
  const battery = getBatterySpec(year);
  
  const capacityNeededKwh = (powerKw * eclipseMinutes) / 60;
  const massKg = (capacityNeededKwh * 1000) / battery.density_wh_per_kg;
  const costUsd = capacityNeededKwh * battery.cost_usd_per_kwh;
  
  return { capacityNeededKwh, massKg, costUsd };
}






