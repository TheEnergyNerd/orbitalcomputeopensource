/**
 * V1 Mission Definitions
 * Simplified missions with clear completion rules
 */

export interface V1Mission {
  id: string;
  name: string;
  description: string;
  goals: {
    opexDeltaMax?: number;      // ≤ threshold (negative = reduction)
    latencyDeltaMaxMs?: number;  // ≤ threshold (positive = increase allowed)
    carbonDeltaMax?: number;     // ≤ threshold (negative = reduction)
    latencyMaxMs?: number;       // absolute latency
    orbitalShareMax?: number;    // ≤ threshold
    orbitalShareMin?: number;    // ≥ threshold
    launchesPerYearMax?: number; // ≤ threshold
    minImprovedMetrics?: number; // at least N metrics improved
    maxNegativeMetrics?: number; // at most N metrics worse
  };
}

export const V1_MISSIONS: V1Mission[] = [
  {
    id: "cheap_orbit",
    name: "Cheap Orbit",
    description: "Cut operating costs with a modest orbital fleet.",
    goals: {
      opexDeltaMax: -0.15,   // ≤ −15%
      latencyDeltaMaxMs: 3,  // ≤ +3 ms vs ground
    },
  },
  {
    id: "green_compute",
    name: "Green Compute",
    description: "Slash carbon while keeping costs under control.",
    goals: {
      carbonDeltaMax: -0.40, // ≤ −40%
      opexDeltaMax: 0.10,    // ≤ +10% higher OPEX allowed
    },
  },
  {
    id: "low_latency_edge",
    name: "Low-Latency Edge",
    description: "Serve edge workloads with minimal delay.",
    goals: {
      latencyMaxMs: 100,     // absolute latency
      orbitalShareMax: 0.40, // ≤ 40%
    },
  },
  {
    id: "high_orbit_push",
    name: "High Orbit Push",
    description: "Aggressive orbital build-out.",
    goals: {
      orbitalShareMin: 0.70,   // ≥ 70%
      launchesPerYearMax: 200, // ≤ 200
    },
  },
  {
    id: "balanced_fleet",
    name: "Balanced Fleet",
    description: "Make everything at least a little better.",
    goals: {
      minImprovedMetrics: 3,   // at least 3 metrics with improved delta
      maxNegativeMetrics: 1,   // at most 1 metric worse
    },
  },
];

export function checkMissionCompletion(
  mission: V1Mission,
  state: {
    orbitalShare: number;
    launchesPerYear: number;
    metrics: {
      costPerCompute: { ground: number; mix: number };
      opex: { ground: number; mix: number };
      latency: { ground: number; mix: number };
      carbon: { ground: number; mix: number };
    };
  }
): { completed: boolean; progress: number } {
  const { costDelta, opexDelta, latencyDeltaMs, carbonDelta, improvementFlags } = 
    require('../sim/v1State').calculateMetricDeltas(state.metrics);
  
  const { goals } = mission;
  let allPassed = true;
  let progressSum = 0;
  let progressCount = 0;
  
  // Check each goal
  if (goals.opexDeltaMax !== undefined) {
    const passed = opexDelta <= goals.opexDeltaMax;
    allPassed = allPassed && passed;
    // Progress: how close to goal (0-100)
    const progress = Math.max(0, Math.min(100, ((goals.opexDeltaMax - opexDelta) / Math.abs(goals.opexDeltaMax)) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.latencyDeltaMaxMs !== undefined) {
    const passed = latencyDeltaMs <= goals.latencyDeltaMaxMs;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((goals.latencyDeltaMaxMs - latencyDeltaMs) / goals.latencyDeltaMaxMs) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.carbonDeltaMax !== undefined) {
    const passed = carbonDelta <= goals.carbonDeltaMax;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((goals.carbonDeltaMax - carbonDelta) / Math.abs(goals.carbonDeltaMax)) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.latencyMaxMs !== undefined) {
    const passed = state.metrics.latency.mix <= goals.latencyMaxMs;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((goals.latencyMaxMs - state.metrics.latency.mix) / goals.latencyMaxMs) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.orbitalShareMax !== undefined) {
    const passed = state.orbitalShare <= goals.orbitalShareMax;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((goals.orbitalShareMax - state.orbitalShare) / goals.orbitalShareMax) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.orbitalShareMin !== undefined) {
    const passed = state.orbitalShare >= goals.orbitalShareMin;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((state.orbitalShare - goals.orbitalShareMin) / (0.9 - goals.orbitalShareMin)) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.launchesPerYearMax !== undefined) {
    const passed = state.launchesPerYear <= goals.launchesPerYearMax;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((goals.launchesPerYearMax - state.launchesPerYear) / goals.launchesPerYearMax) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.minImprovedMetrics !== undefined) {
    const improvedCount = Object.values(improvementFlags).filter(Boolean).length;
    const passed = improvedCount >= goals.minImprovedMetrics;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, (improvedCount / goals.minImprovedMetrics) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  if (goals.maxNegativeMetrics !== undefined) {
    const worseCount = [costDelta, opexDelta, latencyDeltaMs, carbonDelta].filter(d => d > 0.01).length;
    const passed = worseCount <= goals.maxNegativeMetrics;
    allPassed = allPassed && passed;
    const progress = Math.max(0, Math.min(100, ((goals.maxNegativeMetrics - worseCount + 1) / (goals.maxNegativeMetrics + 1)) * 100));
    progressSum += progress;
    progressCount++;
  }
  
  const progress = progressCount > 0 ? progressSum / progressCount : 0;
  
  return {
    completed: allPassed,
    progress: Math.round(progress),
  };
}

