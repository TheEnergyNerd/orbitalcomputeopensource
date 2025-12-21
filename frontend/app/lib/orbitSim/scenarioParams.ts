/**
 * Centralized Scenario Parameters
 * Defines distinct parameters for baseline, bull, and bear scenarios
 */

export type ScenarioKey = "baseline" | "orbitalBear" | "orbitalBull";

export interface ScenarioParams {
  key: ScenarioKey;
  orbitInitialCostMultiple: number;  // How much more expensive orbit starts vs ground
  orbitLearningRate: number;         // How fast orbital $/compute falls (per year)
  groundLearningRate: number;        // How fast ground $/compute falls (per year)
  computePerKwGrowth: number;        // Perf/W improvement (exponential growth factor)
  powerGrowthPerYear: number;        // Satellite power growth (linear growth rate)
  // Additional physics params
  techGrowthPerYear: number;          // PFLOPs/sat/year growth
  launchCostDeclinePerYear: number;   // $/kg/year decline
  demandGrowthPerYear: number;       // Demand growth per year
  failureRateBase: number;           // Base failure rate
  autonomyLevel: number;              // Autonomy level
  backhaulPerSatTBps: number;         // Backhaul capacity per satellite
  launchCarbonPerKg: number;          // Carbon per kg to LEO
  // Scenario multipliers for differentiation
  launchCadenceMultiplier: number;    // Multiplier for launch cadence (affects fleet size)
  busPowerMultiplier: number;         // Multiplier for bus power (affects kW/sat)
  lifetimeMultiplier: number;         // Multiplier for satellite lifetime (affects retirements)
  spaceTrafficEnabled?: boolean;      // Toggle for congestion costs
}

export const SCENARIOS: ScenarioParams[] = [
  {
    key: "baseline",
    // LESS OPTIMISTIC: Slightly shifted toward bear case (~10% reduction)
    orbitInitialCostMultiple: 3.5,    // Was 3.25 - Slightly higher initial cost
    orbitLearningRate: 0.065,          // Was 0.07 - Slightly slower learning
    groundLearningRate: 0.020,        // Unchanged
    computePerKwGrowth: 1.10,         // Was 1.115 - Slightly slower efficiency gains
    powerGrowthPerYear: 0.0068,       // Was 0.0075 - Slightly slower power scaling
    techGrowthPerYear: 1.19,          // Was 1.215 - Slightly slower tech growth
    launchCostDeclinePerYear: 0.93,   // Was 0.92 - Slightly slower cost decline
    demandGrowthPerYear: 1.25,        // Was 1.275 - Slightly lower demand growth
    failureRateBase: 0.045,            // Unchanged
    autonomyLevel: 1.65,               // Unchanged
    backhaulPerSatTBps: 0.55,          // Unchanged
    launchCarbonPerKg: 475,           // Unchanged
    // Scenario multipliers - BASELINE should be 1.0 (no reduction)
    launchCadenceMultiplier: 1.0,      // BASELINE: full launch cadence
    busPowerMultiplier: 0.92,         // Was 1.0 - 8% slower power scaling
    lifetimeMultiplier: 1.0,           // Unchanged
    spaceTrafficEnabled: false,
  },
  {
    key: "orbitalBear",
    // LESS PESSIMISTIC: More realistic downside (25-35% of base instead of 12%)
    orbitInitialCostMultiple: 4.5,    // Was 5.0 - Slightly less pessimistic
    orbitLearningRate: 0.03,          // Was 0.02 - Slightly better learning (3% per year)
    groundLearningRate: 0.025,         // Unchanged
    computePerKwGrowth: 1.06,         // Was 1.05 - Slightly better efficiency gains
    powerGrowthPerYear: 0.006,        // Was 0.005 - Slightly better power scaling
    techGrowthPerYear: 1.05,          // Was 1.03 - Slightly better tech growth
    launchCostDeclinePerYear: 0.97,   // Was 0.99 - Slightly better cost decline
    demandGrowthPerYear: 1.18,        // Was 1.15 - Slightly higher demand growth
    failureRateBase: 0.07,            // Was 0.08 - Slightly lower failure rate
    autonomyLevel: 0.5,               // Was 0.3 - Better autonomy
    backhaulPerSatTBps: 0.15,         // Was 0.1 - Better bandwidth
    launchCarbonPerKg: 700,            // Was 800 - Less carbon intensive
    // Scenario multipliers - Less aggressive reduction
    launchCadenceMultiplier: 0.6,     // Was 0.5 - 40% reduction instead of 50%
    busPowerMultiplier: 0.75,         // Was 0.7 - 25% reduction instead of 30%
    lifetimeMultiplier: 0.75,         // Was 0.7 - 5.25 years instead of 5
    spaceTrafficEnabled: false,
  },
  {
    key: "orbitalBull",
    // REBALANCED: More aggressive to compensate for baseline being more conservative
    orbitInitialCostMultiple: 1.5,     // Was 1.8 - More optimistic (lower initial cost)
    orbitLearningRate: 0.12,           // Was 0.10 - Faster learning (12% per year)
    groundLearningRate: 0.015,          // 1.5% cheaper per year (unchanged)
    computePerKwGrowth: 1.18,          // +18% compute-per-kW/year (unchanged)
    powerGrowthPerYear: 0.01,          // +1% power/year (unchanged)
    techGrowthPerYear: 1.40,           // Was 1.35 - AI chip boom (40% per year)
    launchCostDeclinePerYear: 0.85,     // Was 0.90 - Faster decline (Starship success, 15% per year)
    demandGrowthPerYear: 1.40,          // +40% demand/year (unchanged)
    failureRateBase: 0.01,
    autonomyLevel: 3.0,
    backhaulPerSatTBps: 1.0,
    launchCarbonPerKg: 150,
    // Scenario multipliers - BULL: aggressive
    launchCadenceMultiplier: 1.5,      // 50% more launches
    busPowerMultiplier: 1.3,           // Faster power scaling (200 kW by 2040 instead of 150)
    lifetimeMultiplier: 1.3,           // 9 years instead of 7
    spaceTrafficEnabled: false,
  },
];

/**
 * Get scenario params by scenario mode string
 */
export function getScenarioParams(scenarioMode: string): ScenarioParams {
  const normalized = scenarioMode.toLowerCase().replace("_", "");
  
  if (normalized.includes("bull")) {
    return SCENARIOS.find(s => s.key === "orbitalBull")!;
  } else if (normalized.includes("bear")) {
    return SCENARIOS.find(s => s.key === "orbitalBear")!;
  } else {
    return SCENARIOS.find(s => s.key === "baseline")!;
  }
}

/**
 * Get scenario key from scenario mode
 */
export function getScenarioKey(scenarioMode: string): ScenarioKey {
  const normalized = scenarioMode.toLowerCase().replace("_", "");
  
  if (normalized.includes("bull")) {
    return "orbitalBull";
  } else if (normalized.includes("bear")) {
    return "orbitalBear";
  } else {
    return "baseline";
  }
}

