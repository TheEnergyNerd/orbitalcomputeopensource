/**
 * Orbit Score calculation
 * Combines improvements across all metrics into a single score
 */

export interface ScoreWeights {
  cost: number;
  opex: number;
  latency: number;
  carbon: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  cost: 0.2,
  opex: 0.3,
  latency: 0.25,
  carbon: 0.25,
};

export interface ScoreMetrics {
  costImprovement: number; // % improvement (negative = worse)
  opexImprovement: number; // % improvement
  latencyImprovement: number; // ms improvement (negative = worse)
  carbonImprovement: number; // % improvement
}

export function calculateOrbitScore(
  metrics: ScoreMetrics,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  launchStress: number = 0, // 0-1, penalty if > 1
  factoryStress: number = 0 // 0-1, penalty if > 1
): { score: number; label: string; description: string } {
  // Cap improvements at reasonable values
  const cappedCost = Math.max(-50, Math.min(50, metrics.costImprovement));
  const cappedOpex = Math.max(-50, Math.min(50, metrics.opexImprovement));
  const cappedCarbon = Math.max(-50, Math.min(50, metrics.carbonImprovement));
  
  // Scale latency: 1ms improvement = 10 points, cap at ±50ms
  const scaledLatency = Math.max(-50, Math.min(50, metrics.latencyImprovement)) * 10;
  
  // Calculate base score
  let score = 
    weights.cost * cappedCost * 10 +
    weights.opex * cappedOpex * 10 +
    weights.latency * scaledLatency +
    weights.carbon * cappedCarbon * 10;
  
  // Apply stress penalties
  if (launchStress > 1) {
    const launchPenalty = (launchStress - 1) * 0.2; // 20% penalty per unit over capacity
    score *= (1 - launchPenalty);
  }
  
  if (factoryStress > 1) {
    const factoryPenalty = (factoryStress - 1) * 0.15; // 15% penalty per unit over capacity
    score *= (1 - factoryPenalty);
  }
  
  // Round to integer
  score = Math.round(score);
  
  // Determine label based on score and metric mix
  let label = '';
  let description = '';
  
  if (score < 200) {
    label = 'Struggling';
    description = 'Needs optimization';
  } else if (score < 400) {
    label = 'Developing';
    description = 'Making progress';
  } else if (score < 600) {
    label = 'Efficient';
    description = 'Good balance';
  } else if (score < 800) {
    label = 'Optimized';
    description = 'Strong performance';
  } else {
    label = 'Elite';
    description = 'Exceptional architecture';
  }
  
  // Add qualifiers based on metric mix
  const qualifiers: string[] = [];
  if (cappedCarbon < -30) qualifiers.push('green');
  if (cappedCarbon > 10) qualifiers.push('dirty');
  if (scaledLatency < -30) qualifiers.push('fast');
  if (scaledLatency > 20) qualifiers.push('slow');
  if (cappedOpex < -20) qualifiers.push('cheap');
  if (cappedOpex > 15) qualifiers.push('expensive');
  
  if (qualifiers.length > 0) {
    description = qualifiers.join(', ');
  }
  
  return { score, label, description };
}

