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
    // REBALANCED: Slightly more bullish for crossover ~2033-2034 (between old 2032 and current 2036)
    orbitInitialCostMultiple: 2.2,    // Was 2.5 → slightly lower (more optimistic)
    orbitLearningRate: 0.08,          // Was 0.07 → slightly faster learning
    groundLearningRate: 0.015,        // 1.5% cheaper per year (unchanged)
    computePerKwGrowth: 1.12,         // +12% compute-per-kW/year (unchanged)
    powerGrowthPerYear: 0.015,        // +1.5% power/year (unchanged)
    techGrowthPerYear: 1.20,          // Was 1.15 → faster tech growth
    launchCostDeclinePerYear: 0.92,   // Was 0.94 → faster decline
    demandGrowthPerYear: 1.35,        // +35% demand/year (unchanged)
    failureRateBase: 0.02,
    autonomyLevel: 1.5,
    backhaulPerSatTBps: 0.5,
    launchCarbonPerKg: 300,
  },
  {
    key: "orbitalBear",
    // ULTRA-BEAR: "Space is Hard" - Only 1.5 GW by 2040 (99% less than baseline)
    orbitInitialCostMultiple: 5.0,    // Was 2.8 - Orbit starts 5x ground cost (Starship fails)
    orbitLearningRate: 0.02,          // Was 0.05 - Almost no learning (2% per year)
    groundLearningRate: 0.025,         // Was 0.015 - Ground improves faster (2.5% per year)
    computePerKwGrowth: 1.05,          // Was 1.08 - Minimal efficiency gains (5% per year)
    powerGrowthPerYear: 0.005,         // Was 0.02 - Minimal power scaling (0.5% per year)
    techGrowthPerYear: 1.03,           // Was 1.06 - Moore's Law slows dramatically (3% per year)
    launchCostDeclinePerYear: 0.99,    // Was 0.98 - Only 1% decline/year (Starship fails)
    demandGrowthPerYear: 1.15,         // Was 1.30 - Lower demand for orbital (15% per year)
    failureRateBase: 0.08,             // Was 0.05 - High failure rate (radiation worse than expected)
    autonomyLevel: 0.3,               // Was 0.5 - Low autonomy (needs constant ground control)
    backhaulPerSatTBps: 0.1,           // Was 0.2 - Bandwidth constrained (0.1 TBps per sat)
    launchCarbonPerKg: 800,            // Was 600 - Dirtier launches (no Starship)
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

