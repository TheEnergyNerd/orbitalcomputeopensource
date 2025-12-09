/**
 * RL-Lite Routing Engine
 * Implements simple policy gradient updates for adaptive routing
 */

import type { RouterPolicy, RouterWeights } from './routerTypes';
import { evalRouterPolicy, type JobDemand } from './routerEval';
import { JOB_TYPES, DESTS } from './routerTypes';

export interface RLState {
  policy: RouterPolicy;
  weights: RouterWeights;
  learningRate: number;
  temperature: number; // For softmax exploration
}

/**
 * Softmax function for policy selection
 */
function softmax(logits: number[], temperature: number = 1.0): number[] {
  const maxLogit = Math.max(...logits);
  const expLogits = logits.map(l => Math.exp((l - maxLogit) / temperature));
  const sum = expLogits.reduce((a, b) => a + b, 0);
  return expLogits.map(e => e / sum);
}

/**
 * Compute policy gradient (simplified REINFORCE-style)
 */
export function computePolicyGradient(
  currentPolicy: RouterPolicy,
  weights: RouterWeights,
  demand: JobDemand[],
  alpha: number = 0.1
): RouterPolicy {
  const currentEval = evalRouterPolicy(currentPolicy, weights, demand);
  const baselineReward = currentEval.reward;

  // Perturb each policy entry and estimate gradient
  const newPolicy: RouterPolicy = { jobs: {} as any };
  const epsilon = 0.01;

  for (const jobType of JOB_TYPES) {
    const row = currentPolicy.jobs[jobType.id];
    const newRow: any = {};
    const gradients: Record<string, number> = {};

    // Estimate gradient for each destination
    for (const dest of DESTS) {
      const perturbedPolicy: RouterPolicy = {
        jobs: {
          ...currentPolicy.jobs,
          [jobType.id]: {
            ...row,
            [dest.id]: Math.max(0.01, Math.min(0.99, row[dest.id] + epsilon)),
          },
        },
      };
      // Normalize the perturbed row
      const perturbedRow = perturbedPolicy.jobs[jobType.id];
      const sum = Object.values(perturbedRow).reduce((a, b) => a + b, 0);
      for (const k in perturbedRow) {
        perturbedRow[k as keyof typeof perturbedRow] /= sum;
      }

      const perturbedEval = evalRouterPolicy(perturbedPolicy, weights, demand);
      const gradient = (perturbedEval.reward - baselineReward) / epsilon;
      gradients[dest.id] = gradient;
    }

    // Apply gradient ascent (we want to maximize reward)
    const logits = DESTS.map(dest => {
      const currentProb = row[dest.id];
      const gradient = gradients[dest.id] || 0;
      return Math.log(currentProb + 0.001) + alpha * gradient;
    });

    const probs = softmax(logits, 1.0);
    DESTS.forEach((dest, idx) => {
      newRow[dest.id] = probs[idx];
    });

    newPolicy.jobs[jobType.id] = newRow;
  }

  return newPolicy;
}

/**
 * Update policy using RL-lite learning
 */
export function updatePolicyWithRL(
  state: RLState,
  demand: JobDemand[],
  steps: number = 1
): RouterPolicy {
  let currentPolicy = state.policy;

  for (let i = 0; i < steps; i++) {
    const gradient = computePolicyGradient(
      currentPolicy,
      state.weights,
      demand,
      state.learningRate
    );

    // Blend current policy with gradient update
    const blended: RouterPolicy = { jobs: {} as any };
    for (const jobType of JOB_TYPES) {
      const currentRow = currentPolicy.jobs[jobType.id];
      const gradientRow = gradient.jobs[jobType.id];
      const newRow: any = {};

      for (const dest of DESTS) {
        // Interpolate between current and gradient
        newRow[dest.id] = currentRow[dest.id] * 0.9 + gradientRow[dest.id] * 0.1;
      }

      // Normalize
      const sum = Object.values(newRow).reduce((a: number, b: number) => a + b, 0);
      for (const k in newRow) {
        newRow[k] /= sum;
      }

      blended.jobs[jobType.id] = newRow;
    }

    currentPolicy = blended;
  }

  return currentPolicy;
}

/**
 * Create initial RL state
 */
export function createRLState(
  initialPolicy: RouterPolicy,
  weights: RouterWeights,
  learningRate: number = 0.1,
  temperature: number = 1.0
): RLState {
  return {
    policy: initialPolicy,
    weights,
    learningRate,
    temperature,
  };
}


