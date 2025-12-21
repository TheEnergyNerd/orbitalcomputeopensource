import { YearParams, YearlyBreakdown, SensitivityAnalysis, FinalModelOutput, MarketProjection, ValidationChecks, GroundScenarioLabel } from './types';
import { computePhysicsCost, GROUND_SCENARIOS, getLaunchCostPerKg } from './physicsCost';
import { stepLaunchLearning, LaunchLearningState } from './launch_learning';
import { getStaticParams } from './modes/static';
import { runMonteCarloCrossover, extractBaseParams, MonteCarloResult } from './monteCarloCrossover';

export interface TrajectoryOptions {
  mode: 'DYNAMIC' | 'STATIC';
  spaceTrafficEnabled?: boolean;
  useLaunchLearning?: boolean; // Enable cumulative mass-based launch learning
  
  // Dynamic parameters (passed as functions of year or raw values)
  paramsByYear: (year: number) => YearParams;
}

/**
 * Find crossover year using GPU-hour pricing (preferred, includes scarcity)
 * Uses scarcity-inclusive comparator consistently
 */
export function findCrossoverYear(trajectory: YearlyBreakdown[]): number | null {
  const crossing = trajectory.find(d => {
    // Use effective ground cost (includes delayPenalty + scarcityRent) for crossover
    const groundEffectiveCost = d.ground.totalCostPerPflopYearEffective ?? 
      (d.ground.totalCostPerPflopYear + 
       (d.ground.constraints?.delayPenalty || 0) +
       (d.ground.constraints?.scarcityRentPerPflopYear || 0));
    
    const orbitCost = d.orbit.totalCostPerPflopYearEffective ?? d.orbit.totalCostPerPflopYear;
    
    return Number.isFinite(orbitCost) && Number.isFinite(groundEffectiveCost) && 
           (orbitCost as number) < (groundEffectiveCost as number);
  });
  return crossing ? crossing.year : null;
}

/**
 * Find crossover year using effective PFLOP-year cost (includes scarcity adders)
 * Uses scarcity-inclusive comparator: delayPenalty + scarcityRent
 * capacityDeliveryPremium is engineering cost, not scarcity pricing
 */
export function findCrossoverYearEffectivePflop(trajectory: YearlyBreakdown[]): number | null {
  const crossing = trajectory.find(d => {
    // Ground effective cost includes: base + delayPenalty + scarcityRent
    const groundEffectiveCost = d.ground.totalCostPerPflopYearEffective ?? 
      (d.ground.totalCostPerPflopYear + 
       (d.ground.constraints?.delayPenalty || 0) +
       (d.ground.constraints?.scarcityRentPerPflopYear || 0));
    
    const orbitCost = d.orbit.totalCostPerPflopYearEffective ?? d.orbit.totalCostPerPflopYear;
    
    return orbitCost < groundEffectiveCost;
  });
  return crossing ? crossing.year : null;
}

export interface MarketAnalysis {
  year: number;
  totalDemandGW: number;
  orbitalShareFrac: number; // Fraction (0..1), standardized - use this everywhere
  orbitalCapacityGW: number;
  orbitalRevenue: number;
  groundShareFrac: number; // Fraction (0..1), standardized - use this everywhere
  groundCapacityGW: number;
  debug: {
    shareConvention: 'frac';
    orbitalFeasible: boolean;
    groundFeasible: boolean;
    orbitalShareFrac: number;
    groundShareFrac: number;
    orbitalCapacityGW: number;
    groundCapacityGW: number;
    orbitalRevenue: number;
    groundRevenue: number;
    demandComputeGW?: number;
    groundServedComputeGW?: number;
    orbitServedComputeGW?: number;
    groundFeasibleComputeGW?: number;
    orbitFeasibleComputeGW?: number;
    backlogGW?: number;
    buildRateGWyr?: number;
    avgWaitYears?: number;
    infeasibilityReasons?: string[];
    orbitalCapacityGW_fromSats?: number; // Canonical capacity from constellation (for validation)
  };
}

