/**
 * Scenario Inputs and Metrics Types
 * Centralized types for Simple and Advanced modes
 */

import type { RocketId, PodTypeId } from './orbitConfigs';

export interface UpgradeMultipliers {
  silicon: number;
  chips: number;
  racks: number;
  launch: number;
  opexMultiplier: number;
  carbonMultiplier: number;
  launchRiskBonus: number;
}

export interface ScenarioInputs {
  rocketId: RocketId;
  podTypeId: PodTypeId;
  podsDeployed: number;      // user slider
  groundEnergyPrice: number; // $/MWh (slider or constant)
  baselineComputeDemandTflopYr: number; // constant target, e.g. 10,000 TFLOP-yr
  upgrades?: UpgradeMultipliers; // Optional upgrade multipliers
}

export interface ScenarioMetrics {
  // high-level comparison
  groundCostPerCompute: number;
  orbitCostPerCompute: number;

  groundOpexPerYear: number;
  orbitOpexPerYear: number;

  groundLatencyMs: number;
  orbitLatencyMs: number;

  groundCarbonTpy: number;
  orbitCarbonTpy: number;

  // launch / capex
  launchesRequiredPerYear: number;
  launchCapacityPerYear: number;
  launchStress: number;          // 0..1+
  capexTotal: number;            // $ for pods + launches
  budgetUsage: number;           // 0..1+ vs a configured budget cap

  // deltas
  costPerComputeDeltaPct: number;
  opexDeltaPct: number;
  latencyDeltaMs: number;
  latencyDeltaPct: number;
  carbonDeltaPct: number;

  // scoring
  orbitScore: number;
  
  // additional details for display
  orbitShare: number;            // 0..1
  groundShare: number;           // 0..1
  totalOrbitCompute: number;     // TFLOP-yr
}

/**
 * Year Series - Compute per year over 10-year horizon
 */
export type YearSeries = {
  years: number[];                    // e.g. [0,1,2,...,9]
  demandTFLOPyr: number[];            // demand per year
  groundTFLOPyr: number[];            // pure ground world
  orbitTFLOPyr: number[];             // orbit compute in mix world
  mixGroundTFLOPyr: number[];         // ground in mix world (demand - orbit)
  costPerComputeGround: number[];     // $/TFLOP-yr per year (pure ground)
  costPerComputeMix: number[];        // $/TFLOP-yr per year (ground+orbit)
  carbonPerComputeGround: number[];   // tCO2/TFLOP-yr per year
  carbonPerComputeMix: number[];     // tCO2/TFLOP-yr per year
  podsLaunchedPerYear: number[];     // pods launched in each year
};

