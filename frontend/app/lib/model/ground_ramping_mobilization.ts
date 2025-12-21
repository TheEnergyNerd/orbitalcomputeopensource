/**
 * Ground Ramping Mobilization Model
 * 
 * Models demand growth with price-responsive demand and buildout capacity
 * ramping with investment response. Tracks capacity evolution, pipeline, backlog,
 * and wait times.
 * 
 * NEW: Price-responsive demand and investment-responsive buildout (replaces fixed anchors)
 */

export interface DemandParams {
  baseDemand2025GW: number;        // 120 GW
  organicGrowthRate: number;       // 0.10 (10% CAGR base)
  priceElasticity: number;         // -0.3 (30% demand drop per 100% price increase)
  waitElasticity: number;          // -0.2 (20% demand drop per 5yr wait)
  orbitalSubstitutionThreshold: number; // Price ratio at which demand shifts to orbital (default 1.2 = 20% cheaper)
}

export interface BuildoutParams {
  baseBuildRate2025GWyr: number;   // 25 GW/yr
  maxBuildRateGWyr: number;        // 150 GW/yr physical limit
  investmentElasticity: number;     // 0.5 (50% more investment per 100% margin increase)
  rampLimitPerYear: number;         // 0.25 (25% max increase per year)
  backlogResponseK: number;         // 0.3 (how fast buildout responds to backlog)
}

export interface MobilizationScenarioParams {
  demandAnchorsGW: {
    2025: number;
    2040: number;
    2060: number;
  };
  demandCurve: 'piecewise_exponential'; // Curve type (only piecewise_exponential supported)
  demandIsFacilityLoad: boolean; // If true, includes PUE; if false, multiply by PUE later
  buildoutAnchorsGWyr: {
    2025: number;
    2030: number;
    2040: number;
    2060: number;
  };
  buildoutSmoothingYears: number; // Smoothing window for buildout interpolation
  pipelineLeadTimeYears: number; // Lead time for pipeline calculation
  pipelineFillFrac: number; // Pipeline fill fraction (pipelineGW = leadTime * buildRate * fillFrac)
  // Bottleneck constraints
  bottleneckMode?: 'off' | 'min_of_bottlenecks'; // Default 'min_of_bottlenecks'
  bottleneckAnchorsGWyr?: {
    transformers: { 2025: number; 2030: number; 2040: number; 2060: number };
    substations: { 2025: number; 2030: number; 2040: number; 2060: number };
    tx: { 2025: number; 2030: number; 2040: number; 2060: number };
    generation: { 2025: number; 2030: number; 2040: number; 2060: number };
  };
  rampLimitFracPerYear?: number; // Max fractional change per year (default 0.25 = 25%)
}

export interface MobilizationState {
  year: number;
  demandGW: number; // Total demand (IT or facility load)
  demandNewGW: number; // Incremental demand this year
  buildRateGWyr: number; // Build rate this year (GW/year)
  capacityGW: number; // Cumulative capacity built
  pipelineGW: number; // Pipeline capacity (under construction)
  backlogGW: number; // Backlog waiting to be built
  avgWaitYears: number; // Average wait time (backlog / buildRate)
}

export interface MobilizationResult extends MobilizationState {
  // Additional debug fields
  demandGrowthRate: number; // Current growth rate (r1 or r2)
  buildoutSmoothFactor: number; // Smoothing factor applied
  // Bottleneck debug fields
  bottleneckRateGWyr?: number; // Effective bottleneck rate (min of all bottlenecks)
  limitingBottleneck?: 'transformers' | 'substations' | 'tx' | 'generation' | 'candidate' | 'none'; // Which bottleneck is limiting
  buildRateCandidate?: number; // Original build rate before bottleneck/ramp limits
}

/**
 * Calculate price-responsive demand GW
 * 
 * NEW: Demand responds to prices, wait times, and orbital substitution
 * Replaces fixed anchors with economic feedback
 */
