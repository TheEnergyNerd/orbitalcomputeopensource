/**
 * Ground Future Projection Engine
 * Strictly decreasing cost/TFLOP with flattening slope
 */

export interface GroundProjectionInputs {
  learningRate: number; // 0.08 → 0.15 (annual cost reduction rate)
  energyPriceDrift: number; // -0.01 → +0.03 (annual energy price change)
  carbonPenaltyCoef: number; // Carbon tax coefficient
  baseCostPerTFLOP: number;
  baseYear: number;
}

export interface GroundProjectionResult {
  year: number;
  costPerTFLOP: number;
  slope: number; // Rate of change (must be negative and decreasing)
  isValid: boolean;
  error?: string;
}

/**
 * Project ground cost forward
 * Rules:
 * - Cost/TFLOP strictly decreases
 * - Slope strictly flattens (becomes less negative)
 * - Curve asymptotes
 * - No oscillation allowed
 */
export function projectGroundCost(
  inputs: GroundProjectionInputs,
  targetYear: number
): GroundProjectionResult {
  const yearsAhead = targetYear - inputs.baseYear;
  
  if (yearsAhead < 0) {
    return {
      year: targetYear,
      costPerTFLOP: inputs.baseCostPerTFLOP,
      slope: 0,
      isValid: false,
      error: "Target year must be >= base year",
    };
  }

  // Learning curve: cost decreases exponentially with diminishing returns
  // Formula: cost = base * exp(-learningRate * years * (1 - years/100))
  // The (1 - years/100) term ensures the slope flattens over time
  const decayFactor = Math.exp(-inputs.learningRate * yearsAhead * (1 - yearsAhead / 100));
  const costPerTFLOP = inputs.baseCostPerTFLOP * decayFactor;

  // Calculate slope (derivative)
  // d/dy [base * exp(-lr * y * (1 - y/100))] = base * exp(...) * (-lr * (1 - 2y/100))
  const slope = -inputs.learningRate * (1 - (2 * yearsAhead) / 100) * costPerTFLOP;

  // Energy price drift adjustment
  const energyAdjustment = Math.exp(inputs.energyPriceDrift * yearsAhead);
  const adjustedCost = costPerTFLOP * energyAdjustment;

  // Carbon penalty (increases cost)
  const carbonPenalty = inputs.carbonPenaltyCoef * yearsAhead * 0.01; // Small linear increase
  const finalCost = adjustedCost * (1 + carbonPenalty);

  // Validation: Check for oscillation (cost must be strictly decreasing)
  const isValid = finalCost < inputs.baseCostPerTFLOP && slope < 0;

  if (!isValid) {
    return {
      year: targetYear,
      costPerTFLOP: finalCost,
      slope,
      isValid: false,
      error: "Cost projection violates strict decrease rule",
    };
  }

  // Check slope flattening (slope must become less negative over time)
  const slopeIsFlattening = yearsAhead === 0 || Math.abs(slope) < Math.abs(-inputs.learningRate * inputs.baseCostPerTFLOP);

  if (!slopeIsFlattening && yearsAhead > 10) {
    return {
      year: targetYear,
      costPerTFLOP: finalCost,
      slope,
      isValid: false,
      error: "Slope is not flattening as required",
    };
  }

  return {
    year: targetYear,
    costPerTFLOP: finalCost,
    slope,
    isValid: true,
  };
}

/**
 * Project ground cost over multiple years
 * Throws error if any oscillation is detected
 */
export function projectGroundCostSeries(
  inputs: GroundProjectionInputs,
  years: number[]
): GroundProjectionResult[] {
  const results: GroundProjectionResult[] = [];
  let previousCost = inputs.baseCostPerTFLOP;

  for (const year of years) {
    const result = projectGroundCost(inputs, year);
    
    // Check for oscillation (cost must always decrease)
    if (result.costPerTFLOP >= previousCost && year > inputs.baseYear) {
      throw new Error(
        `Ground cost projection oscillation detected at year ${year}: ` +
        `cost increased from ${previousCost.toFixed(2)} to ${result.costPerTFLOP.toFixed(2)}`
      );
    }

    results.push(result);
    previousCost = result.costPerTFLOP;
  }

  return results;
}

