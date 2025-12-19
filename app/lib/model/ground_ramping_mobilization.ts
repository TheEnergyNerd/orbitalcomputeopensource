/**
 * Ground Ramping Mobilization Model
 * 
 * Models demand growth with piecewise exponential anchors and buildout capacity
 * ramping with smooth interpolation. Tracks capacity evolution, pipeline, backlog,
 * and wait times.
 */

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
}

/**
 * Calculate demand GW using piecewise exponential to hit anchors
 * 
 * r1 = ln(450 / demand2025) / (2040-2025)
 * r2 = ln(demand2060 / 450) / (2060-2040)
 * demandGw(t) = t<=2040 ? demand2025*exp(r1*(t-2025)) : 450*exp(r2*(t-2040))
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
 * Smooth interpolation for buildout anchors
 * Uses moving average with smoothing window
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
 * Step mobilization state forward one year
 */
export function stepMobilizationState(
  prevState: MobilizationState | null,
  params: MobilizationScenarioParams,
  year: number,
  pue: number = 1.3,
  retirementsGW: number = 0 // Optional retirements (default 0)
): MobilizationResult {
  // Calculate demand
  const demandGW = calculateDemandGW(year, params, pue);
  const demandGWPrev = prevState?.demandGW ?? calculateDemandGW(year - 1, params, pue);
  const demandNewGW = Math.max(0, demandGW - demandGWPrev);
  
  // Calculate build rate
  const buildRateGWyr = calculateBuildRateGWyr(year, params);
  
  // Calculate capacity evolution
  // capacityGw(t) = capacityGw(t-1) + buildRateGwYear(t) - retirementsGw(t)
  const capacityGWPrev = prevState?.capacityGW ?? 0;
  const capacityGW = capacityGWPrev + buildRateGWyr - retirementsGW;
  
  // Calculate pipeline
  // pipelineGw(t) = buildRateGwYear(t) * pipelineLeadTimeYears * pipelineFillFrac
  const pipelineGW = buildRateGWyr * params.pipelineLeadTimeYears * params.pipelineFillFrac;
  
  // Calculate backlog
  // backlogGw(t) = max(0, backlogGw(t-1) + demandNewGw(t) - buildableGw(t))
  const backlogGWPrev = prevState?.backlogGW ?? 0;
  const buildableGW = buildRateGWyr;
  const backlogGW = Math.max(0, backlogGWPrev + demandNewGW - buildableGW);
  
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
  const EPS = 1e-9;
  const avgWaitYears = backlogGW / Math.max(buildRateGWyr, EPS);
  
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
};

