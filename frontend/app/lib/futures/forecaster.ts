/**
 * AI Forecaster Module
 * Probabilistic forecasting for orbit vs ground compute costs
 * Uses learned parameters from historical data to generate forward uncertainty cones
 */

export type MarketSentiment = 'bullish' | 'bearish' | 'neutral';

export interface ForecastPoint {
  year: number;
  mean: number;
  stdev: number;
  upper_1sigma: number; // mean + 1σ (68% confidence)
  lower_1sigma: number; // mean - 1σ
  upper_2sigma: number; // mean + 2σ (95% confidence)
  lower_2sigma: number; // mean - 2σ
  volatility_index: number; // 0-1, controls cone width
  sentiment: MarketSentiment;
}

export interface ForecastCone {
  orbit: ForecastPoint[];
  ground: ForecastPoint[];
  currentYear: number;
  probabilityOrbitCheaper: number; // Probability orbit is cheaper than ground by end of forecast
}

export interface CostHistory {
  year: number;
  orbitCost: number;
  groundCost: number;
}

/**
 * AI Forecaster State
 * Maintains learned parameters from historical data
 */
export class Forecaster {
  private orbitHistory: CostHistory[] = [];
  private groundHistory: CostHistory[] = [];
  
  // Learned parameters
  private orbitLearningRate: number = 0.15; // α in cost ~ A * t^(-α)
  private groundLearningRate: number = 0.05; // β in cost ~ B * t^(β)
  private orbitBaseCost: number = 400;
  private groundBaseCost: number = 400;
  private orbitVariance: number = 0.1;
  private groundVariance: number = 0.05;
  
  /**
   * Update forecaster with new historical data
   */
  fitModel(history: CostHistory[]): void {
    if (history.length < 2) return;
    
    this.orbitHistory = history.filter(h => h.orbitCost > 0);
    this.groundHistory = history.filter(h => h.groundCost > 0);
    
    if (this.orbitHistory.length < 2 || this.groundHistory.length < 2) return;
    
    // Simple log-log regression for learning rates
    // log(cost) ~ a0 + a1*log(year_offset)
    const startYear = Math.min(...history.map(h => h.year));
    
    // Fit orbit learning curve
    const orbitLogData = this.orbitHistory.map(h => ({
      logYear: Math.log(Math.max(1, h.year - startYear + 1)),
      logCost: Math.log(Math.max(0.1, h.orbitCost)),
    }));
    
    if (orbitLogData.length >= 2) {
      const orbitAvgLogYear = orbitLogData.reduce((s, d) => s + d.logYear, 0) / orbitLogData.length;
      const orbitAvgLogCost = orbitLogData.reduce((s, d) => s + d.logCost, 0) / orbitLogData.length;
      
      let numerator = 0;
      let denominator = 0;
      for (const d of orbitLogData) {
        const dx = d.logYear - orbitAvgLogYear;
        const dy = d.logCost - orbitAvgLogCost;
        numerator += dx * dy;
        denominator += dx * dx;
      }
      
      if (denominator > 0) {
        const slope = numerator / denominator;
        this.orbitLearningRate = Math.max(0.05, Math.min(0.3, -slope)); // Negative slope = learning
        this.orbitBaseCost = Math.exp(orbitAvgLogCost - slope * orbitAvgLogYear);
      }
      
      // Estimate variance from residuals
      const residuals = orbitLogData.map(d => {
        const predicted = Math.log(this.orbitBaseCost) - this.orbitLearningRate * d.logYear;
        return Math.pow(d.logCost - predicted, 2);
      });
      this.orbitVariance = Math.sqrt(residuals.reduce((a, b) => a + b, 0) / residuals.length) * 0.5;
    }
    
    // Fit ground learning curve (similar process)
    const groundLogData = this.groundHistory.map(h => ({
      logYear: Math.log(Math.max(1, h.year - startYear + 1)),
      logCost: Math.log(Math.max(0.1, h.groundCost)),
    }));
    
    if (groundLogData.length >= 2) {
      const groundAvgLogYear = groundLogData.reduce((s, d) => s + d.logYear, 0) / groundLogData.length;
      const groundAvgLogCost = groundLogData.reduce((s, d) => s + d.logCost, 0) / groundLogData.length;
      
      let numerator = 0;
      let denominator = 0;
      for (const d of groundLogData) {
        const dx = d.logYear - groundAvgLogYear;
        const dy = d.logCost - groundAvgLogCost;
        numerator += dx * dy;
        denominator += dx * dx;
      }
      
      if (denominator > 0) {
        const slope = numerator / denominator;
        this.groundLearningRate = Math.max(0, Math.min(0.15, slope)); // Positive = cost increases
        this.groundBaseCost = Math.exp(groundAvgLogCost - slope * groundAvgLogYear);
      }
      
      const residuals = groundLogData.map(d => {
        const predicted = Math.log(this.groundBaseCost) + this.groundLearningRate * d.logYear;
        return Math.pow(d.logCost - predicted, 2);
      });
      this.groundVariance = Math.sqrt(residuals.reduce((a, b) => a + b, 0) / residuals.length) * 0.3;
    }
  }
  
