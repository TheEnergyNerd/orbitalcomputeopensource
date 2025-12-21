/**
 * Ground Constraint Penalties Model
 * 
 * Calculates WACC-based penalties and multipliers from backlog/wait time:
 * - timeToEnergizePenaltyPerPflopYear: WACC carry + lost margin
 * - siteMultiplier: land + interconnect scarcity
 * - pueMultiplier: cooling/water stress
 */

import { GroundSupplyState } from './ground_queue_model';

/**
 * Hill function: saturating sigmoid-like curve
 * @param x Input value
 * @param x50 Half-saturation point
 * @param n Hill coefficient (steepness)
 * @returns Value between 0 and 1
 */
function hill(x: number, x50: number, n: number): number {
  if (x <= 0) return 0;
  const xn = Math.pow(x, n);
  const x50n = Math.pow(x50, n);
  return xn / (x50n + xn);
}

/**
 * Threshold Hill function: 0 until x exceeds x0, then Hill on the excess
 * @param x Input value
 * @param x0 Threshold (must exceed this before Hill activates)
 * @param x50 Half-saturation point for excess
 * @param n Hill coefficient
 * @returns Value between 0 and 1
 */
function thresholdHill(x: number, x0: number, x50: number, n: number): number {
  const excess = Math.max(0, x - x0);
  return hill(excess, x50, n);
}

export interface GroundConstraintPenalties {
  // Time-to-energize penalty (WACC carry + lost margin)
  timeToEnergizePenaltyPerPflopYear: number;
  
  // Site multiplier (land + interconnect scarcity)
  siteMultiplier: number;
  
  // PUE multiplier (cooling/water stress)
  pueMultiplier: number;
  
  // Debug fields
  backlogGw: number;
  avgWaitYears: number;
  capexAtRiskPerMW: number;
  carryCostPerMW: number;
  lostMarginPerMW: number;
  // WACC debug fields
  waccBase?: number;
  waccEffective?: number;
}

/**
 * Calculate scarcity multiplier using LOG-BASED function (never fully saturates)
 * 
 * Replaces Hill function with log-based approach that can distinguish between
 * wait=20yr and wait=254yr (unlike Hill which saturates early).
 * 
 * @param waitYears Average wait time (years) - NO CLAMP applied
 * @param utilizationPct Utilization percentage (0-1) - optional threshold gate
 * @param params Optional parameters
 * @returns Scarcity multiplier (1.0 = no scarcity, 2.0 = 2x price) and debug fields
 */
