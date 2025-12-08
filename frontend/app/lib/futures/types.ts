/**
 * Futures Engine Types
 * Core types for Monte-Carlo economic simulation and RL deployment policy
 */

export type StrategyId = "latency" | "cost" | "carbon" | "balanced";

export interface WorldState {
  year: number;
  orbitCost: number;   // $/unit
  groundCost: number;  // $/unit
  orbitCapacity: number;
  groundCapacity: number;
  carbonPrice: number; // $/tCO2
  energyCostGround: number; // $/MWh
  launchCost: number;  // $/kg equivalent
}

export interface WorldParams {
  startYear: number;
  horizonYears: number;
  baseOrbitLearningRate: number;   // e.g. 0.15
  baseGroundLearningRate: number;  // e.g. 0.03
  shockVolatility: number;         // 0–1, macro randomness
}

export interface DeploymentAction {
  orbitBuild: number;   // new orbit capacity this year
  groundBuild: number;  // new ground capacity this year
}

export interface StrategyConfig {
  id: StrategyId;
  wCost: number;
  wLatency: number;
  wCarbon: number;
}

export interface ForecastPoint {
  year: number;
  meanOrbitCost: number;
  meanGroundCost: number;
  p16Orbit: number;
  p84Orbit: number;
  p2_5Orbit: number;
  p97_5Orbit: number;
  p16Ground: number;
  p84Ground: number;
  p2_5Ground: number;
  p97_5Ground: number;
  volatilityOrbit: number; // 0–1 scaled
  volatilityGround: number;
}

export interface ForecastResult {
  points: ForecastPoint[];
  probOrbitCheaperByHorizon: number; // 0–1
}

export interface SentimentSnapshot {
  // +1 strong bullish on orbit, -1 strong bearish
  orbitSentiment: number;
  sentimentLabel?: 'bullish' | 'bearish' | 'neutral'; // Probability-based label
  // 0–1 overall volatility level
  volatilityLevel: number;
}

