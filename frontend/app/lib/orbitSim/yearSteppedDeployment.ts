/**
 * Year-Stepped Deployment Model
 * 
 * Implements deterministic, strategy-aware satellite growth without time-travel.
 * Each year's deployment depends only on:
 * - Previous year's satellite counts
 * - Current year's strategy
 * - Annual launch capacity
 */

import {
  getAnnualLaunchCapacity,
  STRATEGY_GROWTH_MULTIPLIERS,
  getClassBShare,
  getClassACompute,
  getClassAPower,
  getClassBCompute,
  getClassBPower,
  getOrbitAllocation,
  calculateRetirements,
  type StrategyMode,
  type SatelliteClass,
  SAT_A_LIFETIME_Y,
  SAT_B_LIFETIME_Y,
} from "./satelliteClasses";
import {
  calculateLaunchConstraints,
  calculateConstrainedEffectiveCompute,
  type EffectiveComputeResult,
} from "./deploymentConstraints";

export interface YearDeploymentState {
  year: number;
  strategy: StrategyMode;
  
  // Class A counts
  S_A: number;
  S_A_lowLEO: number;
  S_A_midLEO: number;
  S_A_sunSync: number;
  
  // Class B counts (always sun-sync)
  S_B: number;
  
  // Deployment history (for retirement calculations)
  deployedByYear_A: Map<number, number>;
  deployedByYear_B: Map<number, number>;
  
  // Aggregate metrics
  totalComputePFLOPs: number;
  totalPowerMW: number;
}

export interface YearDeploymentResult {
  year: number;
  strategy: StrategyMode;
  
  // New deployments this year
  newA: number;
  newB: number;
  newA_lowLEO: number;
  newA_midLEO: number;
  newA_sunSync: number;
  
  // Total counts after deployment and retirements
  S_A: number;
  S_B: number;
  S_A_lowLEO: number;
  S_A_midLEO: number;
  S_A_sunSync: number;
  S_B_sunSync: number;
  
  // Aggregate metrics
  totalComputePFLOPs: number;
  totalPowerMW: number;
  
  // Effective compute (after constraints)
  effectiveComputePFLOPs: number;
  heatUtilization: number;
  survivalFraction: number;
  
  // Per-satellite metrics
  computePerA: number;
  powerPerA: number;
  computePerB: number;
  powerPerB: number;
  
  // Constraint information
  constraints?: {
    launch: { massLimited: number; costLimited: number; allowed: number };
    heat: { utilizationMax: number; heatLimited: boolean };
    maintenance: { failureRate: number; failuresThisYear: number; recoverable: number; permanentLoss: number; survivalFraction: number };
  };
}

const START_YEAR = 2025;

/**
 * Calculate deployment for a single year
 * 
 * @param state Previous year's state
 * @param strategy Strategy for this year (can change mid-run)
 */
