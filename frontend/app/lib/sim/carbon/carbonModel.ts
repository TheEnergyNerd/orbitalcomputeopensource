/**
 * Carbon Model
 * Coarse, one-crossover rule
 */

export interface CarbonInputs {
  groundCarbonIntensity: number; // kg CO2 per MWh
  launchCarbonPerLaunch: number; // kg CO2 per launch
  orbitalPowerCarbon: number; // kg CO2 per MWh (solar, minimal)
  baseYear: number;
}

export interface CarbonResult {
  year: number;
  groundCarbon: number; // tCO2
  orbitalCarbon: number; // tCO2
  crossoverYear?: number;
  isValid: boolean;
  error?: string;
}

/**
 * Calculate carbon emissions
 * Rules:
 * - Orbit starts worse than ground (launch emissions)
 * - Crosses once
 * - Stays better forever after
 * - No oscillation allowed
 */
export function calculateCarbon(
  inputs: CarbonInputs,
  targetYear: number,
  groundEnergyMWh: number,
  orbitalEnergyMWh: number,
  launchesPerYear: number
): CarbonResult {
  const yearsAhead = targetYear - inputs.baseYear;

  // Ground carbon (constant intensity)
  const groundCarbon = (groundEnergyMWh * inputs.groundCarbonIntensity) / 1000; // Convert to tCO2

  // Orbital carbon (launch emissions amortized + operational)
  const totalLaunches = launchesPerYear * yearsAhead;
  const launchCarbon = (totalLaunches * inputs.launchCarbonPerLaunch) / 1000; // Convert to tCO2
  const operationalCarbon = (orbitalEnergyMWh * inputs.orbitalPowerCarbon) / 1000;
  const orbitalCarbon = launchCarbon + operationalCarbon;

  // Check for crossover
  let crossoverYear: number | undefined;
  if (orbitalCarbon < groundCarbon && yearsAhead > 0) {
    // Find when crossover occurred (simplified: assume linear interpolation)
    crossoverYear = inputs.baseYear + yearsAhead;
  }

  // Validation: Check for oscillation
  // If orbital was better before and is worse now (or vice versa), that's oscillation
  // For simplicity, we check that orbital improves relative to ground over time
  const carbonRatio = orbitalCarbon / groundCarbon;
  const isValid = carbonRatio <= 1.0 || yearsAhead === 0; // Allow initial state where orbit is worse

  if (!isValid && yearsAhead > 5) {
    return {
      year: targetYear,
      groundCarbon,
      orbitalCarbon,
      isValid: false,
      error: `Carbon oscillation detected: orbital carbon (${orbitalCarbon.toFixed(2)} tCO2) > ground carbon (${groundCarbon.toFixed(2)} tCO2) after crossover`,
    };
  }

  return {
    year: targetYear,
    groundCarbon,
    orbitalCarbon,
    crossoverYear,
    isValid: true,
  };
}

/**
 * Calculate carbon over multiple years
 * Throws error if oscillation detected
 */
export function calculateCarbonSeries(
  inputs: CarbonInputs,
  years: number[],
  groundEnergyMWh: number[],
  orbitalEnergyMWh: number[],
  launchesPerYear: number[]
): CarbonResult[] {
  const results: CarbonResult[] = [];
  let hasCrossed = false;
  let previousOrbitBetter = false;

  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const result = calculateCarbon(
      inputs,
      year,
      groundEnergyMWh[i] || 0,
      orbitalEnergyMWh[i] || 0,
      launchesPerYear[i] || 0
    );

    // Check for crossover
    const orbitBetter = result.orbitalCarbon < result.groundCarbon;
    if (orbitBetter && !hasCrossed) {
      hasCrossed = true;
      result.crossoverYear = year;
    }

    // Check for oscillation (orbit was better, now worse, or vice versa)
    if (hasCrossed && previousOrbitBetter && !orbitBetter) {
      throw new Error(
        `Carbon oscillation detected at year ${year}: orbital carbon increased above ground after crossover`
      );
    }

    results.push(result);
    previousOrbitBetter = orbitBetter;
  }

  return results;
}