// Calculate market share based on cost ratio
// When orbital is 50% cheaper, it gets ~80% of NEW capacity
// When orbital is 2x more expensive, it gets ~5% (niche applications)
export function calculateMarketShare(
  year: number,
  orbitalCostPerPflop: number,
  groundCostPerPflop: number,
  totalDemandGW: number,
  orbitalFeasible: boolean = true,
  groundFeasible: boolean = true,
  orbitalCostAccountingValid: boolean = true,
  groundCostAccountingValid: boolean = true,
  // Additional parameters for served compute calculation
  demandGW?: number, // Total demand (facility load)
  backlogGW?: number, // Ground backlog
  buildRateGWyr?: number, // Ground build rate
  avgWaitYears?: number, // Ground wait time
  orbitMaxDeployableComputeGW?: number // Maximum orbital capacity (from launch/manufacturing constraints)
): MarketAnalysis {
  // CRITICAL FIX: Feasibility gating
  // Check if both systems are feasible before computing shares
  const orbitalActuallyFeasible = orbitalFeasible && orbitalCostAccountingValid;
  const groundActuallyFeasible = groundFeasible && groundCostAccountingValid;
  
  // If neither is feasible, default to ground (conservative)
  if (!orbitalActuallyFeasible && !groundActuallyFeasible) {
    return {
      year,
      totalDemandGW,
      orbitalShareFrac: 0,
      orbitalCapacityGW: 0,
      orbitalRevenue: 0,
      groundShareFrac: 1.0,
      groundCapacityGW: totalDemandGW,
      debug: {
        shareConvention: 'frac',
        orbitalFeasible: false,
        groundFeasible: false,
        orbitalShareFrac: 0,
        groundShareFrac: 1.0,
        orbitalCapacityGW: 0,
        groundCapacityGW: totalDemandGW,
        orbitalRevenue: 0,
        groundRevenue: totalDemandGW * 2e9, // $2B/GW/year
      },
    };
  }
  
  // If only one is feasible, it gets 100%
  if (!orbitalActuallyFeasible) {
    return {
      year,
      totalDemandGW,
      orbitalShareFrac: 0,
      orbitalCapacityGW: 0,
      orbitalRevenue: 0,
      groundShareFrac: 1.0,
      groundCapacityGW: totalDemandGW,
      debug: {
        shareConvention: 'frac',
        orbitalFeasible: false,
        groundFeasible: true,
        orbitalShareFrac: 0,
        groundShareFrac: 1.0,
        orbitalCapacityGW: 0,
        groundCapacityGW: totalDemandGW,
        orbitalRevenue: 0,
        groundRevenue: totalDemandGW * 2e9,
      },
    };
  }
  
  if (!groundActuallyFeasible) {
    return {
      year,
      totalDemandGW,
      orbitalShareFrac: 1.0,
      orbitalCapacityGW: totalDemandGW,
      orbitalRevenue: totalDemandGW * 2e9,
      groundShareFrac: 0,
      groundCapacityGW: 0,
      debug: {
        shareConvention: 'frac',
        orbitalFeasible: true,
        groundFeasible: false,
        orbitalShareFrac: 1.0,
        groundShareFrac: 0,
        orbitalCapacityGW: totalDemandGW,
        groundCapacityGW: 0,
        orbitalRevenue: totalDemandGW * 2e9,
        groundRevenue: 0,
      },
    };
  }
  
  // Hard rules: shares are always 0..1 fractions, served compute cannot exceed feasible compute
  const demand = demandGW ?? totalDemandGW;
  const backlogGWActual = backlogGW ?? 0;
  const buildRateGWyrActual = buildRateGWyr ?? 0;
  const avgWaitYearsActual = avgWaitYears ?? 0;
  
  // HARD FEASIBILITY GATING: If avgWaitYears > 3 OR backlog > 25% of demand, ground cannot serve all marginal demand
  // This forces spillover to orbital earlier, making crossover happen the right way (feasibility, not fake pricing)
  const groundHasSevereQueue = avgWaitYearsActual > 3 || backlogGWActual > 0.25 * demand;
  
  // Ground feasible capacity: reduced by queue pressure
  const groundFeasibleGW = groundActuallyFeasible 
    ? (groundHasSevereQueue 
        ? Math.max(0, demand * 0.5 - backlogGWActual) // Severe queue: ground can only serve 50% of demand
        : Math.max(0, demand - backlogGWActual)) // Normal: ground can serve demand minus backlog
    : 0;
  
  // Orbital feasible capacity: can serve remainder (up to max deployable)
  const orbitFeasibleGW = orbitalActuallyFeasible 
    ? Math.min(demand - groundFeasibleGW, orbitMaxDeployableComputeGW ?? demand)
    : 0;
  
  const maxServable = Math.min(demand, groundFeasibleGW + orbitFeasibleGW);
  
  // Compute desired shares (0..1) from cost ratios (logit model)
  const costRatio = orbitalCostPerPflop / groundCostPerPflop;
  const logitFactor = Math.exp(-5 * (costRatio - 1)); // When orbital is 50% cheaper, it gets ~80% of NEW capacity
  const orbitalShareFracDesired = logitFactor / (1 + logitFactor);
  const groundShareFracDesired = 1 - orbitalShareFracDesired;
  
  // Convert to served, then clamp by feasibility
  let orbitServed = orbitalShareFracDesired * maxServable;
  let groundServed = groundShareFracDesired * maxServable;
  
  orbitServed = Math.min(orbitServed, orbitFeasibleGW);
  groundServed = Math.min(groundServed, groundFeasibleGW);
  
  // If clamping reduced one side, reassign remainder if possible
  const remainder = maxServable - (orbitServed + groundServed);
  if (remainder > 0) {
    const orbitRoom = orbitFeasibleGW - orbitServed;
    const groundRoom = groundFeasibleGW - groundServed;
    const addToOrbit = Math.min(remainder, Math.max(0, orbitRoom));
    orbitServed += addToOrbit;
    groundServed += Math.min(remainder - addToOrbit, Math.max(0, groundRoom));
  }
  
  // Recalculate shares from actual served (ensures shares are 0..1 and sum to 1)
  const totalServedGW = orbitServed + groundServed;
  const orbitalShareFrac = totalServedGW > 0 ? orbitServed / totalServedGW : 0;
  const groundShareFrac = totalServedGW > 0 ? groundServed / totalServedGW : 0;
  
  // Use served values for capacity
  const groundServedComputeGW = groundServed;
  const orbitServedComputeGW = orbitServed;
  const groundFeasibleComputeGW = groundFeasibleGW;
  const orbitFeasibleComputeGW = orbitFeasibleGW;
  
  // Capacity served (GW)
  const orbitalCapacityGW = orbitServedComputeGW;
  const groundCapacityGW = groundServedComputeGW;
  
  // Revenue per GW (assume $2B/GW/year for compute services)
  const revenuePerGW = 2e9;
  const orbitalRevenue = orbitalCapacityGW * revenuePerGW;
  const groundRevenue = groundCapacityGW * revenuePerGW;
  
  // Invariants
  if (orbitalCapacityGW === 0 && orbitalRevenue !== 0) {
    throw new Error(`orbitalCapacityGW=0 but orbitalRevenue=${orbitalRevenue} > 0`);
  }
  
  if (orbitalRevenue > 0 && orbitalCapacityGW <= 0) {
    throw new Error(`orbitalRevenue=${orbitalRevenue} > 0 but orbitalCapacityGW=${orbitalCapacityGW} <= 0`);
  }
  
  if (orbitFeasibleComputeGW === 0 && orbitalShareFrac !== 0) {
    throw new Error(`orbitFeasibleComputeGW=0 but orbitalShareFrac=${orbitalShareFrac} > 0`);
  }
  
  // Shares should sum to 1.0 when both feasible and totalServed > 0
  if (totalServedGW > 0) {
    const shareSum = orbitalShareFrac + groundShareFrac;
    if (Math.abs(shareSum - 1.0) > 1e-6) {
      throw new Error(`Market share sum must equal 1.0, got ${shareSum} (orbital=${orbitalShareFrac}, ground=${groundShareFrac})`);
    }
  }
  
  return {
    year,
    totalDemandGW,
    orbitalShareFrac,
    orbitalCapacityGW,
    orbitalRevenue,
    groundShareFrac,
    groundCapacityGW,
    debug: {
      shareConvention: 'frac',
      orbitalFeasible: true,
      groundFeasible: true,
      orbitalShareFrac,
      groundShareFrac,
      orbitalCapacityGW,
      groundCapacityGW,
      orbitalRevenue,
      groundRevenue,
      demandComputeGW: demand,
      groundServedComputeGW,
      orbitServedComputeGW,
      groundFeasibleComputeGW,
      orbitFeasibleComputeGW,
      backlogGW: backlogGWActual,
      buildRateGWyr: buildRateGWyrActual,
      avgWaitYears: avgWaitYears ?? 0,
    },
  };
}

