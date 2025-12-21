import { EdgeInferenceParams, EdgeInferenceYearData } from './types';

export function computeEdgeInferenceCosts(
  year: number, 
  params: EdgeInferenceParams,
  launchCostKg: number,
  specificPowerWKg: number
): EdgeInferenceYearData {
  const yearIndex = year - 2025;
  
  // === SATELLITE COSTS ===
  
  // Chip cost declines with learning curve (15% per year for edge AI)
  const chipCost = params.inferenceChipCostUsd * Math.pow(0.85, yearIndex);
  
  // Sensor cost declines slower (5% per year)
  const sensorCost = params.sensorPayloadCostUsd * Math.pow(0.95, yearIndex);
  
  // Bus cost declines (10% per year)
  const busCost = params.satelliteBusCostUsd * Math.pow(0.90, yearIndex);
  
  // Launch cost (use main model's trajectory)
  const totalMassKg = 50 + params.sensorPayloadMassKg; // 50kg bus + sensor
  const launchCost = totalMassKg * launchCostKg;
  
  // Total satellite cost
  const satelliteCostUsd = chipCost + sensorCost + busCost + launchCost;
  
  // === PERFORMANCE ===
  
  // Inferences per satellite per year
  const secondsPerYear = 365.25 * 24 * 3600;
  const uptimeFraction = 0.90; // Daylight + clear view constraints
  const radiationFactor = Math.pow(params.edgeChipRadiationTolerance, yearIndex / 5);
  
  const inferencesPerSatPerYear = 
    params.inferencesPerSecond * secondsPerYear * uptimeFraction * radiationFactor;
  
  // === COST PER INFERENCE ===
  
  // Amortize satellite over lifetime
  const costPerInference = satelliteCostUsd / (inferencesPerSatPerYear * params.satelliteLifetimeYears);
  
  // Cost per billion inferences (more readable)
  const costPerBillionInferences = costPerInference * 1e9;
  
  // === GROUND ALTERNATIVE ===
  
  // Raw data per inference (satellite imagery)
  const rawDataPerInferenceMB = 10; // 10 MB per high-res image
  const rawDataPerInferenceGB = rawDataPerInferenceMB / 1000;
  
  // Ground costs (decline over time but slower than space)
  const downlinkCost = params.groundDownlinkCostPerGB * Math.pow(0.95, yearIndex);
  const processingCost = params.groundProcessingCostPerInference * Math.pow(0.90, yearIndex);
  
  // Total ground cost (penalized for latency)
  const groundCostPerInference = 
    (rawDataPerInferenceGB * downlinkCost + processingCost) * params.latencyPenaltyMultiplier;
  
  const groundCostPerBillionInferences = groundCostPerInference * 1e9;
  
  // === FLEET SIZING ===
  
  const demandBillionInferences = params.baseDemandBillionInferences2025 * 
    Math.pow(1 + params.demandGrowthRate, yearIndex);
  
  const inferencesPerSatBillion = inferencesPerSatPerYear / 1e9;
  const satellitesNeeded = Math.ceil(demandBillionInferences / inferencesPerSatBillion);
  
  const fleetCapexUsd = satellitesNeeded * satelliteCostUsd;

  // === BUSINESS CASE ===
  const revenuePerInference = 0.001; // $0.001 per inference
  const revenuePerYear = demandBillionInferences * 1e9 * revenuePerInference;
  const annualCost = (fleetCapexUsd / params.satelliteLifetimeYears) + (fleetCapexUsd * 0.05); // Amortization + 5% OPEX
  const profitMargin = (revenuePerYear - annualCost) / revenuePerYear;

  return {
    year,
    mode: 'EDGE_INFERENCE',
    
    // Per-satellite
    satelliteCostUsd,
    chipCost,
    sensorCost,
    launchCost,
    inferencesPerSatPerYear,
    
    // Per-inference (billions)
    costPerBillionInferences,
    groundCostPerBillionInferences,
    
    // Fleet
    satellitesNeeded,
    fleetCapexUsd,
    
    // Comparison
    crossover: costPerBillionInferences < groundCostPerBillionInferences,
    savingsVsGround: 1 - (costPerBillionInferences / groundCostPerBillionInferences),
    
    // Business case
    revenuePerYear,
    annualCost,
    profitMargin,
    
    // Breakdown
    breakdown: {
      busCost: busCost,
      inferenceChipCost: chipCost,
      sensorCost: sensorCost,
      radiatorCost: 0, // Simplified for edge
      launchCost: launchCost,
    }
  };
}