export function calculateScarcityRent(
  waitYears: number,
  utilizationPct?: number,
  params?: {
    waitThresholdYears?: number; // Minimum wait before scarcity activates (default 1.0)
    rentMaxMultiplier?: number; // Maximum price multiplier (default 2.0 = 2x price)
    utilizationThreshold?: number; // Utilization threshold (default 0.85)
  }
): {
  scarcityMultiplier: number; // Price multiplier (1.0 = no scarcity, 2.0 = 2x)
  rentFrac: number; // Rent fraction (0 = no rent, 1.0 = max rent)
  waitEffYears: number;
  // Debug fields
  scarcityHill: {
    h: number; // Wait term (log-based)
    rentFrac: number; // Rent fraction after applying rentMax
  };
  avgWaitYearsRaw: number; // Raw wait years (no clamp)
  avgWaitYearsClamped: number; // Same as raw (no clamp applied)
} {
  const UTIL_THRESHOLD = params?.utilizationThreshold ?? 0.85;
  const WAIT_THRESHOLD = params?.waitThresholdYears ?? 1.0;
  
  // Dynamic rent max that scales with wait time (prevents Moore's Law from canceling scarcity)
  // OLD: baseMax=2.0, cap=5.0
  // NEW: baseMax=2.0, cap=4.0, scaling=0.3 per log10 (more conservative)
  // At wait=10yr: ~2.3x, wait=50yr: ~2.6x, wait=100yr: ~2.9x (log-based, never fully saturates)
  const baseMax = params?.rentMaxMultiplier ?? 2.0;
  const waitScaling = waitYears > 1 ? Math.log10(waitYears) * 0.3 : 0; // +0.3x per order of magnitude
  const RENT_MAX = Math.min(4.0, baseMax + waitScaling); // Cap at 4x total
  
  // Gate: no scarcity if utilization < 85% AND wait < 1 year
  if (utilizationPct !== undefined && utilizationPct < UTIL_THRESHOLD && waitYears < WAIT_THRESHOLD) {
    return {
      scarcityMultiplier: 1.0,
      rentFrac: 0,
      waitEffYears: waitYears,
      scarcityHill: { h: 0, rentFrac: 0 },
      avgWaitYearsRaw: waitYears,
      avgWaitYearsClamped: waitYears,
    };
  }
  
  // Wait term: LOG-BASED (never saturates, but grows slowly)
  // At wait=1yr: 0, wait=3yr: 0.48, wait=10yr: 1.0, wait=100yr: 2.0, wait=1000yr: 3.0
  const waitTerm = waitYears > WAIT_THRESHOLD 
    ? Math.log10(waitYears / WAIT_THRESHOLD) 
    : 0;
  
  // Utilization term: sigmoid above threshold
  const utilExcess = Math.max(0, (utilizationPct ?? 0) - UTIL_THRESHOLD);
  const utilTerm = utilExcess > 0 
    ? 1 / (1 + Math.exp(-20 * (utilExcess - 0.05))) // Sharp rise at 90%
    : 0;
  
  // Combined: scarcity = 1 + min(RENT_MAX - 1, waitTerm * (1 + utilTerm))
  const rawRent = waitTerm * (1 + utilTerm);
  const rentFrac = Math.min(RENT_MAX - 1, rawRent);
  const scarcityMultiplier = 1 + rentFrac;
  
  // For backward compatibility: return scarcityRentPerPflopYear = 0
  // (scarcity is now multiplicative, not additive)
  return {
    scarcityMultiplier,
    rentFrac,
    waitEffYears: waitYears,
    scarcityHill: { h: waitTerm, rentFrac },
    avgWaitYearsRaw: waitYears,
    avgWaitYearsClamped: waitYears,
  };
}

/**
 * Calculate ground constraint penalties from supply state
 * 
 * @param state Current ground supply state
 * @param flopsPerWattGround GFLOPS/W for ground compute
 * @param pueGround PUE for ground datacenters
 * @param capacityFactorGround Capacity factor for ground
 * @param waccParams Optional WACC parameters for capital rationing
 * @returns Penalties and multipliers
 */
