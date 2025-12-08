/**
 * Orbital Compute Cost Model
 * Total system cost for orbital compute infrastructure
 */

export interface OrbitCostInputs {
  launchCostPerKg: number; // $/kg
  payloadMassKg: number; // kg per pod
  podCost: number; // $ per pod
  podsDeployed: number;
  yearlyOpex: number; // $ per year per pod
  years: number;
}

export interface OrbitCostBreakdown {
  launchCost: number;
  podCapex: number;
  totalOpex: number;
  totalCost: number;
  costPerTFLOP?: number; // If compute capacity is known
}

/**
 * Compute total orbital cost
 */
export function computeTotalOrbitCost(inputs: OrbitCostInputs): OrbitCostBreakdown {
  const launchCost = inputs.launchCostPerKg * inputs.payloadMassKg * inputs.podsDeployed;
  const podCapex = inputs.podCost * inputs.podsDeployed;
  const totalOpex = inputs.yearlyOpex * inputs.podsDeployed * inputs.years;

  return {
    launchCost,
    podCapex,
    totalOpex,
    totalCost: launchCost + podCapex + totalOpex,
  };
}

/**
 * Compute cost per TFLOP if capacity is known
 */
export function computeOrbitCostPerTFLOP(
  inputs: OrbitCostInputs,
  totalTFLOPs: number
): number {
  const breakdown = computeTotalOrbitCost(inputs);
  return totalTFLOPs > 0 ? breakdown.totalCost / totalTFLOPs : Infinity;
}

/**
 * Project orbital cost forward with learning curve
 */
export function projectOrbitCost(
  baseCost: OrbitCostBreakdown,
  yearsAhead: number,
  learningRate: number = 0.18 // 18% cost reduction per doubling
): OrbitCostBreakdown {
  // Learning curve: cost = base * (2 ^ (-learningRate * doublings))
  // Assume capacity doubles every 2 years
  const doublings = yearsAhead / 2;
  const costMultiplier = Math.pow(2, -learningRate * doublings);

  return {
    launchCost: baseCost.launchCost * costMultiplier,
    podCapex: baseCost.podCapex * costMultiplier,
    totalOpex: baseCost.totalOpex * costMultiplier,
    totalCost: baseCost.totalCost * costMultiplier,
  };
}

