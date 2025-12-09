/**
 * Simulation Configuration
 * Core parameters that drive the year-by-year simulation
 */

import type { PodType, RocketType, FactoryTuning, StageThroughput } from './factoryTypes';
import { defaultPolicy } from '../ai/routerTypes';
import { aiDesignConstellation } from '../ai/constellationEval';
import type { RouterPolicy, RouterWeights } from '../ai/routerTypes';
import type { ConstellationParams } from '../ai/constellationTypes';
import type { GlobalCongestionFrame } from '../sim/orbit/congestion';
import type { FailureEvent } from '../sim/orbit/failure';
import type { FactoryState } from './factoryModel';
import { createDefaultFactoryState } from './factoryModel';

export interface SimulationConfig {
  // Time
  startYear: number;        // e.g. 2025
  totalDeployments: number; // = number of sim years (starts at 1)

  // Ground demand
  groundBaseTwh: number;
  groundDemandGrowthRate: number;   // 0–0.25
  groundEfficiencyGainRate: number; // 0–0.1
  maxOffloadShare: number;          // 0–1

  // Ground unit economics
  groundCostPerTwh: number;
  groundLatencyMs: number;
  groundOpexPerTwh: number;
  groundCarbonPerTwh: number;

  // Baseline orbital unit economics
  baseOrbitalCostPerTwh: number;
  baseOrbitalLatencyMs: number;
  baseOrbitalOpexPerTwh: number;
  baseOrbitalCarbonPerTwh: number;

  // Pipeline → orbital capacity
  podsPerDeploymentBase: number;
  racksPerPodBase: number;
  chipsPerRackBase: number;
  twhPerChipPerYear: number;

  // Archetypes
  podType: PodType;
  rocketType: RocketType;

  // Factory tuning (Factorio tab)
  factoryTuning: FactoryTuning;
  factoryState: FactoryState;

  // AI Router (optional)
  routerPolicy?: RouterPolicy;
  routerWeights?: RouterWeights;
  aiControlPercent?: number; // 0-1, how much router affects share vs strategy

  // Constellation (optional)
  constellation?: ConstellationParams;
  
  // Congestion and failures (optional)
  congestionFrame?: GlobalCongestionFrame | null;
  activeFailures?: FailureEvent[];
}

/**
 * Compute Strategy - Discrete strategy for pod mix
 */
export type ComputeStrategy = "edge_heavy" | "bulk_heavy" | "green_heavy" | "balanced";

/**
 * Launch Strategy - Discrete strategy for rocket mix
 */
export type LaunchStrategy = "heavy" | "medium" | "light";

/**
 * YearPlan - User's decision for a specific year
 */
export interface YearPlan {
  deploymentIntensity: number; // 0–1 fraction of factory throughput used
  computeStrategy: ComputeStrategy;
  launchStrategy: LaunchStrategy;
}

/**
 * YearStep - One year in the simulation timeline
 */
export interface YearStep {
  year: number;
  deploymentsCompleted: number;

  // Demand and capacity
  rawGroundDemandTwh: number;
  efficientGroundDemandTwh: number;
  offloadedToOrbitTwh: number;
  netGroundComputeTwh: number;
  orbitalComputeTwh: number;

  // Shares
  groundShare: number;
  orbitalShare: number;

  // Orbital asset counts
  podsTotal: number;
  racksTotal: number;
  chipsTotal: number;

  // KPIs (per-year snapshot)
  costPerComputeGround: number;
  costPerComputeMix: number;

  latencyGroundMs: number;
  latencyMixMs: number;

  opexGround: number;        // actual ground OPEX (improving)
  opexMix: number;           // mix OPEX (ground + orbital)
  opexSavings: number;       // savings vs all-ground
  opexGroundBaseline: number; // for backward compatibility

  carbonGround: number;      // actual ground carbon (decarb)
  carbonMix: number;         // mix carbon (ground + orbital)
  carbonSavings: number;     // savings vs all-ground
  carbonGroundBaseline: number; // for backward compatibility

  // Router metrics (if AI router enabled)
  routerTotalCost?: number;
  routerTotalLatencyPenalty?: number;
  routerTotalCarbon?: number;
  routerReward?: number;
  orbitShareFromRouter?: number;

  // For Factorio sparklines
  stageThroughputs: StageThroughput[];
}

/**
 * Default simulation configuration
 */
export function createDefaultConfig(): SimulationConfig {
  return {
    startYear: 2025,
    factoryState: createDefaultFactoryState(),
    totalDeployments: 1,
    groundBaseTwh: 500,             // baseline demand
    groundDemandGrowthRate: 0.10,   // 10%/year
    groundEfficiencyGainRate: 0.03, // 3%/year
    maxOffloadShare: 1.0,           // allow up to 100% offload
    // ground unit economics
    groundCostPerTwh: 400,
    groundLatencyMs: 120,
    groundOpexPerTwh: 300_000,      // $/TWh/yr
    groundCarbonPerTwh: 80_000,     // tCO2/TWh
    // orbital baseline (before pod/rocket multipliers)
    baseOrbitalCostPerTwh: 220,
    baseOrbitalLatencyMs: 40,
    baseOrbitalOpexPerTwh: 180_000,
    baseOrbitalCarbonPerTwh: 15_000,
    // pipeline mapping (will be overridden by deriveFactoryParameters)
    podsPerDeploymentBase: 10,
    racksPerPodBase: 4,
    chipsPerRackBase: 8,
    twhPerChipPerYear: 0.05,        // BIGGER for stronger divergence
    podType: "bulk",
    rocketType: "medium",
    factoryTuning: {
      silicon: { capacityLevel: 0, automationLevel: 0 },
      chips: { capacityLevel: 0, automationLevel: 0 },
      racks: { capacityLevel: 0, automationLevel: 0 },
      pods: { capacityLevel: 0, automationLevel: 0 },
      launch: { capacityLevel: 0, automationLevel: 0 },
    },
    // AI Router defaults
    routerPolicy: defaultPolicy,
    routerWeights: { cost: 1, latency: 1, carbon: 1 },
    aiControlPercent: 0.5,
    // Constellation defaults
    constellation: aiDesignConstellation("resilience"), // "balanced" not a valid ConstellationMode, use "resilience" instead
  };
}