export function calculatePriceResponsiveDemandGW(
  year: number,
  groundPricePerGpuHour: number,
  orbitalPricePerGpuHour: number,
  avgWaitYears: number,
  params: DemandParams,
  pue: number = 1.3
): number {
  // Base demand with organic growth (tapered, not exponential forever)
  const yearsFrom2025 = year - 2025;
  const growthTaper = Math.tanh(yearsFrom2025 / 30); // Tapers after ~30 years
  const baseDemand = params.baseDemand2025GW * Math.pow(1 + params.organicGrowthRate, yearsFrom2025 * growthTaper);
  
  // Price elasticity: higher prices reduce demand
  const baselinePrice = 3.50; // $/GPU-hr baseline
  const priceRatio = groundPricePerGpuHour / baselinePrice;
  const priceFactor = Math.pow(priceRatio, params.priceElasticity);
  
  // Wait elasticity: longer waits reduce demand
  const waitFactor = Math.exp(-avgWaitYears * params.waitElasticity / 5);
  
  // Orbital substitution: if orbital cheaper, demand shifts
  const orbitalAdvantage = groundPricePerGpuHour / Math.max(orbitalPricePerGpuHour, 0.01);
  const substitutionFactor = orbitalAdvantage > params.orbitalSubstitutionThreshold 
    ? 1 / (1 + 0.5 * (orbitalAdvantage - params.orbitalSubstitutionThreshold))
    : 1.0;
  
  let demandGW = baseDemand * priceFactor * waitFactor * substitutionFactor;
  
  // Apply PUE if demand is IT load (not facility load)
  // Note: This function assumes facility load, so multiply by PUE if needed
  // For now, return facility load (demand already includes PUE in baseDemand2025GW)
  
  return Math.max(0, demandGW);
}

/**
 * Legacy function: Calculate demand GW using piecewise exponential to hit anchors
 * 
 * DEPRECATED: Use calculatePriceResponsiveDemandGW instead
 * Kept for backward compatibility
 */
export function calculateDemandGW(
  year: number,
  params: MobilizationScenarioParams,
  pue: number = 1.3
): number {
  const { demandAnchorsGW, demandIsFacilityLoad, demandCurve } = params;
  const demand2025 = demandAnchorsGW[2025];
  const demand2040 = demandAnchorsGW[2040];
  const demand2060 = demandAnchorsGW[2060];
  
  if (demandCurve !== 'piecewise_exponential') {
    throw new Error(`Unsupported demandCurve: ${demandCurve}. Only 'piecewise_exponential' is supported.`);
  }
  
  if (year < 2025) {
    return demand2025;
  }
  
  let demandGW: number;
  
  if (year <= 2040) {
    // Phase 1: 2025-2040
    // r1 = ln(demand2040 / demand2025) / (2040-2025)
    const r1 = Math.log(demand2040 / demand2025) / (2040 - 2025);
    const yearsFrom2025 = year - 2025;
    demandGW = demand2025 * Math.exp(r1 * yearsFrom2025);
  } else {
    // Phase 2: 2040-2060
    // r2 = ln(demand2060 / demand2040) / (2060-2040)
    const r2 = Math.log(demand2060 / demand2040) / (2060 - 2040);
    const yearsFrom2040 = year - 2040;
    demandGW = demand2040 * Math.exp(r2 * yearsFrom2040);
  }
  
  // Apply PUE if demand is IT load (not facility load)
  if (!demandIsFacilityLoad) {
    demandGW = demandGW * pue;
  }
  
  // Hard asserts in dev mode
  if (process.env.NODE_ENV === 'development') {
    if (year === 2040) {
      const actual2040 = demandGW;
      const error2040 = Math.abs(actual2040 - demand2040) / demand2040;
      if (error2040 >= 0.03) {
        throw new Error(
          `[DEMAND ANCHOR FAIL] demandGw(2040)=${actual2040.toFixed(2)} GW, ` +
          `expected=${demand2040} GW, error=${(error2040 * 100).toFixed(2)}% >= 3%`
        );
      }
    }
    
    if (year === 2060) {
      if (demandGW < 2000) {
        throw new Error(
          `[DEMAND ANCHOR FAIL] demandGw(2060)=${demandGW.toFixed(2)} GW < 2000 GW. ` +
          `Must be >= 2000 GW (multi-TW target).`
        );
      }
    }
  }
  
  return demandGW;
}

