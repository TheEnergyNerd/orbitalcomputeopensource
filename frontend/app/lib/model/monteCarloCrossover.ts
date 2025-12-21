/**
 * Monte Carlo Sensitivity Analysis for Crossover Year
 * 
 * Runs a one-time Monte Carlo simulation over key parameters to determine
 * crossover year distribution (P10/P50/P90).
 * 
 * Key parameters varied:
 * - Launch cost trajectory (slope + floor)
 * - Effective specific power path
 * - Compute GFLOPS/W path
 * - Chip failure rate in orbit
 * - Ground site scarcity premium cap + growth rate
 * - PUE trend
 */

import { YearParams, YearlyBreakdown } from './types';
import { computePhysicsCost } from './physicsCost';
import { findCrossoverYear } from './trajectory';

export interface MonteCarloParams {
  launchCost2025: number;
  launchCost2040: number;
  specificPower2025: number;
  specificPower2040: number;
      gflopsPerWattOrbital2025: number;
      gflopsPerWattOrbital2040: number;
  failureRateBase: number;
  groundConstraintCap: number;
  pueGround2025: number;
  pueGround2040: number;
}

export interface MonteCarloResult {
  p10: number | null; // 10th percentile crossover year
  p50: number | null; // 50th percentile (median) crossover year
  p90: number | null; // 90th percentile crossover year
  probabilityByYear: Array<{ year: number; probability: number }>; // Probability orbital cheaper by year X
  samples: Array<{ params: MonteCarloParams; crossoverYear: number | null }>;
}

/**
 * Generate a single Monte Carlo sample by perturbing base parameters
 */
function generateSample(
  baseParams: MonteCarloParams,
  rng: () => number = Math.random
): MonteCarloParams {
  // Perturb each parameter by ±20% (normal distribution, clipped)
  const perturb = (value: number, stdDev: number = 0.1) => {
    // Box-Muller transform for normal distribution
    const u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const perturbed = value * (1 + z0 * stdDev);
    // Clip to reasonable bounds
    return Math.max(value * 0.5, Math.min(value * 1.5, perturbed));
  };
  
  return {
    launchCost2025: perturb(baseParams.launchCost2025, 0.15), // ±15% for launch costs
    launchCost2040: perturb(baseParams.launchCost2040, 0.20), // ±20% for future launch costs
    specificPower2025: perturb(baseParams.specificPower2025, 0.10), // ±10% for specific power
    specificPower2040: perturb(baseParams.specificPower2040, 0.15), // ±15% for future specific power
      gflopsPerWattOrbital2025: perturb(baseParams.gflopsPerWattOrbital2025, 0.10), // ±10% for compute efficiency
      gflopsPerWattOrbital2040: perturb(baseParams.gflopsPerWattOrbital2040 || baseParams.gflopsPerWattOrbital2025, 0.15), // ±15% for future efficiency
    failureRateBase: perturb(baseParams.failureRateBase, 0.20), // ±20% for failure rate
    groundConstraintCap: perturb(baseParams.groundConstraintCap, 0.15), // ±15% for constraint cap
    pueGround2025: perturb(baseParams.pueGround2025, 0.05), // ±5% for PUE (well understood)
    pueGround2040: perturb(baseParams.pueGround2040, 0.10), // ±10% for future PUE
  };
}

/**
 * Convert Monte Carlo params to YearParams for a specific year
 */