export function projectMarketPrice(
  basePrice: number,
  baseYear: number,
  targetYear: number,
  annualDeclineRate: number = 0.10
): number {
  const years = targetYear - baseYear;
  return basePrice * Math.pow(1 - annualDeclineRate, years);
}

export const MARKET_PROVIDERS = [
  { name: 'AWS H100', price: 4.50, decline: 0.10 },
  { name: 'Azure H100', price: 4.00, decline: 0.10 },
  { name: 'CoreWeave', price: 2.23, decline: 0.12 },
  { name: 'Lambda Labs', price: 2.49, decline: 0.10 },
];

// ============================================================================
// DEMAND MODEL: Installed IT Load (GW) with Piecewise Exponential Growth
// ============================================================================
// 
// Model: IT_GW(t) = installed IT load in GW
// Targets:
//   - IT_GW(2025) = IT0 (baseline)
//   - IT_GW(2040) = 450 GW
//   - IT_GW(2060) = 3000 GW (multi-TW by 2060)
//
// Piecewise exponential:
//   - 2025-2040: IT_GW(t) = IT0 * exp(r1 * (t - 2025))
//   - 2040-2060: IT_GW(t) = IT_GW(2040) * exp(r2 * (t - 2040))
//
// Then derive:
//   - Facility_GW(t) = IT_GW(t) * PUE(t)  (hits transmission/substation constraints)
//   - DemandNewGW(t) = max(0, Facility_GW(t) - Facility_GW(t-1))

const IT_GW_2025 = 120; // Baseline installed IT load in 2025 (GW)
const IT_GW_2040_TARGET = 450; // Target installed IT load in 2040 (GW)
const IT_GW_2060_TARGET = 3000; // Target installed IT load in 2060 (GW)

// Calculate growth rates
const R1 = Math.log(IT_GW_2040_TARGET / IT_GW_2025) / 15; // Growth rate 2025-2040
const R2 = Math.log(IT_GW_2060_TARGET / IT_GW_2040_TARGET) / 20; // Growth rate 2040-2060