/**
 * Calculate price-responsive buildout rate
 * 
 * NEW: Buildout responds to margins and backlog
 * Replaces fixed anchors with investment feedback
 */
export function calculatePriceResponsiveBuildRateGWyr(
  year: number,
  prevBuildRate: number,
  groundMargin: number,  // Current profit margin (price - cost) / cost
  backlogGW: number,
  params: BuildoutParams
): number {
  // Base growth (supply chain improvement)
  const yearsFrom2025 = year - 2025;
  const baseGrowth = Math.pow(1.03, yearsFrom2025); // 3% organic improvement
  const baseBuildRate = params.baseBuildRate2025GWyr * baseGrowth;
  
  // Investment response: higher margins attract more capital
  const baselineMargin = 0.20; // 20% baseline margin
  const marginRatio = groundMargin / baselineMargin;
  const investmentMultiplier = 1 + params.investmentElasticity * Math.max(0, marginRatio - 1);
  
  // Backlog response: higher backlog attracts more investment
  const backlogMultiplier = 1 + params.backlogResponseK * Math.min(1, backlogGW / 100);
  
  // Target build rate
  let targetRate = baseBuildRate * investmentMultiplier * backlogMultiplier;
  
  // Physical ceiling
  targetRate = Math.min(targetRate, params.maxBuildRateGWyr);
  
  // Ramp limit (can't increase faster than 25%/year)
  const maxRate = prevBuildRate * (1 + params.rampLimitPerYear);
  const minRate = prevBuildRate * (1 - params.rampLimitPerYear * 0.5); // Slower to decrease
  targetRate = Math.max(minRate, Math.min(maxRate, targetRate));
  
  return Math.max(0, targetRate);
}

/**
 * Legacy function: Smooth interpolation for buildout anchors
 * 
 * DEPRECATED: Use calculatePriceResponsiveBuildRateGWyr instead
 * Kept for backward compatibility
 */
export function calculateBuildRateGWyr(
  year: number,
  params: MobilizationScenarioParams
): number {
  const { buildoutAnchorsGWyr, buildoutSmoothingYears } = params;
  const anchors = buildoutAnchorsGWyr;
  
  // Find surrounding anchors
  const anchorYears = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  
  // Before first anchor: use first anchor value
  if (year <= anchorYears[0]) {
    return anchors[anchorYears[0] as keyof typeof anchors];
  }
  
  // After last anchor: use last anchor value
  if (year >= anchorYears[anchorYears.length - 1]) {
    return anchors[anchorYears[anchorYears.length - 1] as keyof typeof anchors];
  }
  
  // Find surrounding anchors
  let lowerYear = anchorYears[0];
  let upperYear = anchorYears[anchorYears.length - 1];
  
  for (let i = 0; i < anchorYears.length - 1; i++) {
    if (year >= anchorYears[i] && year <= anchorYears[i + 1]) {
      lowerYear = anchorYears[i];
      upperYear = anchorYears[i + 1];
      break;
    }
  }
  
  const lowerRate = anchors[lowerYear as keyof typeof anchors];
  const upperRate = anchors[upperYear as keyof typeof anchors];
  
  // Exponential interpolation for buildout ramp
  const t = (year - lowerYear) / (upperYear - lowerYear);
  const buildRate = lowerRate * Math.pow(upperRate / lowerRate, t);
  
  // Apply smoothing: moving average over smoothing window
  if (buildoutSmoothingYears > 0) {
    const smoothingWindow = buildoutSmoothingYears;
    let smoothedSum = buildRate;
    let count = 1;
    
    // Helper function to calculate unsmoothed rate
    const getUnsmoothedRate = (y: number): number => {
      if (y <= anchorYears[0]) return anchors[anchorYears[0] as keyof typeof anchors];
      if (y >= anchorYears[anchorYears.length - 1]) return anchors[anchorYears[anchorYears.length - 1] as keyof typeof anchors];
      
      let lower = anchorYears[0];
      let upper = anchorYears[anchorYears.length - 1];
      for (let i = 0; i < anchorYears.length - 1; i++) {
        if (y >= anchorYears[i] && y <= anchorYears[i + 1]) {
          lower = anchorYears[i];
          upper = anchorYears[i + 1];
          break;
        }
      }
      
      const lowerRate = anchors[lower as keyof typeof anchors];
      const upperRate = anchors[upper as keyof typeof anchors];
      const t = (y - lower) / (upper - lower);
      return lowerRate * Math.pow(upperRate / lowerRate, t);
    };
    
    for (let offset = 1; offset <= Math.floor(smoothingWindow / 2); offset++) {
      const prevYear = year - offset;
      const nextYear = year + offset;
      
      if (prevYear >= anchorYears[0]) {
        const prevRate = getUnsmoothedRate(prevYear);
        smoothedSum += prevRate;
        count++;
      }
      
      if (nextYear <= anchorYears[anchorYears.length - 1]) {
        const nextRate = getUnsmoothedRate(nextYear);
        smoothedSum += nextRate;
        count++;
      }
    }
    
    return smoothedSum / count;
  }
  
  return buildRate;
}

