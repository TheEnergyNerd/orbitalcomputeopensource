/**
 * 3-Shell Orbital Compute Deployment Model with Dynamic Strategy Switching
 * 
 * Core State Variables (Global):
 * - N_LEO[t], N_MEO[t], N_GEO[t] → satellite counts
 * - P_LEO[t], P_MEO[t], P_GEO[t] → power per satellite (kW)
 * - C_launch[t] → $/kg
 * - Demand[t] → required compute PFLOPs
 * - Cap_total[t] → deployed compute PFLOPs
 */

export type StrategyMode = "latency" | "cost" | "carbon" | "balanced";

export interface OrbitState {
  N: number; // Satellite count
  P: number; // Power per satellite (kW)
}

export interface DeploymentState {
  year: number;
  N_LEO: number;
  N_MEO: number;
  N_GEO: number;
  P_LEO: number; // kW
  P_MEO: number; // kW
  P_GEO: number; // kW
  TFLOPs_per_kW: number; // Global efficiency
  strategy: StrategyMode;
}

export interface DeploymentResult {
  year: number;
  deltaN: number;
  deltaN_LEO: number;
  deltaN_MEO: number;
  deltaN_GEO: number;
  N_LEO: number;
  N_MEO: number;
  N_GEO: number;
  P_LEO: number;
  P_MEO: number;
  P_GEO: number;
  totalComputePFLOPs: number;
  totalPowerMW: number;
}

// Strategy orbit allocation weights (applied to NEW satellites only)
export const STRATEGY_ORBIT_WEIGHTS: Record<StrategyMode, { LEO: number; MEO: number; GEO: number }> = {
  latency: { LEO: 0.80, MEO: 0.15, GEO: 0.05 },
  cost: { LEO: 0.55, MEO: 0.30, GEO: 0.15 },
  carbon: { LEO: 0.40, MEO: 0.30, GEO: 0.30 },
  balanced: { LEO: 0.60, MEO: 0.25, GEO: 0.15 },
};

// Strategy growth multipliers
const STRATEGY_GROWTH_MULTIPLIERS: Record<StrategyMode, number> = {
  latency: 1.25,
  cost: 0.85,
  carbon: 0.70,
  balanced: 1.00,
};

// Power scaling rates per orbit per strategy (η)
const POWER_SCALING_RATES: Record<StrategyMode, { LEO: number; MEO: number; GEO: number }> = {
  latency: { LEO: 0.12, MEO: 0.14, GEO: 0.18 },
  cost: { LEO: 0.06, MEO: 0.10, GEO: 0.14 },
  carbon: { LEO: 0.04, MEO: 0.09, GEO: 0.12 },
  balanced: { LEO: 0.08, MEO: 0.11, GEO: 0.15 },
};

// Initial power values (kW)
const INITIAL_POWER: { LEO: number; MEO: number; GEO: number } = {
  LEO: 100, // 80-150 kW range, use 100 as baseline
  MEO: 500, // 300-800 kW range, use 500 as baseline
  GEO: 2000, // 1-5 MW range, use 2 MW as baseline
};

// Shell altitude ranges (km)
export const SHELL_ALTITUDES = {
  LEO: { min: 500, max: 800 },
  MEO: { min: 8000, max: 20000 },
  GEO: { altitude: 35786 },
};

/**
 * Calculate BaseGrowth(t) based on year
 */
function calculateBaseGrowth(year: number, N_total_prev: number): number {
  if (year < 2) {
    return 120;
  } else if (year >= 2 && year < 5) {
    return 0.6 * N_total_prev;
  } else if (year >= 5 && year < 10) {
    return 0.9 * N_total_prev;
  } else {
    // year >= 10
    return 0.35 * N_total_prev;
  }
}

/**
 * Calculate total satellites added this year (ΔN(t))
 */
function calculateDeltaN(
  year: number,
  N_total_prev: number,
  strategy: StrategyMode
): number {
  const baseGrowth = calculateBaseGrowth(year, N_total_prev);
  const multiplier = STRATEGY_GROWTH_MULTIPLIERS[strategy];
  return Math.round(baseGrowth * multiplier);
}

/**
 * Distribute new satellites across orbits based on strategy
 */
function distributeNewSatellites(
  deltaN: number,
  strategy: StrategyMode
): { LEO: number; MEO: number; GEO: number } {
  const weights = STRATEGY_ORBIT_WEIGHTS[strategy];
  return {
    LEO: Math.round(deltaN * weights.LEO),
    MEO: Math.round(deltaN * weights.MEO),
    GEO: Math.round(deltaN * weights.GEO),
  };
}

/**
 * Calculate power scaling for next year
 */
function calculateNextPower(
  currentPower: number,
  orbit: "LEO" | "MEO" | "GEO",
  strategy: StrategyMode
): number {
  const eta = POWER_SCALING_RATES[strategy][orbit];
  return currentPower * (1 + eta);
}

/**
 * Validate constraints (hard fail conditions)
 */