export function calculateGroundConstraintPenalties(
  state: GroundSupplyState,
  flopsPerWattGround: number,
  pueGround: number,
  capacityFactorGround: number,
  waccParams?: {
    baseWacc?: number;
    waccBacklogK?: number;
    waccBacklogExponent?: number;
    criticalBacklogGW?: number;
  }
): GroundConstraintPenalties {
  const backlogGw = state.backlogGw; // Pipeline is not backlog. If backlog is missing, treat as 0 and let chartInputs/buildoutDebug supply the real number elsewhere.
  const avgWaitYears = state.avgWaitYears;
  const maxBuildRateGwYear = state.maxBuildRateGwYear;
  const utilizationPct = state.utilizationPct;
  
  // Convert GW to MW
  const backlogMw = backlogGw * 1000;
  
  // UNIT GUARD: Fix units mismatch (flopsPerWattGround might be TFLOPS/W instead of GFLOPS/W)
  let gflopsPerWatt = flopsPerWattGround;
  if (flopsPerWattGround < 50) {
    // Likely TFLOPS/W (e.g., 2 TFLOPS/W), convert to GFLOPS/W
    gflopsPerWatt = flopsPerWattGround * 1000;
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[UNIT CONVERSION] flopsPerWattGround=${flopsPerWattGround} < 50, treating as TFLOPS/W and converting to ${gflopsPerWatt} GFLOPS/W`);
    }
  }
  // Clamp insane values
  if (gflopsPerWatt > 20000) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[UNIT CLAMP] gflopsPerWatt=${gflopsPerWatt} > 20000, clamping to 20000`);
    }
    gflopsPerWatt = 20000;
  }
  
  // WACC parameters (capital rationing: WACC rises with backlog)
  const baseWacc = waccParams?.baseWacc ?? 0.10; // 10% base WACC
  const waccBacklogK = waccParams?.waccBacklogK ?? 0.5; // Scaling factor
  const waccBacklogExponent = waccParams?.waccBacklogExponent ?? 1.2; // Exponent for convexity
  const criticalBacklogGW = waccParams?.criticalBacklogGW ?? 50; // Critical backlog threshold
  
  // Compute effective WACC (rises with backlog)
  // waccEffective = baseWacc * (1 + waccBacklogK * (backlogGW/criticalBacklogGW)^waccBacklogExponent)
  const backlogRatio = Math.max(0, backlogGw / criticalBacklogGW);
  const waccMultiplier = 1 + waccBacklogK * Math.pow(backlogRatio, waccBacklogExponent);
  const waccEffective = baseWacc * waccMultiplier;
  
  // Constants
  const WACC = 0.10;
  const CAPEX_PER_MW = 3_000_000; // $3M/MW capex at risk
  
  // Replace the huge lost-margin number with something defensible + capped
  const LOST_MARGIN_PER_MW_YEAR = 600_000;      // was 2,000,000, now 600k
  const LOST_MARGIN_CAP_PER_MW = 1_800_000;     // cap total lost margin component
  
  const MAX_WAIT_FOR_CARRY = 4;                 // years, cap compounding horizon
  const MAX_TOTAL_PENALTY_PER_MW_YEAR = 2_500_000; // hard cap so it never goes vertical
  
  const BASE_SITE_COST_PER_MW_YEAR = 150_000; // $150k/MW-year base site cost
  const BASE_PUE = 1.3; // Baseline PUE
  
  // Reference capex amort for capping (used to prevent penalty from dominating)
  const CAPEX_AMORT_PER_PFLOP_YEAR_REFERENCE = 1500; // Base site cost per PFLOP-year
  
  // 1. Bounded Delay Penalty: Linear WACC carry (NOT exponential)
  // delayPenaltyPerPflopYear = capexPerPflopYear * wacc * avgWaitYears
  // Cap it: delayPenaltyPerPflopYear = min(delayPenaltyPerPflopYear, delayCapFrac * capexPerPflopYear)
  let timeToEnergizePenaltyPerPflopYear = 0;
  let capexAtRiskPerMW = 0;
  let carryCostPerMW = 0;
  let lostMarginPerMW = 0;
  
  // Convert capex to per-PFLOP-year for penalty calculation
  const pflopsPerMW = (gflopsPerWatt * capacityFactorGround) / pueGround;
  const CAPEX_PER_PFLOP_YEAR = (CAPEX_PER_MW / Math.max(pflopsPerMW, 1e-6));
  
  if (avgWaitYears > 0.01) {
    // Linear delay penalty: WACC * capex * waitYears (NOT exponential)
    const delayPenaltyUncapped = CAPEX_PER_PFLOP_YEAR * baseWacc * avgWaitYears;
    
    // Cap at delayCapFrac of capex (0.5-1.0 range)
    const DELAY_CAP_FRAC = 0.75; // Cap at 75% of capex
    timeToEnergizePenaltyPerPflopYear = Math.min(delayPenaltyUncapped, DELAY_CAP_FRAC * CAPEX_PER_PFLOP_YEAR);
    
    // For debug fields (MW-based)
    capexAtRiskPerMW = CAPEX_PER_MW;
    carryCostPerMW = CAPEX_PER_MW * baseWacc * avgWaitYears;
    lostMarginPerMW = 0; // Not used in bounded model
  }
  
  // 2. Site Multiplier: land + interconnect scarcity (Hill-shaped, thresholded)
  // Backlog rent: Hill on avgWaitYears (this creates the "hump" shape)
  const waitRent = hill(avgWaitYears, 2.0, 2.0);          // 50% rent at 2 years
  const backlogRent = hill(backlogGw, 30, 2.0);           // kicks in around ~30 GW backlog
  
  // Utilization rent: strictly 0 until > 85% utilization
  const utilRent = thresholdHill(utilizationPct, 0.85, 0.05, 2.0); // x50 is 5% above threshold
  
  const landScarcityFactor = 1 + 0.35 * backlogRent;
  const interconnectScarcityFactor = 1 + 0.45 * Math.max(waitRent, utilRent);
  
  // Site multiplier should be ~1 when backlog=0, wait=0, util<0.85
  const siteMultiplier = landScarcityFactor * interconnectScarcityFactor;
  
  // 3. PUE Multiplier: cooling/water stress (thresholded)
  const coolingStressFactor = 1 + 0.25 * utilRent;
  const waterStressFactor = 1 + 0.20 * backlogRent;
  const pueMultiplier = 1 + (coolingStressFactor - 1) + (waterStressFactor - 1); // Additive stress
  
  return {
    timeToEnergizePenaltyPerPflopYear,
    siteMultiplier,
    pueMultiplier,
    backlogGw,
    avgWaitYears,
    capexAtRiskPerMW,
    carryCostPerMW,
    lostMarginPerMW,
    waccBase: baseWacc,
    waccEffective,
  };
}

