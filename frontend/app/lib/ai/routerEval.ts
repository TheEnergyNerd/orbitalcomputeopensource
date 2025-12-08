import { JOB_TYPES, DESTS, RouterPolicy, RouterWeights, DestId } from "./routerTypes";
import { clamp01 } from "../util/math";
import type { GlobalCongestionFrame } from "../sim/orbit/congestion";
import type { FailureEvent } from "../sim/orbit/failure";
import { applyCongestionToGlobalMetrics } from "../sim/link/globeToMacro";

export interface JobDemand {
  jobTypeId: JobTypeId;
  jobsPerYear: number;
}

export interface RouterEvalResult {
  totalCost: number;
  totalLatencyPenalty: number;
  totalCarbon: number;
  reward: number;
  // aggregated compute load per dest to feed into sim
  computeUnitsPerDest: Record<DestId, number>;
}

export function evalRouterPolicy(
  policy: RouterPolicy,
  weights: RouterWeights,
  demand: JobDemand[],
  congestionFrame?: GlobalCongestionFrame | null,
  activeFailures?: FailureEvent[]
): RouterEvalResult {
  // Apply congestion multipliers if available
  const multipliers = congestionFrame
    ? applyCongestionToGlobalMetrics(congestionFrame)
    : { latencyMultiplier: 1.0, costMultiplier: 1.0, volatilityIndex: 0.0, carbonMultiplier: 1.0 };

  let totalCost = 0;
  let totalLatencyPenalty = 0;
  let totalCarbon = 0;
  const computeUnitsPerDest: Record<DestId, number> = {
    groundEdge: 0,
    groundCore: 0,
    orbit: 0,
  };

  for (const d of demand) {
    const jobConfig = JOB_TYPES.find(j => j.id === d.jobTypeId)!;
    const jobs = d.jobsPerYear;

    for (const dest of DESTS) {
      const p = clamp01(policy.jobs[d.jobTypeId]?.[dest.id] ?? 0);
      if (p <= 0) continue;

      const jobsHere = jobs * p;
      const units = jobsHere * jobConfig.sizeUnits;

      computeUnitsPerDest[dest.id] += units;

      // Apply congestion multipliers (only to orbit for now)
      const baseCost = units * dest.baseCostPerUnit;
      const cost = dest.id === 'orbit' 
        ? baseCost * multipliers.costMultiplier 
        : baseCost;

      const baseLatencyMs = dest.baseLatencyMs;
      const latencyMs = dest.id === 'orbit'
        ? baseLatencyMs * multipliers.latencyMultiplier
        : baseLatencyMs;
      const latencyPenalty = jobConfig.latencySensitivity * latencyMs * jobsHere;

      const baseCarbon = units * dest.baseCarbonPerUnit;
      const carbon = dest.id === 'orbit'
        ? baseCarbon * multipliers.carbonMultiplier
        : baseCarbon;

      totalCost += cost;
      totalLatencyPenalty += latencyPenalty;
      totalCarbon += carbon;
    }
  }

  const { cost: wc, latency: wl, carbon: wco } = weights;
  const reward =
    -wc * totalCost -
    wl * totalLatencyPenalty -
    wco * totalCarbon;

  return { totalCost, totalLatencyPenalty, totalCarbon, reward, computeUnitsPerDest };
}

// Re-export for convenience
import type { JobTypeId } from "./routerTypes";
export type { JobTypeId };


