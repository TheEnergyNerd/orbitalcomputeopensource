/**
 * Hardware Evolution Engine
 * Chip + Pod hardware evolution over time
 */

export interface PodEvolutionInputs {
  baseComputeTFLOPs: number;
  basePowerKW: number;
  baseCostPerTFLOP: number;
  computeGrowthRate: number; // Annual exponential growth rate
  powerSublinearFactor: number; // < 1.0, power grows slower than compute
  costDecayRate: number; // Annual exponential decay rate
  baseYear: number;
}

export interface PodEvolutionResult {
  year: number;
  computePerPod: number; // TFLOPs
  powerPerPod: number; // kW
  costPerTFLOP: number; // $
  isValid: boolean;
  error?: string;
}

/**
 * Evolve pod hardware forward
 * Rules:
 * - Compute must grow exponentially
 * - Power must grow sublinearly
 * - Cost/TFLOP must decay exponentially
 * - Hard constraint: If compute < 40 TFLOPs AND power > 1kW → INVALID
 */
export function evolvePodHardware(
  inputs: PodEvolutionInputs,
  targetYear: number
): PodEvolutionResult {
  const yearsAhead = targetYear - inputs.baseYear;

  if (yearsAhead < 0) {
    return {
      year: targetYear,
      computePerPod: inputs.baseComputeTFLOPs,
      powerPerPod: inputs.basePowerKW,
      costPerTFLOP: inputs.baseCostPerTFLOP,
      isValid: false,
      error: "Target year must be >= base year",
    };
  }

  // Compute grows exponentially
  const computePerPod = inputs.baseComputeTFLOPs * Math.exp(inputs.computeGrowthRate * yearsAhead);

  // Power grows sublinearly (power = base * (compute/base)^powerSublinearFactor)
  const computeRatio = computePerPod / inputs.baseComputeTFLOPs;
  const powerPerPod = inputs.basePowerKW * Math.pow(computeRatio, inputs.powerSublinearFactor);

  // Cost/TFLOP decays exponentially
  const costPerTFLOP = inputs.baseCostPerTFLOP * Math.exp(-inputs.costDecayRate * yearsAhead);

  // Hard constraint validation
  const violatesConstraint = computePerPod < 40 && powerPerPod > 1.0;
  
  if (violatesConstraint) {
    return {
      year: targetYear,
      computePerPod,
      powerPerPod,
      costPerTFLOP,
      isValid: false,
      error: `INVALID MODEL: compute (${computePerPod.toFixed(1)} TFLOPs) < 40 AND power (${powerPerPod.toFixed(2)} kW) > 1kW`,
    };
  }

  // Additional validation: compute must grow, power must grow slower, cost must decrease
  const computeGrows = computePerPod >= inputs.baseComputeTFLOPs;
  const powerGrowsSlower = powerPerPod / inputs.basePowerKW < computePerPod / inputs.baseComputeTFLOPs;
  const costDecreases = costPerTFLOP <= inputs.baseCostPerTFLOP;

  const isValid = computeGrows && powerGrowsSlower && costDecreases && !violatesConstraint;

  if (!isValid) {
    return {
      year: targetYear,
      computePerPod,
      powerPerPod,
      costPerTFLOP,
      isValid: false,
      error: `Evolution constraints violated: computeGrows=${computeGrows}, powerGrowsSlower=${powerGrowsSlower}, costDecreases=${costDecreases}`,
    };
  }

  return {
    year: targetYear,
    computePerPod,
    powerPerPod,
    costPerTFLOP,
    isValid: true,
  };
}

/**
 * Evolve pod hardware over multiple years
 */
export function evolvePodHardwareSeries(
  inputs: PodEvolutionInputs,
  years: number[]
): PodEvolutionResult[] {
  const results: PodEvolutionResult[] = [];

  for (const year of years) {
    const result = evolvePodHardware(inputs, year);
    
    if (!result.isValid) {
      throw new Error(`Pod evolution failed at year ${year}: ${result.error}`);
    }

    results.push(result);
  }

  return results;
}

