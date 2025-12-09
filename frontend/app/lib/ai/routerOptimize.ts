import { RouterPolicy, RouterWeights, JOB_TYPES, DESTS } from "./routerTypes";
import { evalRouterPolicy, JobDemand } from "./routerEval";
import type { GlobalCongestionFrame } from "../sim/orbit/congestion";
import type { FailureEvent } from "../sim/orbit/failure";
import { adjustPolicyForCongestion } from "./routerPolicy";

export function randomPerturbPolicy(
  policy: RouterPolicy,
  magnitude = 0.1,
): RouterPolicy {
  const next: RouterPolicy = { jobs: {} as any };

  for (const jt of JOB_TYPES) {
    const row = policy.jobs[jt.id];
    const newRow: any = {};
    let sum = 0;
    for (const dest of DESTS) {
      const old = row[dest.id] ?? 0;
      const noise = (Math.random() * 2 - 1) * magnitude;
      const v = Math.max(0.01, old + noise);
      newRow[dest.id] = v;
      sum += v;
    }
    // Normalize
    for (const dest of DESTS) {
      newRow[dest.id] /= sum || 1;
    }
    next.jobs[jt.id] = newRow;
  }

  return next;
}

export function optimizeRouterPolicy(
  policy: RouterPolicy,
  weights: RouterWeights,
  demand: JobDemand[],
  steps: number,
  congestionFrame?: GlobalCongestionFrame | null,
  activeFailures?: FailureEvent[]
): RouterPolicy {
  // Adjust base policy for congestion/failures
  let current = adjustPolicyForCongestion(policy, congestionFrame || null, activeFailures || []);
  let currentEval = evalRouterPolicy(current, weights, demand, congestionFrame, activeFailures);

  for (let i = 0; i < steps; i++) {
    const candidate = randomPerturbPolicy(current, 0.15);
    // Re-adjust candidate for congestion
    const adjustedCandidate = adjustPolicyForCongestion(candidate, congestionFrame || null, activeFailures || []);
    const candEval = evalRouterPolicy(adjustedCandidate, weights, demand, congestionFrame, activeFailures);
    if (candEval.reward > currentEval.reward) {
      current = adjustedCandidate;
      currentEval = candEval;
    }
  }

  return current;
}


