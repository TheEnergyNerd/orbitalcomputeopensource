/**
 * Globe-to-Macro System Coupling
 * Applies orbital congestion to global simulation metrics
 */

import type { GlobalCongestionFrame } from '../orbit/congestion';
import { meanUtilization, utilizationVariance } from '../orbit/congestion';

export interface GlobalMetricsMultipliers {
  latencyMultiplier: number;
  costMultiplier: number;
  volatilityIndex: number;
  carbonMultiplier: number;
}

/**
 * Apply congestion to global metrics
 * This function MUST be called every simulation tick
 */
export function applyCongestionToGlobalMetrics(
  frame: GlobalCongestionFrame
): GlobalMetricsMultipliers {
  const avgUtil = meanUtilization(frame);
  const varUtil = utilizationVariance(frame);

  // Latency increases with average utilization
  // At 100% utilization, latency is 1.8x baseline
  const latencyMultiplier = 1 + avgUtil * 0.8;

  // Cost increases due to rerouting and contention
  // At 100% utilization, cost is 1.6x baseline
  const costMultiplier = 1 + avgUtil * 0.6;

  // Volatility index based on variance
  // High variance = unstable conditions
  const volatilityIndex = varUtil * 2.0;

  // Carbon increases due to extra hops and rerouting
  // At 100% utilization, carbon is 1.3x baseline
  const carbonMultiplier = 1 + avgUtil * 0.3;

  return {
    latencyMultiplier,
    costMultiplier,
    volatilityIndex,
    carbonMultiplier,
  };
}

/**
 * Get base multipliers (no congestion)
 */
export function getBaseMultipliers(): GlobalMetricsMultipliers {
  return {
    latencyMultiplier: 1.0,
    costMultiplier: 1.0,
    volatilityIndex: 0.0,
    carbonMultiplier: 1.0,
  };
}

