/**
 * FUTURES CONE DRIVER SET (MONTE CARLO)
 * Randomize only: Learning Rate Variance, Demand Growth Variance, Launch Cadence Variance, Failure Variance
 * 
 * Sim runs: 100 → 1,000 trajectories max
 * 
 * Outputs: Cone Width, Probability Orbit Beats Ground by Year N, Bullish/Neutral/Bearish
 */

export interface FuturesDriver {
  learning_rate_variance: number; // ±X%
  demand_growth_variance: number; // ±X%
  launch_cadence_variance: number; // ±X%
  failure_variance: number; // ±X%
}

export interface FuturesTrajectory {
  year: number;
  orbital_cost: number;
  ground_cost: number;
  orbital_cheaper: boolean;
  crossover_year: number | null;
}

export interface FuturesConeResult {
  trajectories: FuturesTrajectory[][];
  cone_width: number; // Uncertainty measure
  probability_orbit_beats_ground: Record<number, number>; // year -> probability
  bullish_probability: number;
  neutral_probability: number;
  bearish_probability: number;
  sentiment: "bullish" | "neutral" | "bearish";
}

const DEFAULT_VARIANCE: FuturesDriver = {
  learning_rate_variance: 0.02, // ±2%
  demand_growth_variance: 0.05, // ±5%
  launch_cadence_variance: 0.10, // ±10%
  failure_variance: 0.05, // ±5%
};

/**
 * Generate random variance for a driver
 */
function randomVariance(base: number, variance: number): number {
  const multiplier = 1 + (Math.random() * 2 - 1) * variance; // -variance to +variance
  return base * multiplier;
}

/**
 * Run single Monte Carlo trajectory
 */
function runTrajectory(
  baseLearningRate: number,
  baseDemandGrowth: number,
  baseLaunchCadence: number,
  baseFailureRate: number,
  driver: FuturesDriver,
  years: number[]
): FuturesTrajectory[] {
  const trajectory: FuturesTrajectory[] = [];
  let crossover_year: number | null = null;
  
  for (const year of years) {
    const learningRate = randomVariance(baseLearningRate, driver.learning_rate_variance);
    const demandGrowth = randomVariance(baseDemandGrowth, driver.demand_growth_variance);
    const launchCadence = randomVariance(baseLaunchCadence, driver.launch_cadence_variance);
    const failureRate = randomVariance(baseFailureRate, driver.failure_variance);
    
    // Simplified cost calculation (would use actual models in real implementation)
    const yearsFromStart = year - 2025;
    const orbital_cost = 1000 * Math.pow(0.95, yearsFromStart) * (1 + failureRate);
    const ground_cost = 1000 * Math.pow(1 - learningRate, yearsFromStart * 0.5);
    
    const orbital_cheaper = orbital_cost < ground_cost;
    
    if (!crossover_year && orbital_cheaper) {
      crossover_year = year;
    }
    
    trajectory.push({
      year,
      orbital_cost,
      ground_cost,
      orbital_cheaper,
      crossover_year,
    });
  }
  
  return trajectory;
}

/**
 * Run Monte Carlo simulation
 */
export function runMonteCarloFutures(
  baseLearningRate: number = 0.12,
  baseDemandGrowth: number = 0.10,
  baseLaunchCadence: number = 100, // launches/year
  baseFailureRate: number = 0.01,
  driver: FuturesDriver = DEFAULT_VARIANCE,
  numTrajectories: number = 100,
  startYear: number = 2025,
  endYear: number = 2040
): FuturesConeResult {
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  const trajectories: FuturesTrajectory[][] = [];
  
  // Run trajectories
  for (let i = 0; i < numTrajectories; i++) {
    const trajectory = runTrajectory(
      baseLearningRate,
      baseDemandGrowth,
      baseLaunchCadence,
      baseFailureRate,
      driver,
      years
    );
    trajectories.push(trajectory);
  }
  
  // Calculate cone width (standard deviation of costs at each year)
  let max_cone_width = 0;
  const year_probabilities: Record<number, number> = {};
  
  for (const year of years) {
    const costs_at_year = trajectories.map(t => {
      const point = t.find(p => p.year === year);
      return point ? point.orbital_cost : 0;
    });
    
    const mean = costs_at_year.reduce((a, b) => a + b, 0) / costs_at_year.length;
    const variance = costs_at_year.reduce((sum, cost) => sum + Math.pow(cost - mean, 2), 0) / costs_at_year.length;
    const std_dev = Math.sqrt(variance);
    
    max_cone_width = Math.max(max_cone_width, std_dev);
    
    // Calculate probability orbit beats ground at this year
    const orbit_cheaper_count = trajectories.filter(t => {
      const point = t.find(p => p.year === year);
      return point?.orbital_cheaper || false;
    }).length;
    
    year_probabilities[year] = orbit_cheaper_count / numTrajectories;
  }
  
  // Calculate sentiment (based on probability of orbit beating ground by 2035)
  const targetYear = 2035;
  const targetProb = year_probabilities[targetYear] || 0;
  
  let sentiment: "bullish" | "neutral" | "bearish";
  if (targetProb > 0.6) {
    sentiment = "bullish";
  } else if (targetProb < 0.4) {
    sentiment = "bearish";
  } else {
    sentiment = "neutral";
  }
  
  return {
    trajectories,
    cone_width: max_cone_width,
    probability_orbit_beats_ground: year_probabilities,
    bullish_probability: targetProb > 0.6 ? targetProb : 0,
    neutral_probability: targetProb >= 0.4 && targetProb <= 0.6 ? targetProb : 0,
    bearish_probability: targetProb < 0.4 ? 1 - targetProb : 0,
    sentiment,
  };
}

