/**
 * Canonical Orbit Stats
 * Normalized metrics for ground vs orbit mix comparison
 */

export type OrbitStats = {
  // Normalized numbers – use TFLOP-yr and $/yr everywhere
  costPerCompute: number;   // $ / TFLOP-yr
  annualOpex: number;       // $ / yr
  latencyMs: number;        // ms
  carbonTons: number;       // tCO2 / yr
};

export type SimulationSnapshot = {
  timestamp: number;
  podsTotal: number;
  orbitSharePct: number;         // 0–100
  ground: OrbitStats;
  mix: OrbitStats;
};

export type SimulationHistory = {
  history: SimulationSnapshot[];   // append on every launch batch
  lastDelta: {
    before?: SimulationSnapshot;
    after?: SimulationSnapshot;
  };
};

import type { ScenarioMetrics } from './scenarioTypes';

/**
 * Convert ScenarioMetrics to canonical OrbitStats
 */
export function metricsToStats(metrics: ScenarioMetrics): { ground: OrbitStats; mix: OrbitStats } {
  return {
    ground: {
      costPerCompute: metrics.groundCostPerCompute,
      annualOpex: metrics.groundOpexPerYear,
      latencyMs: metrics.groundLatencyMs,
      carbonTons: metrics.groundCarbonTpy,
    },
    mix: {
      costPerCompute: metrics.orbitCostPerCompute,
      annualOpex: metrics.orbitOpexPerYear,
      latencyMs: metrics.orbitLatencyMs,
      carbonTons: metrics.orbitCarbonTpy,
    },
  };
}

/**
 * Create a simulation snapshot from current state
 */
export function createSnapshot(
  podsDeployed: number,
  metrics: ScenarioMetrics,
  timestamp: number = Date.now()
): SimulationSnapshot {
  const stats = metricsToStats(metrics);
  
  return {
    timestamp,
    podsTotal: podsDeployed,
    orbitSharePct: metrics.orbitShare * 100,
    ground: stats.ground,
    mix: stats.mix,
  };
}




