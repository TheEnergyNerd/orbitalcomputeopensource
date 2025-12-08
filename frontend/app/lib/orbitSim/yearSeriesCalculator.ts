/**
 * Year Series Calculator
 * Computes compute per year over a 10-year horizon
 */

import type { ScenarioInputs, YearSeries } from './scenarioTypes';
import { getRocket, getPodType } from './orbitConfigs';
import { calculateScenarioMetricsWithUpgrades } from './scenarioHelpers';
import { calculateComputeFromPower } from './computeEfficiency';

const YEARS = 10;
const DEMAND_GROWTH_RATE = 1.10; // 10% growth per year

/**
 * Calculate year series for compute over time
 */
export function calculateYearSeries(inputs: ScenarioInputs): YearSeries {
  const rocket = getRocket(inputs.rocketId);
  const pod = getPodType(inputs.podTypeId);
  
  if (!pod) {
    throw new Error(`Pod type ${inputs.podTypeId} not found`);
  }
  
  const baseDemand = inputs.baselineComputeDemandTflopYr;
  
  // NEW: Compute derived from power (power-first model)
  const currentYear = new Date().getFullYear();
  const powerPerPodKW = pod.powerPerPodKw || 100; // Default to 100kW minimum
  const computePerPodPFLOPs = calculateComputeFromPower(powerPerPodKW * 1000, currentYear);
  const computePerPodTFLOPs = computePerPodPFLOPs * 1e3; // Convert PFLOPs to TFLOPs
  const podTFLOPyr = computePerPodTFLOPs; // TFLOPs per year (simplified)

  // Initialize arrays
  const years = Array.from({ length: YEARS }, (_, i) => i);
  const demandTFLOPyr: number[] = [];
  const podsLaunchedPerYear: number[] = [];
  const orbitTFLOPyr: number[] = [];
  const mixGroundTFLOPyr: number[] = [];
  const groundTFLOPyr: number[] = [];
  const costPerComputeGround: number[] = [];
  const costPerComputeMix: number[] = [];
  const carbonPerComputeGround: number[] = [];
  const carbonPerComputeMix: number[] = [];

  // Calculate demand growth
  for (let y = 0; y < YEARS; y++) {
    demandTFLOPyr[y] = baseDemand * Math.pow(DEMAND_GROWTH_RATE, y);
    groundTFLOPyr[y] = demandTFLOPyr[y]; // Pure ground world uses all demand
  }

  // Calculate pods launched per year
  // For now, assume constant deployment rate based on current podsDeployed
  // This could be enhanced to use actual launch cadence
  const totalPods = inputs.podsDeployed;
  const podsPerYear = totalPods / YEARS; // Distribute evenly over 10 years
  
  for (let y = 0; y < YEARS; y++) {
    podsLaunchedPerYear[y] = podsPerYear;
  }

  // Calculate orbit compute accumulation
  // Each pod contributes starting the year after launch (or same year - using same year for simplicity)
  for (let y = 0; y < YEARS; y++) {
    let orbit = 0;
    for (let k = 0; k <= y; k++) {
      orbit += podsLaunchedPerYear[k] * podTFLOPyr;
    }
    orbitTFLOPyr[y] = orbit;
    mixGroundTFLOPyr[y] = Math.max(0, demandTFLOPyr[y] - orbitTFLOPyr[y]);
  }

  // Calculate cost and carbon per compute for each year
  // Use the base metrics from scenario calculator (with upgrades)
  const baseMetrics = calculateScenarioMetricsWithUpgrades({
    ...inputs,
    podsDeployed: 0, // Get baseline ground metrics
  });

  const baseGroundCostPerTFLOPyr = baseMetrics.groundCostPerCompute;
  const baseGroundCarbonPerTFLOPyr = baseMetrics.groundCarbonTpy / baseDemand;

  // For orbit, calculate from a scenario with pods (with upgrades)
  const orbitMetrics = calculateScenarioMetricsWithUpgrades({
    ...inputs,
    podsDeployed: totalPods, // Use total pods for orbit cost calculation
  });

  // Orbit cost per TFLOP-yr (including capex amortization)
  const orbitCostPerTFLOPyr = orbitMetrics.orbitCostPerCompute;
  const orbitCarbonPerTFLOPyr = orbitMetrics.orbitCarbonTpy / (orbitMetrics.totalOrbitCompute || 1);

  // Calculate per-year values
  for (let y = 0; y < YEARS; y++) {
    // Ground-only: use baseline cost/carbon
    costPerComputeGround[y] = baseGroundCostPerTFLOPyr;
    carbonPerComputeGround[y] = baseGroundCarbonPerTFLOPyr;

    // Mix: weighted average
    const groundShare = mixGroundTFLOPyr[y] / demandTFLOPyr[y];
    const orbitShare = orbitTFLOPyr[y] / demandTFLOPyr[y];
    
    costPerComputeMix[y] = 
      (groundShare * baseGroundCostPerTFLOPyr) + 
      (orbitShare * orbitCostPerTFLOPyr);
    
    carbonPerComputeMix[y] = 
      (groundShare * baseGroundCarbonPerTFLOPyr) + 
      (orbitShare * orbitCarbonPerTFLOPyr);
  }

  return {
    years,
    demandTFLOPyr,
    groundTFLOPyr,
    orbitTFLOPyr,
    mixGroundTFLOPyr,
    costPerComputeGround,
    costPerComputeMix,
    carbonPerComputeGround,
    carbonPerComputeMix,
    podsLaunchedPerYear,
  };
}

