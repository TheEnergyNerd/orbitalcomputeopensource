/**
 * Orbit Score calculation - weighted improvements across metrics
 */

export interface ScoreMetrics {
  costPerComputeGround: number;
  costPerComputeMix: number;
  opexGround: number;
  opexMix: number;
  latencyGround: number;
  latencyMix: number;
  carbonGround: number;
  carbonMix: number;
  resilienceGround: number;
  resilienceMix: number;
}

export interface ScoreResult {
  score: number;
  label: string;
  launchPenalty: number;
}

/**
 * Calculate percentage improvement where lower is better
 */
function pctImprovementLowerIsBetter(mix: number, ground: number): number {
  if (ground === 0) return 0;
  const pct = ((ground - mix) / ground) * 100; // positive if mix better
  return Math.max(-50, Math.min(50, pct)); // clamp to [-50, 50]
}

/**
 * Calculate percentage improvement where higher is better
 */
function pctImprovementHigherIsBetter(mix: number, ground: number): number {
  if (ground === 0) return 0;
  const pct = ((mix - ground) / ground) * 100; // positive if mix better
  return Math.max(-50, Math.min(50, pct));
}

/**
 * Compute Orbit Score from metrics
 */
export function computeOrbitScore(
  metrics: ScoreMetrics,
  launchStress: number
): ScoreResult {
  const costScore = pctImprovementLowerIsBetter(
    metrics.costPerComputeMix,
    metrics.costPerComputeGround
  );
  const opexScore = pctImprovementLowerIsBetter(
    metrics.opexMix,
    metrics.opexGround
  );
  const latencyScore = pctImprovementLowerIsBetter(
    metrics.latencyMix,
    metrics.latencyGround
  );
  const carbonScore = pctImprovementLowerIsBetter(
    metrics.carbonMix,
    metrics.carbonGround
  );
  const resilScore = pctImprovementHigherIsBetter(
    metrics.resilienceMix,
    metrics.resilienceGround
  );

  const raw =
    0.25 * costScore +
    0.25 * opexScore +
    0.20 * latencyScore +
    0.20 * carbonScore +
    0.10 * resilScore;

  const launchPenalty = launchStress > 1 ? -10 * (launchStress - 1) : 0;

  const total = raw + launchPenalty;
  const score = Math.round(Math.max(-100, Math.min(100, total)));

  // Determine label
  let label: string;
  if (score < 0) {
    label = "Struggling";
  } else if (score < 50) {
    label = "Improving";
  } else if (score < 80) {
    label = "Strong Orbit Mix";
  } else {
    label = "Orbit-Optimized";
  }

  return { score, label, launchPenalty };
}