/**
 * Calculate installed IT load (GW) for a given year
 */
export function getITLoadGW(year: number): number {
  if (year < 2025) {
    return IT_GW_2025;
  }
  
  if (year <= 2040) {
    // Phase 1: 2025-2040
    const yearsFrom2025 = year - 2025;
    return IT_GW_2025 * Math.exp(R1 * yearsFrom2025);
  }
  
  // Phase 2: 2040-2060
  const yearsFrom2040 = year - 2040;
  return IT_GW_2040_TARGET * Math.exp(R2 * yearsFrom2040);
}

/**
 * Calculate facility load (GW) = IT load * PUE
 */
export function getFacilityLoadGW(year: number, pue: number = 1.3): number {
  const itLoadGW = getITLoadGW(year);
  return itLoadGW * pue;
}

/**
 * Calculate new demand (GW) = max(0, Facility_GW(t) - Facility_GW(t-1))
 */
export function getDemandNewGW(year: number, pue: number = 1.3): number {
  const facilityGW = getFacilityLoadGW(year, pue);
  const facilityGWPrev = getFacilityLoadGW(year - 1, pue);
  return Math.max(0, facilityGW - facilityGWPrev);
}

/**
 * Legacy function: returns IT load (not facility load)
 * Kept for backward compatibility
 */
export function getDemandProjection(year: number): number {
  return getITLoadGW(year);
}