function validateConstraints(
  result: DeploymentResult,
  year: number
): { valid: boolean; error?: string } {
  // Check power minimums
  if (result.P_LEO < 50) {
    return { valid: false, error: `LEO power ${result.P_LEO.toFixed(1)} kW < 50 kW minimum` };
  }
  if (result.P_MEO < 250) {
    return { valid: false, error: `MEO power ${result.P_MEO.toFixed(1)} kW < 250 kW minimum` };
  }
  if (year >= 6 && result.P_GEO < 1000) {
    return { valid: false, error: `GEO power ${result.P_GEO.toFixed(1)} kW < 1000 kW minimum after year 6` };
  }
  
  // Check no negative growth
  if (result.deltaN < 0) {
    return { valid: false, error: `Negative deltaN: ${result.deltaN}` };
  }
  
  // Check satellite count doesn't decrease
  const N_total = result.N_LEO + result.N_MEO + result.N_GEO;
  const N_prev = (result.N_LEO - result.deltaN_LEO) + 
                  (result.N_MEO - result.deltaN_MEO) + 
                  (result.N_GEO - result.deltaN_GEO);
  if (N_total < N_prev) {
    return { valid: false, error: `Total satellites decreased from ${N_prev} to ${N_total}` };
  }
  
  return { valid: true };
}

/**
 * Calculate total compute (PFLOPs) from satellite counts and power
 */
function calculateTotalCompute(
  N_LEO: number,
  N_MEO: number,
  N_GEO: number,
  P_LEO: number,
  P_MEO: number,
  P_GEO: number,
  TFLOPs_per_kW: number
): number {
  const compute_LEO = (N_LEO * P_LEO * TFLOPs_per_kW) / 1e15; // Convert to PFLOPs
  const compute_MEO = (N_MEO * P_MEO * TFLOPs_per_kW) / 1e15;
  const compute_GEO = (N_GEO * P_GEO * TFLOPs_per_kW) / 1e15;
  return compute_LEO + compute_MEO + compute_GEO;
}

/**
 * Calculate deployment for a single year
 * This is the core function that implements the strategy-based deployment model
 */
export function calculateDeployment(
  state: DeploymentState
): DeploymentResult {
  const { year, N_LEO, N_MEO, N_GEO, P_LEO, P_MEO, P_GEO, TFLOPs_per_kW, strategy } = state;
  
  // Calculate total satellites from previous year
  const N_total_prev = N_LEO + N_MEO + N_GEO;
  
  // Calculate new satellites to add this year
  const deltaN = calculateDeltaN(year, N_total_prev, strategy);
  
  // Distribute new satellites across orbits
  const deltaN_dist = distributeNewSatellites(deltaN, strategy);
  
  // Update satellite counts
  const new_N_LEO = N_LEO + deltaN_dist.LEO;
  const new_N_MEO = N_MEO + deltaN_dist.MEO;
  const new_N_GEO = N_GEO + deltaN_dist.GEO;
  
  // Scale power per satellite for each orbit
  const new_P_LEO = calculateNextPower(P_LEO, "LEO", strategy);
  const new_P_MEO = calculateNextPower(P_MEO, "MEO", strategy);
  const new_P_GEO = calculateNextPower(P_GEO, "GEO", strategy);
  
  // Calculate total compute
  const totalComputePFLOPs = calculateTotalCompute(
    new_N_LEO,
    new_N_MEO,
    new_N_GEO,
    new_P_LEO,
    new_P_MEO,
    new_P_GEO,
    TFLOPs_per_kW
  );
  
  // Calculate total power (MW)
  const totalPowerMW = (new_N_LEO * new_P_LEO + new_N_MEO * new_P_MEO + new_N_GEO * new_P_GEO) / 1000;
  
  const result: DeploymentResult = {
    year,
    deltaN,
    deltaN_LEO: deltaN_dist.LEO,
    deltaN_MEO: deltaN_dist.MEO,
    deltaN_GEO: deltaN_dist.GEO,
    N_LEO: new_N_LEO,
    N_MEO: new_N_MEO,
    N_GEO: new_N_GEO,
    P_LEO: new_P_LEO,
    P_MEO: new_P_MEO,
    P_GEO: new_P_GEO,
    totalComputePFLOPs,
    totalPowerMW,
  };
  
  // Validate constraints
  const validation = validateConstraints(result, year);
  if (!validation.valid) {
    throw new Error(`Deployment validation failed at year ${year}: ${validation.error}`);
  }
  
  return result;
}

/**
 * Get initial deployment state (year 0)
 */
export function getInitialState(strategy: StrategyMode = "balanced"): DeploymentState {
  return {
    year: 0,
    N_LEO: 0,
    N_MEO: 0,
    N_GEO: 0,
    P_LEO: INITIAL_POWER.LEO,
    P_MEO: INITIAL_POWER.MEO,
    P_GEO: INITIAL_POWER.GEO,
    TFLOPs_per_kW: 0.0125, // Initial efficiency (12.5 W/TFLOP = 0.0125 TFLOPs/kW)
    strategy,
  };
}

/**
 * Calculate deployment for multiple years
 * This allows strategy switching mid-simulation
 */
export function calculateMultiYearDeployment(
  startYear: number,
  endYear: number,
  initialState: DeploymentState,
  strategyPerYear?: (year: number) => StrategyMode
): DeploymentResult[] {
  const results: DeploymentResult[] = [];
  let currentState = { ...initialState };
  
  for (let year = startYear; year <= endYear; year++) {
    // Update strategy if provided
    if (strategyPerYear) {
      currentState.strategy = strategyPerYear(year);
    }
    
    currentState.year = year;
    const result = calculateDeployment(currentState);
    results.push(result);
    
    // Update state for next iteration
    currentState = {
      year: result.year,
      N_LEO: result.N_LEO,
      N_MEO: result.N_MEO,
      N_GEO: result.N_GEO,
      P_LEO: result.P_LEO,
      P_MEO: result.P_MEO,
      P_GEO: result.P_GEO,
      TFLOPs_per_kW: currentState.TFLOPs_per_kW * 1.18, // 18% annual improvement
      strategy: currentState.strategy, // Preserve strategy for next year
    };
  }
  
  return results;
}