  /**
   * Generate forecast cone for N years ahead
   */
  generateForecast(currentYear: number, yearsAhead: number = 20): ForecastCone {
    const startYear = this.orbitHistory.length > 0 
      ? Math.min(...this.orbitHistory.map(h => h.year), ...this.groundHistory.map(h => h.year))
      : currentYear;
    
    const orbitForecast: ForecastPoint[] = [];
    const groundForecast: ForecastPoint[] = [];
    
    for (let i = 0; i <= yearsAhead; i++) {
      const year = currentYear + i;
      const yearOffset = Math.max(1, year - startYear + 1);
      const logYearOffset = Math.log(yearOffset);
      
      // Orbit: cost decreases with learning (negative learning rate)
      const orbitMean = this.orbitBaseCost * Math.pow(yearOffset, -this.orbitLearningRate);
      const orbitStdev = orbitMean * this.orbitVariance * (1 + i * 0.1); // Variance increases with time
      const orbitVolatility = Math.min(1, orbitStdev / orbitMean);
      
      orbitForecast.push({
        year,
        mean: orbitMean,
        stdev: orbitStdev,
        upper_1sigma: orbitMean + orbitStdev,
        lower_1sigma: Math.max(0, orbitMean - orbitStdev),
        upper_2sigma: orbitMean + 2 * orbitStdev,
        lower_2sigma: Math.max(0, orbitMean - 2 * orbitStdev),
        volatility_index: orbitVolatility,
        sentiment: orbitMean < this.orbitBaseCost ? 'bullish' : 'bearish',
      });
      
      // Ground: cost may increase slightly (positive learning rate)
      const groundMean = this.groundBaseCost * Math.pow(yearOffset, this.groundLearningRate);
      const groundStdev = groundMean * this.groundVariance * (1 + i * 0.15);
      const groundVolatility = Math.min(1, groundStdev / groundMean);
      
      groundForecast.push({
        year,
        mean: groundMean,
        stdev: groundStdev,
        upper_1sigma: groundMean + groundStdev,
        lower_1sigma: Math.max(0, groundMean - groundStdev),
        upper_2sigma: groundMean + 2 * groundStdev,
        lower_2sigma: Math.max(0, groundMean - 2 * groundStdev),
        volatility_index: groundVolatility,
        sentiment: groundMean < this.groundBaseCost ? 'bullish' : 'bearish',
      });
    }
    
    // Calculate probability that orbit is cheaper than ground by end of forecast
    const lastOrbit = orbitForecast[orbitForecast.length - 1];
    const lastGround = groundForecast[groundForecast.length - 1];
    
    // Simple probability estimate: P(orbit < ground) based on normal distributions
    const meanDiff = lastOrbit.mean - lastGround.mean;
    const stdevCombined = Math.sqrt(lastOrbit.stdev ** 2 + lastGround.stdev ** 2);
    const zScore = -meanDiff / (stdevCombined || 1);
    // Approximate P(X < 0) for normal distribution
    const probabilityOrbitCheaper = 0.5 * (1 + Math.tanh(zScore));
    
    return {
      orbit: orbitForecast,
      ground: groundForecast,
      currentYear,
      probabilityOrbitCheaper,
    };
  }
  