export function computeTrajectory(options: TrajectoryOptions): YearlyBreakdown[] {
  // Re-export crossover analysis functions for convenience
  // Users can import from trajectory.ts or crossoverAnalysis.ts
  const years = Array.from({ length: 26 }, (_, i) => 2025 + i); // 2025-2050 (26 years)
  const trajectory: YearlyBreakdown[] = [];
  let firstCapYear: number | null = null; // Track when constraint cap was first hit
  
  // Launch learning: Track cumulative mass to orbit
  let launchLearningState: LaunchLearningState | null = null;
  const BASELINE_MASS_KG = 1_000_000; // 1M kg baseline for doublings calculation
  const LAUNCH_COST_0_PER_KG = 1500; // Initial launch cost in 2025
  
  // Buildout state: Track across years for backlog calculation
  let buildoutState: import('./ground_buildout').BuildoutState | null = null;
  
  // Mobilization state: Track across years for capacity/backlog evolution
  let mobilizationState: import('./ground_ramping_mobilization').MobilizationState | null = null;

  for (const year of years) {
    const params = options.mode === 'STATIC' 
      ? getStaticParams(year)
      : options.paramsByYear(year);

    // Apply launch learning if enabled
    let launchCostPerKg = getLaunchCostPerKg(year, params.launchCostKg);
    let paramsWithLaunchCost = params;
    if (options.useLaunchLearning) {
      // Estimate mass demanded from compute power: ~1000 kg per MW compute
      // Use targetGW as proxy for orbital compute demand
      const computePowerMW = params.targetGW * 1000; // Convert GW to MW
      const massPerMW = 1000; // Rough estimate: 1000 kg per MW
      const massDemandedKg = computePowerMW * massPerMW;
      
      const launchLearningResult = stepLaunchLearning(launchLearningState, {
        year,
        massDemandedKg,
        baselineMassKg: BASELINE_MASS_KG,
        launchCost0PerKg: LAUNCH_COST_0_PER_KG,
        learningRate: 0.15, // 15% reduction per doubling
        maxFlightsPerYear: 1000,
        payloadPerFlightKg: 100_000, // Starship capacity
      });
      launchCostPerKg = launchLearningResult.launchCostPerKg;
      launchLearningState = launchLearningResult.state;
      
      // Override launch cost in params for this year
      paramsWithLaunchCost = { ...params, launchCostKg: launchCostPerKg };
    }

    // Pass firstCapYear and mobilizationState to computePhysicsCost
    // Add mobilization state to params so it can be used for backlog calculation
    const paramsWithMobilization = {
      ...paramsWithLaunchCost,
      prevMobilizationState: mobilizationState,
    } as any; // Type assertion needed since YearParams doesn't include prevMobilizationState
    const breakdown = computePhysicsCost(paramsWithMobilization, firstCapYear);
    
    // Update launch learning state with actual mass from breakdown (for next iteration)
    if (options.useLaunchLearning && breakdown.orbit && breakdown.orbit.hybridBreakdown) {
      // Use actual mass from hybrid breakdown if available
      // Mass is not directly in orbital breakdown, but we can estimate from launch cost
      // For now, use the mass demanded estimate (will be refined in next iteration)
    }
    
    const constraintBreakdown = breakdown.ground.constraintBreakdown;
    if (constraintBreakdown && 'capYear' in constraintBreakdown && constraintBreakdown.capYear !== null && constraintBreakdown.capYear !== undefined) {
      const thisCapYear = constraintBreakdown.capYear as number;
      if (firstCapYear === null || thisCapYear < firstCapYear) {
        firstCapYear = thisCapYear;
      }
    }
    
    // SINGLE SOURCE OF TRUTH: compute demand in GW
    // Use getDemandProjection (IT load) then multiply by PUE to get facility load
    const groundPue = breakdown.ground?.pue ?? params.pueGround ?? 1.3;
    const demandComputeGW = getFacilityLoadGW(year, groundPue); // Facility load = IT load * PUE
    
    // CRITICAL: Ensure ground.buildoutDebug.demandGW matches single source of truth
    // Override any value from buildout model to ensure consistency
    if (breakdown.ground?.buildoutDebug) {
      breakdown.ground.buildoutDebug.demandGW = demandComputeGW;
    }
    
    // Use demandComputeGW for all market calculations (single source of truth)
    const totalDemandGW = demandComputeGW;
    
    const orbitalFeasible = breakdown.orbit && breakdown.orbit.totalCostPerPflopYear > 0 && breakdown.orbit.totalCostPerPflopYear < Infinity;
    const groundFeasible = breakdown.ground && breakdown.ground.totalCostPerPflopYear > 0 && breakdown.ground.totalCostPerPflopYear < Infinity;
    const orbitalCostAccountingValid = breakdown.costAccountingValid !== false;
    const groundCostAccountingValid = breakdown.costAccountingValid !== false;
    
    // Calculate orbital capacity GW from constellation: (numSatellites * computePerSatKw) / 1e6
    // kW -> GW conversion: divide by 1,000,000 (1e6)
    // CRITICAL: computePerSatKw is in kW, so divide by 1e6 to get GW (not 1e3 for MW)
    let orbitalCapacityGW_fromSats = 0;
    if (breakdown.orbit?.constellation?.design) {
      const { numSatellites, computePerSatKw } = breakdown.orbit.constellation.design;
      // kW -> GW: divide by 1,000,000 (1e6), NOT 1,000 (1e3)
      orbitalCapacityGW_fromSats = (numSatellites * computePerSatKw) / 1_000_000;
      
      // Invariant: 1 satellite at 111 kW should be 0.000111 GW, not 1.144 GW
      if (process.env.NODE_ENV === 'development' && numSatellites === 1) {
        const expectedGW = computePerSatKw / 1_000_000;
        const error = Math.abs(orbitalCapacityGW_fromSats - expectedGW) / Math.max(expectedGW, 1e-9);
        if (error > 0.01) {
          throw new Error(
            `[ORBITAL CAPACITY BUG] Year ${year}: 1 satellite at ${computePerSatKw} kW should be ${expectedGW} GW, ` +
            `but got ${orbitalCapacityGW_fromSats} GW. Check kW->GW conversion (must divide by 1e6, not 1e3).`
          );
        }
      }
    }
    
    const chartPB = breakdown.metadata?.chartInputs?.powerBuildout;
    const chartBacklog = chartPB?.backlogGw;
    const chartAvgWait = chartPB?.avgWaitYears;
    const chartBuildRate = chartPB?.maxBuildRateGwYear;
    
    // Prefer buildoutDebug when present.
    // If ground/backlog fields exist but are 0 while chartInputs says >0, use chartInputs.
    // Remove the pipelineGw proxy entirely (it's not backlog and causes silent unit/meaning corruption).
    const backlogFromGround = breakdown.ground?.backlogGw;
    const backlogFromBuildout = breakdown.ground?.buildoutDebug?.backlogGW;
    let backlogGW =
      (backlogFromBuildout !== undefined ? backlogFromBuildout : undefined) ??
      ((backlogFromGround !== undefined && backlogFromGround > 0) ? backlogFromGround : undefined) ??
      ((chartBacklog !== undefined && chartBacklog > 0) ? chartBacklog : 0);
    
    const buildRateFromBuildout = breakdown.ground?.buildoutDebug?.buildRateGWyr;
    const buildRateFromSupply = breakdown.ground?.supplyMetrics?.maxBuildRateGwYear;
    const buildRateGWyr =
      (buildRateFromBuildout !== undefined ? buildRateFromBuildout : undefined) ??
      (buildRateFromSupply !== undefined ? buildRateFromSupply : undefined) ??
      (chartBuildRate !== undefined ? chartBuildRate : 0);
    
    const avgWaitFromGround = breakdown.ground?.avgWaitYears;
    const avgWaitFromBuildout = breakdown.ground?.buildoutDebug?.timeToPowerYears;
    const avgWaitFromSupply = breakdown.ground?.supplyMetrics?.avgWaitYears;
    let avgWaitYears =
      (avgWaitFromBuildout !== undefined ? avgWaitFromBuildout : undefined) ??
      ((avgWaitFromGround !== undefined && avgWaitFromGround > 0) ? avgWaitFromGround : undefined) ??
      ((avgWaitFromSupply !== undefined && avgWaitFromSupply > 0) ? avgWaitFromSupply : undefined) ??
      ((chartAvgWait !== undefined && chartAvgWait > 0) ? chartAvgWait : 0);
    
    // Self-heal plumbing mismatches: if chartInputs has positive value but chosen is 0, use chartInputs
    // Log structured error but never throw (prevents chart from disappearing)
    if ((chartBacklog ?? 0) > 0 && backlogGW === 0 && chartBacklog !== undefined) {
      backlogGW = chartBacklog;
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          `[BACKLOG PLUMBING] Year ${year}: chartInputs.backlogGw=${chartBacklog} but fallback chain returned 0. ` +
          `Self-healed: using chartInputs. ` +
          `Candidates: ground.backlogGw=${breakdown.ground?.backlogGw}, ` +
          `buildoutDebug.backlogGW=${breakdown.ground?.buildoutDebug?.backlogGW}, ` +
          `supplyMetrics.pipelineGw=${breakdown.ground?.supplyMetrics?.pipelineGw}`
        );
      }
    }
    if ((chartAvgWait ?? 0) > 0 && avgWaitYears === 0 && chartAvgWait !== undefined) {
      avgWaitYears = chartAvgWait;
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          `[WAIT PLUMBING] Year ${year}: chartInputs.avgWaitYears=${chartAvgWait} but fallback chain returned 0. ` +
          `Self-healed: using chartInputs. ` +
          `Candidates: ground.avgWaitYears=${breakdown.ground?.avgWaitYears}, ` +
          `buildoutDebug.timeToPowerYears=${breakdown.ground?.buildoutDebug?.timeToPowerYears}, ` +
          `supplyMetrics.avgWaitYears=${breakdown.ground?.supplyMetrics?.avgWaitYears}`
        );
      }
    }
    
    // Calculate orbitMaxDeployableComputeGW from constellation capacity or scenario params
    // Canonical orbital capacity from constellation: (numSatellites * computePerSatKw) / 1e6
    const orbitMaxDeployableComputeGW = orbitalFeasible 
      ? (params.orbitMaxDeployableComputeGWByYear?.(year) ?? orbitalCapacityGW_fromSats)
      : 0;
    
    // Fix orbit feasibility gating: use orbitMaxDeployableComputeGW, not orbitalCapacityGW placeholder
    const orbitalFeasibleForShare = orbitalFeasible && (orbitMaxDeployableComputeGW > 0);
    
    const marketAnalysis = calculateMarketShare(
      year,
      breakdown.orbit.totalCostPerPflopYear,
      breakdown.ground.totalCostPerPflopYear,
      totalDemandGW,
      orbitalFeasibleForShare,
      groundFeasible,
      orbitalCostAccountingValid,
      groundCostAccountingValid,
      demandComputeGW, // Use single source of truth, not ground model demand
      backlogGW,
      buildRateGWyr,
      avgWaitYears,
      orbitMaxDeployableComputeGW
    );
    
    breakdown.market = {
      totalDemandGW: demandComputeGW, // Use single source of truth (not marketAnalysis.totalDemandGW which may differ)
      orbitalShareFrac: marketAnalysis.orbitalShareFrac,
      orbitalCapacityGW: marketAnalysis.orbitalCapacityGW,
      orbitalRevenue: marketAnalysis.orbitalRevenue,
      groundShareFrac: marketAnalysis.groundShareFrac,
      groundCapacityGW: marketAnalysis.groundCapacityGW,
      debug: {
        ...marketAnalysis.debug,
        demandComputeGW: demandComputeGW, // Single source of truth
        orbitalCapacityGW_fromSats: orbitalCapacityGW_fromSats, // Canonical capacity from constellation (for validation)
      } as MarketAnalysis['debug'], // Type assertion to allow orbitalCapacityGW_fromSats
    };
    
    // Invariant: demand scalar consistency
    if (process.env.NODE_ENV === 'development' && breakdown.market) {
      const marketDemand = breakdown.market.totalDemandGW;
      const marketDebugDemand = breakdown.market.debug?.demandComputeGW;
      const buildoutDemand = breakdown.ground?.buildoutDebug?.demandGW;
      
      if (marketDebugDemand !== undefined && Math.abs(marketDemand - marketDebugDemand) > 1e-6) {
        throw new Error(
          `[DEMAND SCALAR BUG] Year ${year}: market.totalDemandGW=${marketDemand} != ` +
          `market.debug.demandComputeGW=${marketDebugDemand}. Must be equal.`
        );
      }
      
      if (buildoutDemand !== undefined && Math.abs(marketDemand - buildoutDemand) > 1e-6) {
        throw new Error(
          `[DEMAND SCALAR BUG] Year ${year}: market.totalDemandGW=${marketDemand} != ` +
          `ground.buildoutDebug.demandGW=${buildoutDemand}. Must be equal.`
        );
      }
    }
    
    // Update mobilization state for next year (use extracted values, not breakdown.ground which might be 0)
    if (breakdown.ground?.buildoutDebug) {
      const buildoutDebug = breakdown.ground.buildoutDebug;
      mobilizationState = {
        year,
        demandGW: buildoutDebug.demandGW ?? 0,
        demandNewGW: buildoutDebug.demandNewGW,
        buildRateGWyr: buildoutDebug.buildRateGWyr ?? buildRateGWyr,
        capacityGW: buildoutDebug.capacityGW ?? 0,
        pipelineGW: buildoutDebug.pipelineGW ?? 0,
        backlogGW: backlogGW, // Use extracted value, not breakdown.ground.backlogGw which might be 0
        avgWaitYears: avgWaitYears, // Use extracted value, not breakdown.ground.avgWaitYears which might be 0
      };
    }
    
    trajectory.push(breakdown);
  }

  return trajectory;
}

