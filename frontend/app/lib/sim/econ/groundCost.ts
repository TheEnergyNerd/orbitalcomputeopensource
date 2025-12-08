/**
 * Ground Compute Cost Model
 * Total system cost for ground datacenter infrastructure
 */

export interface GroundCostInputs {
  datacenterCapex: number; // $ per facility
  interconnectCapex: number; // $ for network infrastructure
  energyOpexPerYear: number; // $ per year
  coolingOpexPerYear: number; // $ per year
  years: number;
}

export interface GroundCostBreakdown {
  totalCapex: number;
  totalOpex: number;
  totalCost: number;
  costPerTFLOP?: number; // If compute capacity is known
}

/**
 * Compute total ground cost
 */
export function computeTotalGroundCost(inputs: GroundCostInputs): GroundCostBreakdown {
  const totalCapex = inputs.datacenterCapex + inputs.interconnectCapex;
  const totalOpex = (inputs.energyOpexPerYear + inputs.coolingOpexPerYear) * inputs.years;

  return {
    totalCapex,
    totalOpex,
    totalCost: totalCapex + totalOpex,
  };
}

/**
 * Compute cost per TFLOP if capacity is known
 */
export function computeGroundCostPerTFLOP(
  inputs: GroundCostInputs,
  totalTFLOPs: number
): number {
  const breakdown = computeTotalGroundCost(inputs);
  return totalTFLOPs > 0 ? breakdown.totalCost / totalTFLOPs : Infinity;
}

/**
 * Compare orbit vs ground costs and generate verdict
 */
export function compareCosts(
  orbitCost: number,
  groundCost: number,
  targetTFLOPs: number,
  currentYear: number
): {
  orbitTotal: number;
  groundTotal: number;
  verdict: string;
  crossoverYear?: number;
} {
  const orbitTotal = orbitCost;
  const groundTotal = groundCost;

  let verdict: string;
  let crossoverYear: number | undefined;

  if (orbitTotal < groundTotal) {
    verdict = `Orbital compute becomes cheaper than ground in Year ${currentYear} (at ${targetTFLOPs.toFixed(1)} TFLOPs)`;
    crossoverYear = currentYear;
  } else {
    const costDelta = orbitTotal - groundTotal;
    const costDeltaPct = ((costDelta / groundTotal) * 100).toFixed(1);
    verdict = `Ground compute is ${costDeltaPct}% cheaper than orbital (at ${targetTFLOPs.toFixed(1)} TFLOPs)`;
  }

  return {
    orbitTotal,
    groundTotal,
    verdict,
    crossoverYear,
  };
}