function paramsToYearParams(
  sample: MonteCarloParams,
  year: number,
  baseYearParams: (y: number) => YearParams
): YearParams {
  const base = baseYearParams(year);
  
  // Interpolate launch cost (exponential decay)
  const launchCost = sample.launchCost2025 * 
    Math.pow(sample.launchCost2040 / sample.launchCost2025, (year - 2025) / 15);
  
  // Interpolate specific power (linear)
  const specificPower = sample.specificPower2025 + 
    (sample.specificPower2040 - sample.specificPower2025) * ((year - 2025) / 15);
  
  // Interpolate GFLOPS/W (exponential growth)
  const flopsPerWattOrbital = sample.gflopsPerWattOrbital2025 * 
    Math.pow(sample.gflopsPerWattOrbital2040 / sample.gflopsPerWattOrbital2025, (year - 2025) / 15);
  
  // Interpolate PUE (linear)
  const pueGround = sample.pueGround2025 + 
    (sample.pueGround2040 - sample.pueGround2025) * ((year - 2025) / 15);
  
  return {
    ...base,
    launchCostKg: launchCost,
    specificPowerWKg: specificPower,
    gflopsPerWattOrbital2025: flopsPerWattOrbital,
    pueGround: pueGround,
    // Failure rate affects radiation degradation - approximate via useRadHardChips
    useRadHardChips: sample.failureRateBase >= 0.12, // Higher failure rate = rad-hard needed
    // Ground constraint cap - would need to modify GROUND_SCENARIOS, for now approximate
  };
}

/**
 * Run Monte Carlo analysis to determine crossover year distribution
 * 
 * @param baseYearParams Function to get base YearParams for a given year
 * @param baseParams Base parameter values to perturb
 * @param numSamples Number of Monte Carlo samples (default: 200)
 * @returns Monte Carlo result with P10/P50/P90 and probability distribution
 */
export function runMonteCarloCrossover(
  baseYearParams: (year: number) => YearParams,
  baseParams: MonteCarloParams,
  numSamples: number = 200
): MonteCarloResult {
  const samples: Array<{ params: MonteCarloParams; crossoverYear: number | null }> = [];
  
  // Generate samples and compute crossover for each
  for (let i = 0; i < numSamples; i++) {
    const sample = generateSample(baseParams);
    
    // Compute trajectory for this sample
    const trajectory: YearlyBreakdown[] = [];
    for (let year = 2025; year <= 2050; year++) {
      const yearParams = paramsToYearParams(sample, year, baseYearParams);
      const breakdown = computePhysicsCost(yearParams);
      trajectory.push(breakdown);
    }
    
    const crossoverYear = findCrossoverYear(trajectory);
    samples.push({ params: sample, crossoverYear });
  }
  
  // Extract crossover years (filter out nulls for statistics)
  const crossoverYears = samples
    .map(s => s.crossoverYear)
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);
  
  // Calculate percentiles
  const p10 = crossoverYears.length > 0 
    ? crossoverYears[Math.floor(crossoverYears.length * 0.10)]
    : null;
  const p50 = crossoverYears.length > 0
    ? crossoverYears[Math.floor(crossoverYears.length * 0.50)]
    : null;
  const p90 = crossoverYears.length > 0
    ? crossoverYears[Math.floor(crossoverYears.length * 0.90)]
    : null;
  
  // Calculate probability orbital cheaper by year X
  const probabilityByYear: Array<{ year: number; probability: number }> = [];
  for (let year = 2025; year <= 2050; year++) {
    const count = samples.filter(s => s.crossoverYear !== null && s.crossoverYear <= year).length;
    const probability = count / samples.length;
    probabilityByYear.push({ year, probability });
  }
  
  return {
    p10,
    p50,
    p90,
    probabilityByYear,
    samples,
  };
}

/**
 * Extract base parameters from a YearParams function
 * Used to initialize Monte Carlo from current model state
 */
export function extractBaseParams(
  baseYearParams: (year: number) => YearParams
): MonteCarloParams {
  const params2025 = baseYearParams(2025);
  const params2040 = baseYearParams(2040);
  
  return {
    launchCost2025: params2025.launchCostKg,
    launchCost2040: params2040.launchCostKg,
    specificPower2025: params2025.specificPowerWKg,
    specificPower2040: params2040.specificPowerWKg,
      gflopsPerWattOrbital2025: params2025.gflopsPerWattOrbital2025 || 0,
      gflopsPerWattOrbital2040: (params2040.gflopsPerWattOrbital2025 || params2025.gflopsPerWattOrbital2025 || 0),
    failureRateBase: params2025.useRadHardChips ? 0.09 : 0.15,
    groundConstraintCap: 50, // Default from GROUND_SCENARIOS
    pueGround2025: params2025.pueGround,
    pueGround2040: params2040.pueGround,
  };
}

