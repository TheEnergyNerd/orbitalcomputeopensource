/**
 * Single Source of Truth for Simulation State
 * All components read from this state - no freelancing calculations
 */

export type Location = "edge" | "core" | "orbit";

export interface DeploymentDecision {
  podsLaunched: number;
  launcherMix: Record<string, number>; // e.g., { "heavy": 0.5, "medium": 0.3, "light": 0.2 }
}

export interface SimulationYear {
  year: number;
  
  // 1) deployments + capacity
  deployments: DeploymentDecision;
  capacity: Record<Location, number>; // TWh/yr or MW equivalent
  
  // 2) routing (AI policy)
  routing: {
    // For each job class, where does it actually go
    jobShares: {
      realtime: Record<Location, number>;   // sum to 1
      interactive: Record<Location, number>;
      batch: Record<Location, number>;
      cold: Record<Location, number>;
    };
  };
  
  // 3) per-location performance + cost
  costPerCompute: Record<Location, number>;     // $/unit
  latencyMs: Record<Location, number>;
  carbonPerYear: Record<Location, number>;     // tCO2
  opexPerYear: Record<Location, number>;
  
  // 4) global aggregates actually shown in charts
  aggregates: {
    costPerComputeMix: number;
    latencyMixMs: number;
    carbonMix: number;
    opexMix: number;
    orbitShareOfCompute: number;
  };
}

export interface FuturesForecast {
  points: Array<{
    year: number;
    costMix: number;
    latencyMix: number;
    carbonMix: number;
  }>;
  pOrbitCheaperByHorizon: number; // 0-1
  sentimentLabel: "Bullish on Orbit" | "Neutral on Orbit" | "Bearish on Orbit";
  sentimentScore: number; // -1 to 1
}

export interface SimulationState {
  currentIndex: number;
  years: SimulationYear[];
  futures?: FuturesForecast;
}

