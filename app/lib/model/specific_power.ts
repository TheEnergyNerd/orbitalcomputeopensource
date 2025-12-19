/**
 * System-Level Specific Power Trajectory
 */

import { calculateThermalSystem, DEFAULT_THERMAL_PARAMS } from './thermal_physics';

export interface SpecificPowerParams {
  year: number;
  solarArrayWkg: number;
  computeWkg: number;
  batteryWhkg: number;
  systemOverheadFactor: number;
}

export const SPECIFIC_POWER_TRAJECTORY: Record<number, SpecificPowerParams> = {
  2025: {
    year: 2025,
    solarArrayWkg: 120,
    computeWkg: 200,
    batteryWhkg: 300,
    systemOverheadFactor: 1.4,
  },
  2030: {
    year: 2030,
    solarArrayWkg: 150,
    computeWkg: 300,
    batteryWhkg: 400,
    systemOverheadFactor: 1.3,
  },
  2035: {
    year: 2035,
    solarArrayWkg: 180,
    computeWkg: 400,
    batteryWhkg: 500,
    systemOverheadFactor: 1.25,
  },
  2040: {
    year: 2040,
    solarArrayWkg: 200,
    computeWkg: 500,
    batteryWhkg: 600,
    systemOverheadFactor: 1.2,
  },
  2050: {
    year: 2050,
    solarArrayWkg: 250,
    computeWkg: 800,
    batteryWhkg: 800,
    systemOverheadFactor: 1.15,
  },
};

export function interpolateSpecificPower(year: number): SpecificPowerParams {
  const years = Object.keys(SPECIFIC_POWER_TRAJECTORY).map(Number).sort((a, b) => a - b);
  
  if (year <= years[0]) return SPECIFIC_POWER_TRAJECTORY[years[0]];
  if (year >= years[years.length - 1]) return SPECIFIC_POWER_TRAJECTORY[years[years.length - 1]];
  
  for (let i = 0; i < years.length - 1; i++) {
    if (year >= years[i] && year <= years[i + 1]) {
      const t = (year - years[i]) / (years[i + 1] - years[i]);
      const p1 = SPECIFIC_POWER_TRAJECTORY[years[i]];
      const p2 = SPECIFIC_POWER_TRAJECTORY[years[i + 1]];
      
      return {
        year,
        solarArrayWkg: p1.solarArrayWkg + t * (p2.solarArrayWkg - p1.solarArrayWkg),
        computeWkg: p1.computeWkg + t * (p2.computeWkg - p1.computeWkg),
        batteryWhkg: p1.batteryWhkg + t * (p2.batteryWhkg - p1.batteryWhkg),
        systemOverheadFactor: p1.systemOverheadFactor + t * (p2.systemOverheadFactor - p1.systemOverheadFactor),
      };
    }
  }
  
  return SPECIFIC_POWER_TRAJECTORY[years[0]];
}

export function calculateSystemSpecificPower(
  year: number,
  computePowerKw: number,
  eclipseDurationHours: number = 0.58
): number {
  const params = interpolateSpecificPower(year);
  
  const solarMassKg = computePowerKw * 1000 / params.solarArrayWkg;
  const computeMassKg = computePowerKw * 1000 / params.computeWkg;
  const eclipseEnergyKwh = computePowerKw * eclipseDurationHours;
  const batteryMassKg = eclipseEnergyKwh * 1000 / params.batteryWhkg;
  
  const thermal = calculateThermalSystem({
    ...DEFAULT_THERMAL_PARAMS,
    computePowerKw,
  });
  const thermalMassKg = thermal.radiatorMassKg;
  
  const baseMassKg = solarMassKg + computeMassKg + batteryMassKg + thermalMassKg;
  const totalMassKg = baseMassKg * params.systemOverheadFactor;
  
  const systemSpecificPower = computePowerKw * 1000 / totalMassKg;
  
  return systemSpecificPower;
}

