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
}

export const SCENARIOS: ScenarioParams[] = [
  {
    key: "baseline",
    orbitInitialCostMultiple: 2.2,    // Orbit starts 2.2× more expensive
    orbitLearningRate: 0.08,          // 8% cheaper per year
    groundLearningRate: 0.015,        // 1.5% cheaper per year
    computePerKwGrowth: 1.12,         // +12% compute-per-kW/year
    powerGrowthPerYear: 0.015,        // +1.5% power/year
    techGrowthPerYear: 1.20,          // +20% PFLOPs/sat/year
    launchCostDeclinePerYear: 0.94,   // -6% $/kg/year
    demandGrowthPerYear: 1.07,        // +7% demand/year
    failureRateBase: 0.02,
    autonomyLevel: 1.5,
    backhaulPerSatTBps: 0.5,
    launchCarbonPerKg: 300,
  },
  {
    key: "orbitalBear",
    orbitInitialCostMultiple: 2.8,    // Orbit starts uglier, falls slower
    orbitLearningRate: 0.05,          // 5% cheaper per year (slower)
    groundLearningRate: 0.015,         // 1.5% cheaper per year (same)
    computePerKwGrowth: 1.08,          // +8% compute-per-kW/year (slower)
    powerGrowthPerYear: 0.02,          // +2% power/year (faster, less efficient)
    techGrowthPerYear: 1.06,           // +6% PFLOPs/sat/year
    launchCostDeclinePerYear: 0.98,    // -2% $/kg/year
    demandGrowthPerYear: 1.06,         // +6% demand/year
    failureRateBase: 0.05,
    autonomyLevel: 0.5,
    backhaulPerSatTBps: 0.2,
    launchCarbonPerKg: 600,
  },
  {
    key: "orbitalBull",
    orbitInitialCostMultiple: 1.8,     // Better bus + launch
    orbitLearningRate: 0.10,           // 10% cheaper per year (faster)
    groundLearningRate: 0.015,          // 1.5% cheaper per year (same)
    computePerKwGrowth: 1.18,          // +18% compute-per-kW/year (faster)
    powerGrowthPerYear: 0.01,          // +1% power/year (slower, more efficient)
    techGrowthPerYear: 1.35,           // +35% PFLOPs/sat/year
    launchCostDeclinePerYear: 0.90,     // -10% $/kg/year
    demandGrowthPerYear: 1.08,          // +8% demand/year
    failureRateBase: 0.01,
    autonomyLevel: 3.0,
    backhaulPerSatTBps: 1.0,
    launchCarbonPerKg: 150,
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

