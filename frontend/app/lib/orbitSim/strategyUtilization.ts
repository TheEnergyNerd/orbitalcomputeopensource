/**
 * Strategy-Based Compute Divergence
 * Each strategy modifies effective usable compute via utilization multipliers
 */

export type StrategyType = "cost" | "latency" | "carbon" | "resilience";

export interface StrategyUtilization {
  strategy: StrategyType;
  utilizationMultiplier: number;
  description: string;
}

/**
 * Utilization multipliers for each strategy
 */
export const STRATEGY_UTILIZATION: Record<StrategyType, StrategyUtilization> = {
  cost: {
    strategy: "cost",
    utilizationMultiplier: 0.82, // Aggressive overcommit, higher congestion, lower redundancy
    description: "Cost-optimized: Aggressive overcommit, higher congestion, lower redundancy",
  },
  latency: {
    strategy: "latency",
    utilizationMultiplier: 0.74, // Traffic weighted to closest shells, reduced batch utilization
    description: "Latency-optimized: Traffic weighted to closest shells, reduced batch utilization",
  },
  carbon: {
    strategy: "carbon",
    utilizationMultiplier: 0.88, // Launch cadence throttled, higher compute efficiency bias
    description: "Carbon-optimized: Launch cadence throttled, higher compute efficiency bias",
  },
  resilience: {
    strategy: "resilience",
    utilizationMultiplier: 0.68, // Redundant routing, underutilized capacity, higher cost
    description: "Resilience-optimized: Redundant routing, underutilized capacity, higher cost",
  },
};

/**
 * Calculate effective compute from raw compute and strategy
 * EffectiveCompute = RawCompute × U_strategy
 */
export function calculateEffectiveCompute(
  rawComputeTflops: number,
  strategy: StrategyType
): number {
  const utilization = STRATEGY_UTILIZATION[strategy].utilizationMultiplier;
  return rawComputeTflops * utilization;
}

/**
 * Get utilization multiplier for a strategy
 */
export function getUtilizationMultiplier(strategy: StrategyType): number {
  return STRATEGY_UTILIZATION[strategy].utilizationMultiplier;
}