/**
 * Calculate bottleneck rate from anchors (same interpolation as buildout)
 */
function calculateBottleneckRateGWyr(
  year: number,
  anchors: { 2025: number; 2030: number; 2040: number; 2060: number }
): number {
  const anchorYears = [2025, 2030, 2040, 2060] as const;
  
  // Before first anchor: use first anchor value
  if (year <= anchorYears[0]) {
    return anchors[2025];
  }
  
  // After last anchor: use last anchor value
  if (year >= anchorYears[anchorYears.length - 1]) {
    return anchors[2060];
  }
  
  // Find surrounding anchors
  let lowerYear = anchorYears[0];
  let upperYear = anchorYears[anchorYears.length - 1];
  
  for (let i = 0; i < anchorYears.length - 1; i++) {
    if (year >= anchorYears[i] && year <= anchorYears[i + 1]) {
      lowerYear = anchorYears[i];
      upperYear = anchorYears[i + 1];
      break;
    }
  }
  
  const lowerRate = anchors[lowerYear as keyof typeof anchors];
  const upperRate = anchors[upperYear as keyof typeof anchors];
  
  // Exponential interpolation
  const t = (year - lowerYear) / (upperYear - lowerYear);
  return lowerRate * Math.pow(upperRate / lowerRate, t);
}

/**
 * Step mobilization state forward one year
 */