export function calculateYearDeployment(
  state: YearDeploymentState,
  strategy: StrategyMode
): YearDeploymentResult {
  const { year, S_A, S_B, deployedByYear_A, deployedByYear_B } = state;
  
  // 1. Calculate annual launch capacity
  const yearOffset = year - START_YEAR;
  const baseLaunches = getAnnualLaunchCapacity(yearOffset);
  
  // 2. Apply strategy growth multiplier
  const growthMultiplier = STRATEGY_GROWTH_MULTIPLIERS[strategy];
  const totalLaunches = Math.round(baseLaunches * growthMultiplier);
  
  // 3. Split between Class A and Class B (before constraints)
  const fracB = getClassBShare(strategy, year);
  const newB_target = Math.round(totalLaunches * fracB);
  const newA_target = totalLaunches - newB_target;
  
  // 3.5. APPLY LAUNCH CONSTRAINTS (mass and cost gating)
  const launchConstraints = calculateLaunchConstraints(
    totalLaunches,
    newA_target,
    newB_target,
    year,
    strategy
  );
  
  // Apply launch-gated limits proportionally to A and B
  const totalTarget = newA_target + newB_target;
  const allowedTotal = launchConstraints.allowed;
  const scaleFactor = totalTarget > 0 ? allowedTotal / totalTarget : 0;
  
  const newA = Math.round(newA_target * scaleFactor);
  const newB = Math.round(newB_target * scaleFactor);
  
  // 4. Distribute Class A across orbits based on strategy
  const orbitAlloc = getOrbitAllocation(strategy);
  const newA_lowLEO = Math.round(newA * orbitAlloc.lowLEO);
  const newA_midLEO = Math.round(newA * orbitAlloc.midLEO);
  const newA_sunSync = newA - newA_lowLEO - newA_midLEO; // Remainder to ensure exact count
  
  // 5. Calculate retirements
  const retiredA = calculateRetirements(deployedByYear_A, year, SAT_A_LIFETIME_Y);
  const retiredB = calculateRetirements(deployedByYear_B, year, SAT_B_LIFETIME_Y);
  
  // 6. Update counts (new - retired)
  const S_A_new = Math.max(0, S_A + newA - retiredA);
  const S_B_new = Math.max(0, S_B + newB - retiredB);
  
  // Update orbit-specific counts (simplified: assume retirements are proportional)
  const S_A_total_prev = state.S_A_lowLEO + state.S_A_midLEO + state.S_A_sunSync;
  const S_A_lowLEO_new = S_A_total_prev > 0
    ? Math.max(0, state.S_A_lowLEO + newA_lowLEO - Math.round(retiredA * (state.S_A_lowLEO / S_A_total_prev)))
    : newA_lowLEO;
  const S_A_midLEO_new = S_A_total_prev > 0
    ? Math.max(0, state.S_A_midLEO + newA_midLEO - Math.round(retiredA * (state.S_A_midLEO / S_A_total_prev)))
    : newA_midLEO;
  const S_A_sunSync_new = S_A_new - S_A_lowLEO_new - S_A_midLEO_new;
  const S_B_sunSync_new = S_B_new; // All Class B are sun-sync
  
  // 7. Calculate tech curves
  const computePerA = getClassACompute(year);
  const powerPerA = getClassAPower(year);
  const computePerB = getClassBCompute(year);
  const powerPerB = getClassBPower(year);
  
  // 8. Calculate raw aggregate metrics (before constraints)
  const totalComputePFLOPs = 
    S_A_new * computePerA + 
    S_B_new * computePerB;
  const totalPowerMW = 
    (S_A_new * powerPerA + S_B_new * powerPerB) / 1000;
  
  // 8.5. APPLY HEAT AND MAINTENANCE CONSTRAINTS
  const effectiveComputeResult = calculateConstrainedEffectiveCompute(
    totalComputePFLOPs,
    S_A_new,
    S_B_new,
    powerPerA,
    powerPerB,
    year,
    strategy,
    totalLaunches,
    newA,
    newB
  );
  
  // 9. Update deployment history
  const newDeployedByYear_A = new Map(deployedByYear_A);
  const newDeployedByYear_B = new Map(deployedByYear_B);
  newDeployedByYear_A.set(year, newA);
  newDeployedByYear_B.set(year, newB);
  
  return {
    year,
    strategy,
    newA,
    newB,
    newA_lowLEO,
    newA_midLEO,
    newA_sunSync,
    S_A: S_A_new,
    S_B: S_B_new,
    S_A_lowLEO: S_A_lowLEO_new,
    S_A_midLEO: S_A_midLEO_new,
    S_A_sunSync: S_A_sunSync_new,
    S_B_sunSync: S_B_sunSync_new,
    totalComputePFLOPs,
    totalPowerMW,
    effectiveComputePFLOPs: effectiveComputeResult.effectiveCompute,
    heatUtilization: effectiveComputeResult.heatUtilization,
    survivalFraction: effectiveComputeResult.survivalFraction,
    computePerA,
    powerPerA,
    computePerB,
    powerPerB,
    constraints: effectiveComputeResult.constraints,
  };
}

/**
 * Get initial state (year 2025)
 */
export function getInitialDeploymentState(strategy: StrategyMode = "BALANCED"): YearDeploymentState {
  return {
    year: START_YEAR,
    strategy,
    S_A: 0,
    S_A_lowLEO: 0,
    S_A_midLEO: 0,
    S_A_sunSync: 0,
    S_B: 0,
    deployedByYear_A: new Map(),
    deployedByYear_B: new Map(),
    totalComputePFLOPs: 0,
    totalPowerMW: 0,
  };
}

/**
 * Run multi-year deployment simulation
 * 
 * @param startYear Starting year
 * @param endYear Ending year
 * @param strategyByYear Map of year -> strategy (allows mid-run strategy changes)
 */
export function runMultiYearDeployment(
  startYear: number,
  endYear: number,
  strategyByYear: Map<number, StrategyMode>
): YearDeploymentResult[] {
  let state = getInitialDeploymentState();
  const results: YearDeploymentResult[] = [];
  
  for (let year = startYear; year <= endYear; year++) {
    // Get strategy for this year (default to BALANCED if not specified)
    const strategy = strategyByYear.get(year) || "BALANCED";
    
    // Calculate deployment for this year
    const result = calculateYearDeployment(state, strategy);
    results.push(result);
    
    // Update state for next year
    state = {
      year: year + 1,
      strategy,
      S_A: result.S_A,
      S_A_lowLEO: result.S_A_lowLEO,
      S_A_midLEO: result.S_A_midLEO,
      S_A_sunSync: result.S_A_sunSync,
      S_B: result.S_B,
      deployedByYear_A: new Map(state.deployedByYear_A),
      deployedByYear_B: new Map(state.deployedByYear_B),
      totalComputePFLOPs: result.totalComputePFLOPs,
      totalPowerMW: result.totalPowerMW,
    };
    
    // Update deployment history
    state.deployedByYear_A.set(year, result.newA);
    state.deployedByYear_B.set(year, result.newB);
  }
  
  return results;
}

