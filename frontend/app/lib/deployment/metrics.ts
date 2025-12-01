/**
 * Deployment metrics calculations
 * Based on orbital share and economic formulas
 */

import type { SimState, OrbitalPodSpec, GroundDcSpec } from "../sim/model";
import { getOrbitalComputeKw } from "../sim/orbitConfig";

// Constants for calculations
const KWH_PER_TFLOP = 1000; // kWh per TFLOP (example value, adjust as needed)
const HOURS_PER_YEAR = 8760;

export interface DeploymentMetrics {
  costPerTFLOP: number;      // $/TFLOP-yr
  annualOpex: number;         // $/yr
  latencyMs: number;          // ms
  carbonTonsPerYear: number;  // tCO2/yr
}

export interface MetricsDelta {
  costPerTFLOP: { before: number; after: number; delta: number; deltaPercent: number };
  annualOpex: { before: number; after: number; delta: number; deltaPercent: number };
  latencyMs: { before: number; after: number; delta: number };
  carbonTonsPerYear: { before: number; after: number; delta: number };
}

/**
 * Calculate orbital share (0-1)
 */
export function calculateOrbitalShare(
  podsInOrbit: number,
  orbitalSpec: OrbitalPodSpec,
  groundComputeKw: number,
  degradationFactor: number = 1.0
): number {
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, degradationFactor);
  const totalComputeKw = orbitalComputeKw + groundComputeKw;
  
  if (totalComputeKw === 0) return 0;
  
  const share = orbitalComputeKw / totalComputeKw;
  return Math.max(0, Math.min(1, share)); // Clamp to [0, 1]
}

/**
 * Calculate cost per TFLOP-year for ground compute
 */
function calculateGroundCostPerTFLOP(groundSpec: GroundDcSpec): number {
  // Energy cost per TFLOP-yr
  const energyPerTFLOP = KWH_PER_TFLOP / 1000; // MWh per TFLOP
  const energyCost = energyPerTFLOP * groundSpec.energyPricePerMwh * groundSpec.pue;
  
  // Cooling cost (simplified - could add more detail)
  const coolingCost = energyPerTFLOP * groundSpec.coolingWaterLPerMwh * 0.001; // $0.001/L
  
  // Facility cost (simplified - could add more detail)
  const facilityCost = energyPerTFLOP * 10; // $10/MWh facility cost
  
  return energyCost + coolingCost + facilityCost;
}

/**
 * Calculate cost per TFLOP-year for orbital compute
 */
function calculateOrbitalCostPerTFLOP(
  orbitalSpec: OrbitalPodSpec,
  podsInOrbit: number
): number {
  // Pod compute capacity in TFLOP-yr
  const podComputeTFLOPyr = (orbitalSpec.computeKw / 1000) * HOURS_PER_YEAR / KWH_PER_TFLOP;
  
  // Amortized capex per TFLOP-yr
  const capexPerTFLOPyr = orbitalSpec.capexPerPod / (orbitalSpec.lifetimeYears * podComputeTFLOPyr);
  
  // Opex per TFLOP-yr
  const opexPerTFLOPyr = orbitalSpec.opexPerYearPerPod / podComputeTFLOPyr;
  
  // Energy savings (orbital uses solar, minimal cost)
  const energySavings = 0; // Could add if needed
  
  // Cooling savings (no cooling needed in space)
  const coolingSavings = 0; // Could add if needed
  
  return capexPerTFLOPyr + opexPerTFLOPyr - energySavings - coolingSavings;
}

/**
 * Calculate mixed cost per TFLOP-year
 */
export function calculateMixedCostPerTFLOP(
  orbitalShare: number,
  groundCostPerTFLOP: number,
  orbitalCostPerTFLOP: number
): number {
  return (1 - orbitalShare) * groundCostPerTFLOP + orbitalShare * orbitalCostPerTFLOP;
}

/**
 * Calculate annual OPEX
 */
export function calculateAnnualOpex(
  costPerTFLOP: number,
  totalComputeDemandTFLOPyr: number
): number {
  return costPerTFLOP * totalComputeDemandTFLOPyr;
}

/**
 * Calculate mixed latency (weighted average)
 */
export function calculateMixedLatency(
  orbitalShare: number,
  groundLatencyMs: number,
  orbitalLatencyMs: number
): number {
  return (1 - orbitalShare) * groundLatencyMs + orbitalShare * orbitalLatencyMs;
}

/**
 * Calculate mixed carbon emissions
 */