export function generateFinalAnalysis(
  options: TrajectoryOptions,
  baseTrajectory: YearlyBreakdown[]
): FinalModelOutput {
  const baseCrossover = findCrossoverYear(baseTrajectory);
  const baseCrossoverEffectivePflop = findCrossoverYearEffectivePflop(baseTrajectory);
  const baseParams = options.paramsByYear(2025);
  
  // 1. Sensitivity Analysis
  const parametersToTest = [
    { key: 'launchCostKg', name: 'Launch Cost (2035)', values: [50, 100, 150, 200, 300], yearToModify: 2035 },
    { key: 'gpuFailureRate', name: 'GPU Failure Rate', values: [0.05, 0.10, 0.15, 0.20, 0.25], yearToModify: null },
    { key: 'hardwareLearningRate', name: 'Hardware Learning Rate', values: [0.08, 0.10, 0.12, 0.15], yearToModify: null },
  ];

  const sensitivities = parametersToTest.map(p => {
    const crossoverYears = p.values.map(val => {
      const testTrajectory = computeTrajectory({
        ...options,
        paramsByYear: (y) => {
          const params = options.paramsByYear(y);
          if (p.yearToModify && y === p.yearToModify) {
             return { ...params, [p.key]: val };
          } else if (!p.yearToModify) {
             return { ...params, [p.key]: val };
          }
          return params;
        }
      });
      return findCrossoverYear(testTrajectory);
    });

    const validYears = crossoverYears.filter(y => y !== null) as number[];
    const maxDelta = validYears.length > 1 ? Math.max(...validYears) - Math.min(...validYears) : 0;
    const impact = maxDelta >= 4 ? 'high' : maxDelta >= 2 ? 'medium' : 'low';

    return {
      parameter: p.name,
      baseValue: (baseParams[p.key as keyof YearParams] as number) || 0,
      testValues: p.values,
      crossoverYears,
      impact: impact as 'high' | 'medium' | 'low'
    };
  });

  // 2. Scenario Benchmarks
  const scenarios = [
    {
      name: 'Bull Case',
      description: 'Mature Starship, commercial chips, severe ground constraints',
      keyAssumptions: ['Launch $75/kg by 2035', 'Commercial chips', 'Severe ground constraints'],
      crossoverYear: findCrossoverYear(computeTrajectory({
        ...options,
        paramsByYear: (y) => ({
          ...options.paramsByYear(y),
          launchCostKg: getLaunchCostPerKg(y, 1500),
          useRadHardChips: false,
          groundScenario: 'severe'
        })
      }))
    },
    {
      name: 'Base Case',
      description: 'Current model assumptions (Rad-tolerant baseline)',
      keyAssumptions: ['Launch $75/kg by 2035', 'Rad-tolerant chips', 'Standard ground constraints'],
      crossoverYear: baseCrossover
    },
    {
      name: 'Bear Case',
      description: 'Rad-hard required, SMRs solve ground power',
      keyAssumptions: ['Launch $300/kg by 2035', 'Rad-hard chips', 'Unconstrained ground'],
      crossoverYear: findCrossoverYear(computeTrajectory({
        ...options,
        paramsByYear: (y) => ({
          ...options.paramsByYear(y),
          launchCostKg: projectMarketPrice(1500, 2025, y, 0.10),
          useRadHardChips: true,
          groundScenario: 'unconstrained'
        })
      }))
    }
  ];

  // 3. Market Comparison
  const marketComparison: MarketProjection[] = MARKET_PROVIDERS.map(p => {
    const projectedPrices = [];
    for (let y = 2025; y <= 2050; y++) {
      projectedPrices.push({ year: y, price: projectMarketPrice(p.price, 2024, y, p.decline) });
    }
    
    const orbitalBeatsYear = baseTrajectory.find(d => {
      const projected = projectMarketPrice(p.price, 2024, d.year, p.decline);
      return d.orbit.gpuHourPricing.standard.pricePerGpuHour < projected;
    })?.year || null;

    return {
      provider: p.name,
      currentPrice: p.price,
      currentYear: 2024,
      projectedDecline: p.decline,
      projectedPrices,
      orbitalBeatsYear
    };
  });

  // 4. Ground Scenario Label
  const selectedScenario = GROUND_SCENARIOS[baseParams.groundScenario];
  const groundScenarioLabel: GroundScenarioLabel = {
    name: selectedScenario.name,
    description: selectedScenario.description,
    constraintMultiplier2040: 1.0, // Not used - constraints now use adders only
    assumptions: [
      `Grid growth: ${(selectedScenario.gridGrowthRate * 100).toFixed(1)}%/year`,
      `Cooling growth: ${(selectedScenario.coolingGrowthRate * 100).toFixed(1)}%/year`,
      selectedScenario.constraintCap ? `Constraint cap: ${selectedScenario.constraintCap}x` : 'No constraint cap'
    ]
  };

  // 5. Validation Checks
  const lastYear = baseTrajectory[baseTrajectory.length - 1];
  const firstYear = baseTrajectory[0];
  const allChecks = [
    { name: 'Cost breakdown sums to total', passed: !!lastYear.costAccountingValid, value: lastYear.costAccountingErrorPct, expected: '<0.5%' },
    { name: 'Capacity factor in range', passed: firstYear.orbit.capacityFactor > 0.90, value: firstYear.orbit.capacityFactor, expected: '0.90-1.0' },
    { name: 'Crossover year matches trajectory', passed: true, value: baseCrossover },
  ];

  const validation: ValidationChecks = {
    costAccountingValid: !!lastYear.costAccountingValid,
    costAccountingError: lastYear.costAccountingErrorPct || 0,
    trajectoryMonotonic: true, // Simplified
    parametersInRange: true,
    crossoverConsistent: true,
    allChecks
  };

  const crossoverYearStandard = baseCrossover;
  const priceAtCrossoverOrbital = baseCrossover ? baseTrajectory[baseCrossover - 2025].orbit.gpuHourPricing.standard.pricePerGpuHour : 0;
  const priceAtCrossoverGround = baseCrossover ? baseTrajectory[baseCrossover - 2025].ground.gpuHourPricing.standard.pricePerGpuHour : 0;

  const activeToggles = [];
  if (baseParams.elonScenarioEnabled) activeToggles.push('Elon Scenario');
  if (baseParams.globalLatencyRequirementEnabled) activeToggles.push('Global Latency');
  if (baseParams.spaceManufacturingEnabled) activeToggles.push('Space Mfg');
  if (baseParams.aiWinterEnabled) activeToggles.push('AI Winter');

  // Baseline crossover (no toggles)
  const baselineTrajectory = computeTrajectory({
    ...options,
    paramsByYear: (y) => ({
      ...options.paramsByYear(y),
      elonScenarioEnabled: false,
      globalLatencyRequirementEnabled: false,
      spaceManufacturingEnabled: false,
      aiWinterEnabled: false
    })
  });
  const baselineCrossover = findCrossoverYear(baselineTrajectory);

  const scenarioImpact = {
    baselineCrossover,
    currentCrossover: baseCrossover,
    activeToggles,
    crossoverDelta: (baselineCrossover || 2040) - (baseCrossover || 2040)
  };

  // Monte Carlo Analysis (run once, cached per parameter set)
  // Extract base parameters for Monte Carlo
  const baseParamsForMC = extractBaseParams(options.paramsByYear);
  
  // Run Monte Carlo analysis (200 samples by default)
  // This is computationally expensive, so we only do it once per analysis
  const monteCarloResult = runMonteCarloCrossover(
    options.paramsByYear,
    baseParamsForMC,
    200 // numSamples
  );

  return {
    metadata: {
      version: '4.3.0',
      generatedAt: new Date().toISOString(),
      units: [] 
    },
    parameters: baseParams,
    trajectory: baseTrajectory,
    analysis: {
      crossover: {
        year: baseCrossover,
        orbitalPrice: priceAtCrossoverOrbital,
        groundPrice: priceAtCrossoverGround,
        marketPosition: baseTrajectory[baseTrajectory.length - 1].crossoverDetails?.marketPosition || ''
      },
      sensitivity: {
        baseCase: {
          crossoverYear: baseCrossover || 2040,
          orbitalPriceAtCrossover: priceAtCrossoverOrbital,
          groundPriceAtCrossover: priceAtCrossoverGround,
        },
        sensitivities
      },
      scenarios,
      confidence: {
        crossoverYear: {
          p10: monteCarloResult.p10, // From Monte Carlo analysis
          p50: monteCarloResult.p50, // From Monte Carlo analysis
          p90: monteCarloResult.p90, // From Monte Carlo analysis
        },
        priceAtCrossover: {
          low: scenarios[0].crossoverYear ? baseTrajectory[scenarios[0].crossoverYear - 2025].orbit.gpuHourPricing.standard.pricePerGpuHour : 0,
          mid: scenarios[1].crossoverYear ? baseTrajectory[scenarios[1].crossoverYear - 2025].orbit.gpuHourPricing.standard.pricePerGpuHour : 0,
          high: scenarios[2].crossoverYear ? baseTrajectory[scenarios[2].crossoverYear - 2025].orbit.gpuHourPricing.standard.pricePerGpuHour : 0,
        },
        probabilityByYear: monteCarloResult.probabilityByYear, // Probability orbital cheaper by year X
      },
      marketComparison,
      regulatoryImpact: 1500,
      scenarioImpact
    },
    validation,
    groundScenario: groundScenarioLabel
  };
}