export function stepMobilizationState(
  prevState: MobilizationState | null,
  params: MobilizationScenarioParams,
  year: number,
  pue: number = 1.3,
  retirementsGW: number = 0, // Optional retirements (default 0)
  orbitalSubstitutionGW?: number, // Optional: demand shifted to orbital (for backlog drain)
  responsiveDemandGW?: number // Optional: responsive demand (overrides hardcoded calculateDemandGW)
): MobilizationResult {
  // Calculate demand: use responsive demand if provided, otherwise use hardcoded
  const demandGW = responsiveDemandGW !== undefined 
    ? responsiveDemandGW * pue // Convert IT load to facility load
    : calculateDemandGW(year, params, pue);
  
  // Fix 2: Calculate demandGWPrev correctly (don't use same responsiveDemandGW for both years)
  let demandGWPrev: number;
  if (prevState?.demandGW !== undefined) {
    demandGWPrev = prevState.demandGW;
  } else if (responsiveDemandGW !== undefined) {
    // For first year, estimate previous year's demand using hardcoded calculation
    // Don't use same responsiveDemandGW for both current and previous year
    demandGWPrev = calculateDemandGW(year - 1, params, pue);
  } else {
    demandGWPrev = calculateDemandGW(year - 1, params, pue);
  }
  const demandNewGW = Math.max(0, demandGW - demandGWPrev);
  
  // Calculate build rate candidate (from anchors)
  let buildRateCandidate = calculateBuildRateGWyr(year, params);
  
  // NEW: If ground demand is falling (due to orbital substitution or price elasticity),
  // buildout should slow down (no one builds capacity for declining market)
  const demandGrowthRateActual = prevState?.demandGW ? (demandGW - prevState.demandGW) / Math.max(prevState.demandGW, 1) : 0;
  if (demandGrowthRateActual < 0) {
    // Demand is shrinking - reduce buildout
    const contractionFactor = Math.max(0.5, 1 + demandGrowthRateActual * 2); // At most 50% reduction
    buildRateCandidate = buildRateCandidate * contractionFactor; // Reassign to let variable
  }
  
  // Apply bottleneck constraints if enabled
  const bottleneckMode = params.bottleneckMode ?? 'min_of_bottlenecks';
  let buildRateGWyr = buildRateCandidate;
  let bottleneckRateGWyr: number | undefined;
  let limitingBottleneck: 'transformers' | 'substations' | 'tx' | 'generation' | 'candidate' | 'none' = 'candidate';
  
  if (bottleneckMode === 'min_of_bottlenecks' && params.bottleneckAnchorsGWyr) {
    const { transformers, substations, tx, generation } = params.bottleneckAnchorsGWyr;
    
    const transformersRate = calculateBottleneckRateGWyr(year, transformers);
    const substationsRate = calculateBottleneckRateGWyr(year, substations);
    const txRate = calculateBottleneckRateGWyr(year, tx);
    const generationRate = calculateBottleneckRateGWyr(year, generation);
    
    // Find minimum bottleneck
    bottleneckRateGWyr = Math.min(transformersRate, substationsRate, txRate, generationRate);
    
    // Determine which bottleneck is limiting
    if (bottleneckRateGWyr === transformersRate) {
      limitingBottleneck = 'transformers';
    } else if (bottleneckRateGWyr === substationsRate) {
      limitingBottleneck = 'substations';
    } else if (bottleneckRateGWyr === txRate) {
      limitingBottleneck = 'tx';
    } else if (bottleneckRateGWyr === generationRate) {
      limitingBottleneck = 'generation';
    }
    
    // Effective build rate is minimum of candidate and bottleneck
    buildRateGWyr = Math.min(buildRateCandidate, bottleneckRateGWyr);
  } else {
    limitingBottleneck = 'none';
  }
  
  // Apply ramp limiter (prevent sudden jumps)
  const rampLimitFrac = params.rampLimitFracPerYear ?? 0.25;
  if (prevState?.buildRateGWyr !== undefined) {
    const prevRate = prevState.buildRateGWyr;
    const minRate = prevRate * (1 - rampLimitFrac);
    const maxRate = prevRate * (1 + rampLimitFrac);
    buildRateGWyr = Math.max(minRate, Math.min(maxRate, buildRateGWyr));
  }
  
  // Calculate capacity evolution
  // capacityGw(t) = capacityGw(t-1) + buildRateGwYear(t) - retirementsGw(t)
  const capacityGWPrev = prevState?.capacityGW ?? 0;
  const capacityGW = capacityGWPrev + buildRateGWyr - retirementsGW;
  
  // Calculate pipeline
  // pipelineGw(t) = buildRateGwYear(t) * pipelineLeadTimeYears * pipelineFillFrac
  const pipelineGW = buildRateGWyr * params.pipelineLeadTimeYears * params.pipelineFillFrac;
  
  // Calculate backlog
  // backlogGw(t) = max(0, backlogGw(t-1) + demandNewGw(t) - buildableGw(t) - implicitBacklogDrain)
  // NEW: Backlog can also be satisfied by demand shifting to orbital
  // When demand shifts to orbital, "implicit backlog drain" occurs
  // because customers who were waiting for ground now use orbital instead
  // Fix 1: Initialize with baseline backlog if no previous state
  const INITIAL_BACKLOG_GW = 50; // Same as queue model
  const backlogGWPrev = prevState?.backlogGW ?? INITIAL_BACKLOG_GW;
  const buildableGW = buildRateGWyr;
  const implicitBacklogDrain = (orbitalSubstitutionGW ?? 0) * 0.5; // 50% of shifted demand was in backlog
  
  // NEW: Backlog can drain when demand falls below buildout
  const netDemandChange = demandNewGW - buildableGW;
  
  // If orbital substitution caused demand to drop, backlog drains faster
  const demandDropFromPrev = Math.max(0, (prevState?.demandGW ?? demandGW) - demandGW);
  const substitutionDrain = demandDropFromPrev * 0.3; // 30% of demand drop was from backlog
  
  // Fix 3: Ensure backlog reflects demand-capacity gap
  // If demand >> capacity, backlog must be at least (demand - capacity)
  const unservedGW = Math.max(0, demandGW - capacityGW);
  const backlogFloor = unservedGW * 0.5; // At least 50% of unserved is in backlog
  const backlogGW = Math.max(backlogFloor, Math.max(0, backlogGWPrev + netDemandChange - substitutionDrain - implicitBacklogDrain));
  
  // Hard assert: If demandNewGw(t) > buildRateGwYear(t), backlogGw must increase
  if (process.env.NODE_ENV === 'development') {
    if (demandNewGW > buildRateGWyr && backlogGW <= backlogGWPrev) {
      throw new Error(
        `[BUILDOUT INVARIANT] Year ${year}: demandNewGW=${demandNewGW.toFixed(2)} > ` +
        `buildRateGWyr=${buildRateGWyr.toFixed(2)}, but backlogGW=${backlogGW.toFixed(2)} ` +
        `<= prevBacklogGW=${backlogGWPrev.toFixed(2)}. Backlog must increase.`
      );
    }
  }
  
  // Calculate average wait time
  // avgWaitYears(t) = backlogGw(t) / max(buildRateGwYear(t), 1e-9)
  // Fix 4: Add sanity check - if backlog > 0, wait must be > 0
  const EPS = 1e-9;
  const avgWaitYearsRaw = backlogGW / Math.max(buildRateGWyr, EPS);
  // If backlog > 0, wait must be > 0
  const avgWaitYears = backlogGW > 0.1 ? Math.max(0.1, avgWaitYearsRaw) : avgWaitYearsRaw;
  
  // Calculate growth rate (for debug)
  let demandGrowthRate: number;
  if (year <= 2040) {
    demandGrowthRate = Math.log(params.demandAnchorsGW[2040] / params.demandAnchorsGW[2025]) / 15;
  } else {
    demandGrowthRate = Math.log(params.demandAnchorsGW[2060] / params.demandAnchorsGW[2040]) / 20;
  }
  
  return {
    year,
    demandGW,
    demandNewGW,
    buildRateGWyr,
    capacityGW,
    pipelineGW,
    backlogGW,
    avgWaitYears,
    demandGrowthRate,
    buildoutSmoothFactor: params.buildoutSmoothingYears,
    bottleneckRateGWyr,
    limitingBottleneck,
    buildRateCandidate,
  };
}

/**
 * Default mobilization scenario parameters
 */
export const DEFAULT_MOBILIZATION_PARAMS: MobilizationScenarioParams = {
  demandAnchorsGW: {
    2025: 120, // Facility load baseline (IT load * PUE)
    2040: 450, // Target
    2060: 3000, // Multi-TW target
  },
  demandCurve: 'piecewise_exponential',
  demandIsFacilityLoad: true, // Demand is facility load (includes PUE)
  buildoutAnchorsGWyr: {
    2025: 25, // Wartime mobilization example
    2030: 60,
    2040: 140,
    2060: 220,
  },
  buildoutSmoothingYears: 3,
  pipelineLeadTimeYears: 3,
  pipelineFillFrac: 1.5,
  bottleneckMode: 'min_of_bottlenecks',
  bottleneckAnchorsGWyr: {
    transformers: { 2025: 30, 2030: 50, 2040: 100, 2060: 180 },
    substations: { 2025: 35, 2030: 55, 2040: 110, 2060: 200 },
    tx: { 2025: 40, 2030: 65, 2040: 130, 2060: 250 },
    generation: { 2025: 50, 2030: 80, 2040: 160, 2060: 300 },
  },
  rampLimitFracPerYear: 0.25, // 25% max change per year
};