  /**
   * Run Monte Carlo simulation for more accurate probability estimates
   */
  monteCarloForecast(currentYear: number, yearsAhead: number, nSims: number = 1000): ForecastCone {
    const baseForecast = this.generateForecast(currentYear, yearsAhead);
    
    // Run many simulations with random shocks
    const orbitSamples: number[][] = [];
    const groundSamples: number[][] = [];
    
    for (let sim = 0; sim < nSims; sim++) {
      const orbitPath: number[] = [];
      const groundPath: number[] = [];
      
      for (let i = 0; i <= yearsAhead; i++) {
        const year = currentYear + i;
        const yearOffset = Math.max(1, year - (this.orbitHistory[0]?.year || currentYear) + 1);
        
        // Sample with random walk on parameters
        const orbitShock = (Math.random() - 0.5) * 0.1;
        const groundShock = (Math.random() - 0.5) * 0.05;
        
        const orbitMean = this.orbitBaseCost * Math.pow(yearOffset, -(this.orbitLearningRate + orbitShock));
        const groundMean = this.groundBaseCost * Math.pow(yearOffset, this.groundLearningRate + groundShock);
        
        orbitPath.push(orbitMean * (1 + (Math.random() - 0.5) * this.orbitVariance * 2));
        groundPath.push(groundMean * (1 + (Math.random() - 0.5) * this.groundVariance * 2));
      }
      
      orbitSamples.push(orbitPath);
      groundSamples.push(groundPath);
    }
    
    // Aggregate to percentiles
    const orbitForecast: ForecastPoint[] = [];
    const groundForecast: ForecastPoint[] = [];
    
    for (let i = 0; i <= yearsAhead; i++) {
      const orbitValues = orbitSamples.map(sim => sim[i]).sort((a, b) => a - b);
      const groundValues = groundSamples.map(sim => sim[i]).sort((a, b) => a - b);
      
      const orbitMean = orbitValues[Math.floor(nSims * 0.5)];
      const orbitP16 = orbitValues[Math.floor(nSims * 0.16)];
      const orbitP84 = orbitValues[Math.floor(nSims * 0.84)];
      const orbitP2_5 = orbitValues[Math.floor(nSims * 0.025)];
      const orbitP97_5 = orbitValues[Math.floor(nSims * 0.975)];
      
      const groundMean = groundValues[Math.floor(nSims * 0.5)];
      const groundP16 = groundValues[Math.floor(nSims * 0.16)];
      const groundP84 = groundValues[Math.floor(nSims * 0.84)];
      const groundP2_5 = groundValues[Math.floor(nSims * 0.025)];
      const groundP97_5 = groundValues[Math.floor(nSims * 0.975)];
      
      orbitForecast.push({
        year: currentYear + i,
        mean: orbitMean,
        stdev: (orbitP84 - orbitP16) / 2,
        upper_1sigma: orbitP84,
        lower_1sigma: orbitP16,
        upper_2sigma: orbitP97_5,
        lower_2sigma: orbitP2_5,
        volatility_index: Math.min(1, (orbitP97_5 - orbitP2_5) / orbitMean),
        sentiment: orbitMean < baseForecast.orbit[i].mean ? 'bullish' : 'bearish',
      });
      
      groundForecast.push({
        year: currentYear + i,
        mean: groundMean,
        stdev: (groundP84 - groundP16) / 2,
        upper_1sigma: groundP84,
        lower_1sigma: groundP16,
        upper_2sigma: groundP97_5,
        lower_2sigma: groundP2_5,
        volatility_index: Math.min(1, (groundP97_5 - groundP2_5) / groundMean),
        sentiment: groundMean < baseForecast.ground[i].mean ? 'bullish' : 'bearish',
      });
    }
    
    // Calculate probability
    const cheaperCount = orbitSamples.filter((_, sim) => 
      orbitSamples[sim][yearsAhead] < groundSamples[sim][yearsAhead]
    ).length;
    const probabilityOrbitCheaper = cheaperCount / nSims;
    
    return {
      orbit: orbitForecast,
      ground: groundForecast,
      currentYear,
      probabilityOrbitCheaper,
    };
  }
}

