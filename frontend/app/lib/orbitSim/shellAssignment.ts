/**
 * Satellite Shell Assignment Logic
 * Multi-objective scoring for shell selection
 */

import { ORBIT_SHELLS, type OrbitShell } from "./orbitShells";

export interface ShellScore {
  shell: OrbitShell;
  score: number;
  factors: {
    congestionRelief: number;
    latencyBenefit: number;
    carbonBenefit: number;
    costEfficiency: number;
    shellSaturation: number;
  };
}

export interface ShellAssignmentWeights {
  w1: number; // congestionRelief
  w2: number; // latencyBenefit
  w3: number; // carbonBenefit
  w4: number; // costEfficiency
  w5: number; // shellSaturation (negative)
}

const DEFAULT_WEIGHTS: ShellAssignmentWeights = {
  w1: 0.3, // Congestion relief
  w2: 0.25, // Latency benefit
  w3: 0.2, // Carbon benefit
  w4: 0.15, // Cost efficiency
  w5: 0.1, // Shell saturation (penalty)
};

/**
 * Calculate congestion relief score for a shell
 */
function calculateCongestionRelief(shell: OrbitShell, currentCongestion: number): number {
  const capacity = shell.congestion_capacity;
  const utilization = currentCongestion; // 0-1
  const availableCapacity = 1 - utilization;
  return availableCapacity * (capacity / 10000); // Normalize
}

/**
 * Calculate latency benefit score
 */
function calculateLatencyBenefit(shell: OrbitShell): number {
  // Lower latency = higher benefit
  const maxLatency = 220; // MEO max
  return 1 - (shell.latency_ms / maxLatency);
}

/**
 * Calculate carbon benefit score
 */
function calculateCarbonBenefit(shell: OrbitShell): number {
  // Lower carbon amortization = higher benefit
  const maxCarbon = 1.4; // VLEO max
  return 1 - (shell.carbon_amortization_factor / maxCarbon);
}

/**
 * Calculate cost efficiency score
 */
function calculateCostEfficiency(shell: OrbitShell): number {
  // Higher solar efficiency = higher benefit
  return shell.solar_efficiency;
}

/**
 * Calculate shell saturation penalty
 */
function calculateShellSaturation(shell: OrbitShell, currentSatsInShell: number): number {
  const capacity = shell.congestion_capacity;
  const saturation = currentSatsInShell / capacity;
  return saturation; // 0-1, higher = more penalty
}

/**
 * Score all shells for a new satellite assignment
 */
export function scoreShells(
  currentCongestion: Record<string, number>,
  currentSatsPerShell: Record<string, number>,
  weights: ShellAssignmentWeights = DEFAULT_WEIGHTS
): ShellScore[] {
  const scores: ShellScore[] = [];
  
  for (const shell of ORBIT_SHELLS) {
    const shellId = shell.id;
    const congestion = currentCongestion[shellId] || 0;
    const satsInShell = currentSatsPerShell[shellId] || 0;
    
    const factors = {
      congestionRelief: calculateCongestionRelief(shell, congestion),
      latencyBenefit: calculateLatencyBenefit(shell),
      carbonBenefit: calculateCarbonBenefit(shell),
      costEfficiency: calculateCostEfficiency(shell),
      shellSaturation: calculateShellSaturation(shell, satsInShell),
    };
    
    const score =
      weights.w1 * factors.congestionRelief +
      weights.w2 * factors.latencyBenefit +
      weights.w3 * factors.carbonBenefit +
      weights.w4 * factors.costEfficiency -
      weights.w5 * factors.shellSaturation;
    
    scores.push({
      shell,
      score,
      factors,
    });
  }
  
  return scores;
}

/**
 * Select shell using softmax probability distribution
 */
export function selectShellWithSoftmax(scores: ShellScore[]): OrbitShell {
  // Apply softmax
  const maxScore = Math.max(...scores.map(s => s.score));
  const expScores = scores.map(s => Math.exp(s.score - maxScore));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  const probabilities = expScores.map(exp => exp / sumExp);
  
  // Sample from distribution
  const random = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (random <= cumulative) {
      return scores[i].shell;
    }
  }
  
  // Fallback to highest score
  return scores.reduce((best, current) => 
    current.score > best.score ? current : best
  ).shell;
}

/**
 * Assign satellite to shell using multi-objective scoring
 */
export function assignSatelliteToShell(
  currentCongestion: Record<string, number>,
  currentSatsPerShell: Record<string, number>,
  weights?: ShellAssignmentWeights
): OrbitShell {
  const scores = scoreShells(currentCongestion, currentSatsPerShell, weights);
  return selectShellWithSoftmax(scores);
}

