/**
 * V1 Simplified State Model
 * Three-lever design: orbitalShare, groundEfficiency, launchCadence
 */

export interface V1Metrics {
  costPerCompute: {
    ground: number;
    mix: number;
  };
  opex: {
    ground: number;
    mix: number;
  };
  latency: {
    ground: number;
    mix: number;
  };
  carbon: {
    ground: number;
    mix: number;
  };
}

export interface V1State {
  // Three core levers
  orbitalShare: number;        // 0-0.9
  groundEfficiency: number;    // 0-1 (Ground Efficiency Index)
  launchCadence: number;       // launches/month, 1-30
  
  // Computed metrics
  metrics: V1Metrics;
  
  // Derived values
  launchesPerYear: number;
  podsPerYear: number;
  backlogFactor: number;       // 0-3 (0 = fine, >1 = behind)
  launchReliability: number;   // 0-1, derived from cadence
  
  // Mission state
  currentMissionId: string | null;
  missionProgress: number;     // -100 → +100
  missionCompleted: boolean;
  
  // Hints
  suggestedMoves: string[];
}

// Baselines (tunable constants)
export const BASE_COST_PER_TFLOP = 500000;  // $/TFLOP-yr, ground only
export const BASE_OPEX = 50000000;         // $/yr
export const BASE_LATENCY = 120;           // ms
export const BASE_CARBON = 100000;         // tCO2/yr
export const BASE_LAUNCH_COST = 5000000;   // $ per launch
export const BASE_PODS_PER_SHARE = 100;    // pods/yr required per 1.0 orbital share
export const BASE_LAUNCHES_PER_POD = 1.2;  // avg launches per pod
export const POD_LIFETIME_YEARS = 7;       // Pod lifetime for amortization

/**
 * Calculate launch reliability based on cadence
 */
export function calculateLaunchReliability(cadence: number): number {
  if (cadence <= 12) {
    return 0.99;
  } else if (cadence <= 20) {
    return 0.99 - 0.01 * ((cadence - 12) / 8);
  } else {
    return Math.max(0.85, 0.98 - 0.04 * ((cadence - 20) / 10));
  }
}

/**
 * Calculate all derived values from the three levers
 */
export function calculateDerivedValues(
  orbitalShare: number,
  groundEfficiency: number,
  launchCadence: number
) {
  const s = Math.max(0, Math.min(0.9, orbitalShare));
  const g = Math.max(0, Math.min(1, groundEfficiency));
  const c = Math.max(1, Math.min(30, launchCadence));
  
  // Derived helper values
  const podsRequiredPerYear = BASE_PODS_PER_SHARE * s;
  const launchesRequiredPerYear = podsRequiredPerYear * BASE_LAUNCHES_PER_POD;
  const launchesCapacityPerYear = c * 12;
  const backlogFactor = Math.min(3, Math.max(0, launchesRequiredPerYear / Math.max(launchesCapacityPerYear, 1)));
  const launchReliability = calculateLaunchReliability(c);
  const effectiveLaunches = launchesRequiredPerYear / Math.max(launchReliability, 0.01);
  
  // Amortize launch costs over pod lifetime (annualized launch OPEX)
  // Only count new launches needed this year, not total fleet
  const annualLaunchOpex = (effectiveLaunches * BASE_LAUNCH_COST) / POD_LIFETIME_YEARS;
  
  // Ground-only metrics (baseline)
  const groundCostPerCompute = BASE_COST_PER_TFLOP * (1 - 0.3 * g);
  const groundOpex = BASE_OPEX * (1 - 0.4 * g);
  const groundLatency = BASE_LATENCY * (1 + 0.10 * g);  // slightly worse at high efficiency (centralization)
  const groundCarbon = BASE_CARBON * (1 - 0.5 * g);
  
  // Orbit mix metrics
  // Key insight: Orbital compute has ZERO energy costs (solar is free)
  // Ground compute has high energy costs (60-70% of OPEX is energy)
  // So replacing ground with orbit saves significant energy costs
  
  // Energy cost portion of ground OPEX (assume 65% is energy)
  const groundEnergyOpex = groundOpex * 0.65;
  // Non-energy OPEX (operations, maintenance, etc.)
  const groundNonEnergyOpex = groundOpex * 0.35;
  
  // Orbit mix OPEX:
  // - Ground portion: reduced by orbital share (less ground compute = less ground energy)
  // - Orbital portion: zero energy costs, but has launch amortization + ops
  // - Backlog penalty: operational stress from insufficient launch capacity
  const orbitGroundOpex = groundEnergyOpex * (1 - s) + groundNonEnergyOpex * (1 - 0.3 * s);
  const orbitOpex = orbitGroundOpex + annualLaunchOpex + groundOpex * 0.10 * backlogFactor;
  
  const orbitCostPerCompute = groundCostPerCompute * (1 - 0.5 * s) + (annualLaunchOpex / 1e6);
  const orbitLatency = groundLatency * (1 - 0.4 * s) + 5 * backlogFactor;
  const orbitCarbon = groundCarbon * (1 - 0.8 * s) + (launchesRequiredPerYear * 10);
  
  return {
    podsPerYear: podsRequiredPerYear,
    launchesPerYear: launchesRequiredPerYear,
    backlogFactor,
    launchReliability,
    metrics: {
      costPerCompute: {
        ground: groundCostPerCompute,
        mix: orbitCostPerCompute,
      },
      opex: {
        ground: groundOpex,
        mix: orbitOpex,
      },
      latency: {
        ground: groundLatency,
        mix: orbitLatency,
      },
      carbon: {
        ground: groundCarbon,
        mix: orbitCarbon,
      },
    },
  };
}

/**
 * Calculate metric deltas for mission checking
 */
export function calculateMetricDeltas(metrics: V1Metrics) {
  const costDelta = (metrics.costPerCompute.mix - metrics.costPerCompute.ground) / metrics.costPerCompute.ground;
  const opexDelta = (metrics.opex.mix - metrics.opex.ground) / metrics.opex.ground;
  const latencyDeltaMs = metrics.latency.mix - metrics.latency.ground;
  const carbonDelta = (metrics.carbon.mix - metrics.carbon.ground) / metrics.carbon.ground;
  
  return {
    costDelta,
    opexDelta,
    latencyDeltaMs,
    carbonDelta,
    improvementFlags: {
      cost: costDelta < 0,
      opex: opexDelta < 0,
      latency: latencyDeltaMs < 0,
      carbon: carbonDelta < 0,
    },
  };
}