/**
 * Calculate Hill-based scarcity premium from queue pressure + utilization
 * 
 * Scarcity multiplier (NOT exponential):
 * - queuePressure = backlogGW / (backlogGW + K_backlogGW) where K_backlogGW ~ 50-150
 * - utilPressure = 1 / (1 + exp(-k*(utilizationPct - u0))) with u0 ~ 0.85-0.92, k ~ 12-20
 * - scarcity = 1 + rentFracMax * (queuePressure^h) * utilPressure
 * 
 * @param backlogGw Backlog in GW
 * @param utilizationPct Utilization percentage (0-1)
 * @param baseCostPerPflopYear Base cost per PFLOP-year (for rent calculation)
 * @param params Optional parameters
 * @returns Scarcity rent and debug fields
 */
export function calculateHillScarcityPremium(
  backlogGw: number,
  utilizationPct: number,
  baseCostPerPflopYear: number,
  params?: {
    kBacklogGw?: number; // K_backlogGW ~ 50-150
    u0?: number; // u0 ~ 0.85-0.92
    k?: number; // k ~ 12-20
    rentFracMax?: number; // rentFracMax ~ 0.3-0.8
    h?: number; // h ~ 1-3 (steepness)
  }
): {
  scarcityRentPerPflopYear: number;
  scarcityMultiplier: number;
  queuePressure: number;
  utilPressure: number;
} {
  const kBacklogGw = params?.kBacklogGw ?? 100; // K_backlogGW ~ 50-150
  const u0 = params?.u0 ?? 0.88; // u0 ~ 0.85-0.92 (scarcity starts at 88% utilization)
  const k = params?.k ?? 16; // k ~ 12-20 (steepness of utilization curve)
  const rentFracMax = params?.rentFracMax ?? 0.5; // rentFracMax ~ 0.3-0.8 (max rent fraction)
  const h = params?.h ?? 2.0; // h ~ 1-3 (steepness of queue pressure)
  
  // Queue pressure: backlogGW / (backlogGW + K_backlogGW)
  // Saturates at 1 as backlog grows
  const queuePressure = backlogGw / (backlogGw + kBacklogGw);
  
  // Utilization pressure: 1 / (1 + exp(-k*(utilizationPct - u0)))
  // Sigmoid that rises sharply around u0
  const utilExcess = utilizationPct - u0;
  const utilPressure = 1 / (1 + Math.exp(-k * utilExcess));
  
  // Scarcity multiplier: 1 + rentFracMax * (queuePressure^h) * utilPressure
  const scarcityMultiplier = 1 + rentFracMax * Math.pow(queuePressure, h) * utilPressure;
  
  // Scarcity rent = base cost * (scarcity - 1)
  const scarcityRentPerPflopYear = baseCostPerPflopYear * (scarcityMultiplier - 1);
  
  return {
    scarcityRentPerPflopYear,
    scarcityMultiplier,
    queuePressure,
    utilPressure,
  };
}