export function calculateMixedCarbon(
  orbitalShare: number,
  groundCarbonPerTFLOP: number,
  orbitalCarbonPerTFLOP: number,
  totalComputeDemandTFLOPyr: number
): number {
  const mixedCarbonPerTFLOP = (1 - orbitalShare) * groundCarbonPerTFLOP + orbitalShare * orbitalCarbonPerTFLOP;
  return mixedCarbonPerTFLOP * totalComputeDemandTFLOPyr;
}

/**
 * Calculate ground carbon per TFLOP-yr
 */
function calculateGroundCarbonPerTFLOP(groundSpec: GroundDcSpec): number {
  const energyPerTFLOP = KWH_PER_TFLOP / 1000; // MWh per TFLOP
  return energyPerTFLOP * groundSpec.co2PerMwh * groundSpec.pue;
}

/**
 * Calculate orbital carbon per TFLOP-yr (amortized launch carbon)
 */
function calculateOrbitalCarbonPerTFLOP(orbitalSpec: OrbitalPodSpec): number {
  const podComputeTFLOPyr = (orbitalSpec.computeKw / 1000) * HOURS_PER_YEAR / KWH_PER_TFLOP;
  return orbitalSpec.co2PerYearPerPod / podComputeTFLOPyr;
}

/**
 * Calculate all deployment metrics
 */
export function calculateDeploymentMetrics(
  simState: SimState,
  groundLatencyMs: number = 120,
  orbitalLatencyMs: number = 89
): DeploymentMetrics {
  const { podsInOrbit, orbitalPodSpec, groundDcSpec, targetComputeKw, podDegradationFactor } = simState;
  
  // Calculate orbital share
  const orbitalShare = calculateOrbitalShare(
    podsInOrbit,
    orbitalPodSpec,
    targetComputeKw,
    podDegradationFactor
  );
  
  // Calculate per-unit costs
  const groundCostPerTFLOP = calculateGroundCostPerTFLOP(groundDcSpec);
  const orbitalCostPerTFLOP = calculateOrbitalCostPerTFLOP(orbitalPodSpec, podsInOrbit);
  
  // Calculate mixed metrics
  const costPerTFLOP = calculateMixedCostPerTFLOP(orbitalShare, groundCostPerTFLOP, orbitalCostPerTFLOP);
  
  // Total compute demand in TFLOP-yr
  const totalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalPodSpec, podDegradationFactor) + targetComputeKw;
  const totalComputeTFLOPyr = (totalComputeKw / 1000) * HOURS_PER_YEAR / KWH_PER_TFLOP;
  
  const annualOpex = calculateAnnualOpex(costPerTFLOP, totalComputeTFLOPyr);
  const latencyMs = calculateMixedLatency(orbitalShare, groundLatencyMs, orbitalLatencyMs);
  
  // Carbon calculations
  const groundCarbonPerTFLOP = calculateGroundCarbonPerTFLOP(groundDcSpec);
  const orbitalCarbonPerTFLOP = calculateOrbitalCarbonPerTFLOP(orbitalPodSpec);
  const carbonTonsPerYear = calculateMixedCarbon(
    orbitalShare,
    groundCarbonPerTFLOP,
    orbitalCarbonPerTFLOP,
    totalComputeTFLOPyr
  );
  
  return {
    costPerTFLOP,
    annualOpex,
    latencyMs,
    carbonTonsPerYear,
  };
}

/**
 * Calculate metrics delta between before and after launch
 */
export function calculateMetricsDelta(
  metricsBefore: DeploymentMetrics,
  metricsAfter: DeploymentMetrics
): MetricsDelta {
  return {
    costPerTFLOP: {
      before: metricsBefore.costPerTFLOP,
      after: metricsAfter.costPerTFLOP,
      delta: metricsAfter.costPerTFLOP - metricsBefore.costPerTFLOP,
      deltaPercent: ((metricsAfter.costPerTFLOP - metricsBefore.costPerTFLOP) / metricsBefore.costPerTFLOP) * 100,
    },
    annualOpex: {
      before: metricsBefore.annualOpex,
      after: metricsAfter.annualOpex,
      delta: metricsAfter.annualOpex - metricsBefore.annualOpex,
      deltaPercent: ((metricsAfter.annualOpex - metricsBefore.annualOpex) / metricsBefore.annualOpex) * 100,
    },
    latencyMs: {
      before: metricsBefore.latencyMs,
      after: metricsAfter.latencyMs,
      delta: metricsAfter.latencyMs - metricsBefore.latencyMs,
    },
    carbonTonsPerYear: {
      before: metricsBefore.carbonTonsPerYear,
      after: metricsAfter.carbonTonsPerYear,
      delta: metricsAfter.carbonTonsPerYear - metricsBefore.carbonTonsPerYear,
    },
  };
}

