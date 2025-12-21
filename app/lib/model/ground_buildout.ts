/**
 * Ground MW Buildout Constraint Model
 * 
 * Models incremental demand vs buildable capacity, backlog, and time-to-power.
 * Converts constraints into $ terms: buildout capex premium and delay penalties.
 */

export interface BuildoutParams {
  demandNewGWByYear: number; // Incremental datacenter load (GW)
  buildableGWByYear: number; // Incremental grid-deliverable capacity (GW)
  backlogGW: number; // Current backlog (GW)
  avgWaitYears: number; // Average wait time (years)
  baseEnergyPricePerMwhByYear: number;
  pueGroundByYear: number;
  wacc: number;
  projectLifetimeYears: number;
  valueOfTimeMode: 'wacc_on_capex' | 'lost_margin' | 'hybrid';
  buildoutCapexBase_$PerkW: number;
  buildoutCapexScarcityCurve: {
    k: number; // Scaling factor (buildoutK)
    exponent: number; // Exponent for convex premium (buildoutExponent)
    thresholdUtil: number; // Utilization threshold before premium kicks in
  };
  panicExponent?: number; // Exponent for delay penalty panic regime (default 1.3)
  hardwareCapexPerPflopYear: number; // For valueOfTime calculation
  siteCapexAmortPerPflopYear: number; // For valueOfTime calculation
  // For valueOfTime calculation
  computeHardwareCapex?: number; // $/kW for compute hardware
  siteCapex?: number; // $/kW for site infrastructure
  marginPerGpuHour?: number; // $/GPU-hour margin
  annualGpuHoursDelivered?: number; // GPU-hours per kW per year
  hybridWeights?: {
    waccWeight: number;
    marginWeight: number;
  };
}

export interface BuildoutState {
  year: number;
  backlogGW: number; // GW waiting to be built
  timeToPowerYears: number; // Years until power available
  scarcityIndex: number; // (demandNewGW / buildableGW) - 1
  buildoutCapex_$PerkW: number; // Scarcity-adjusted buildout capex
  annualizedBuildoutPremium_$PerkWyr: number; // Amortized premium per kW-year
  delayPenalty_$PerYear: number; // Delay penalty per year
  valueOfTime_$PerYear: number; // Value of time per year (for delay penalty)
}

export interface BuildoutResult {
  state: BuildoutState;
  // Converted to PFLOP-year terms
  buildoutPremiumPerPflopYear: number;
  delayPenaltyPerPflopYear: number;
  // Debug
  demandNewGW: number;
  buildableGW: number;
  factors: {
    scarcityIndex: number;
    buildoutCapex_$PerkW: number;
    annualizedBuildoutPremium_$PerkWyr: number;
    timeToPowerYears: number;
    valueOfTime_$PerYear: number;
    delayPenalty_$PerYear: number;
  };
}

/**
 * Step buildout state forward one year
 */
export function stepBuildoutState(
  prevState: BuildoutState | null,
  params: BuildoutParams,
  year: number
): BuildoutState {
  const { demandNewGWByYear, buildableGWByYear, backlogGW, avgWaitYears, buildoutCapexScarcityCurve } = params;
  
  // Use provided backlog and wait time (from mobilization model)
  const timeToPowerYears = avgWaitYears;
  
  // Calculate queue pressure
  // queuePressure = 1 + backlogGw(t)/max(buildableGw(t), eps)
  const EPS = 1e-9;
  const buildableGW = Math.max(buildableGWByYear, EPS);
  const queuePressure = 1 + backlogGW / buildableGW;
  
  // Calculate scarcity index
  // scarcityIndex = max(0, demandNewGw(t)/max(buildableGw(t), eps) - 1)
  const scarcityIndex = Math.max(0, demandNewGWByYear / buildableGW - 1);
  
  // Calculate buildout capex with scarcity curve
  // buildoutCapex_$PerkW = base * (1 + buildoutK * scarcityIndex^buildoutExponent)
  const scarcityExcess = Math.max(0, scarcityIndex - params.buildoutCapexScarcityCurve.thresholdUtil);
  const scarcityPremium = params.buildoutCapexScarcityCurve.k * Math.pow(scarcityExcess, params.buildoutCapexScarcityCurve.exponent);
  const buildoutCapex_$PerkW = params.buildoutCapexBase_$PerkW * (1 + scarcityPremium);
  
  // Annualize buildout capex premium
  // annualizedBuildoutPremium_$PerkWyr = amortize(buildoutCapex_$PerkW, wacc, lifetime)
  const annualizedBuildoutPremium_$PerkWyr = amortizeCapex(
    buildoutCapex_$PerkW,
    params.wacc,
    params.projectLifetimeYears
  );
  
  // Calculate value of time (WACC on capex by default)
  // valueOfTimePerYear = wacc * (hardwareCapexPerPflopYear + siteCapexAmortPerPflopYear)
  const valueOfTimePerYear = params.wacc * (params.hardwareCapexPerPflopYear + params.siteCapexAmortPerPflopYear);
  
  // Calculate delay penalty with panic regime
  // delayPenalty = avgWaitYears * valueOfTimePerYear * (queuePressure^panicExponent)
  const panicExponent = params.panicExponent ?? 1.3;
  const delayPenalty_$PerYear = timeToPowerYears * valueOfTimePerYear * Math.pow(queuePressure, panicExponent);
  
  // Invariants
  if (process.env.NODE_ENV === 'development') {
    if ((queuePressure > 1.1 || scarcityIndex > 0) && (annualizedBuildoutPremium_$PerkWyr <= 0 && delayPenalty_$PerYear <= 0)) {
      throw new Error(
        `[BUILDOUT INVARIANT] Year ${year}: queuePressure=${queuePressure.toFixed(2)} > 1.1 OR ` +
        `scarcityIndex=${scarcityIndex.toFixed(2)} > 0, but ` +
        `(delayPenalty=${delayPenalty_$PerYear.toFixed(2)} + buildoutPremium=${annualizedBuildoutPremium_$PerkWyr.toFixed(2)}) <= 0. ` +
        `At least one must be > 0.`
      );
    }
  }
  
  return {
    year,
    backlogGW,
    timeToPowerYears,
    scarcityIndex,
    buildoutCapex_$PerkW,
    annualizedBuildoutPremium_$PerkWyr,
    delayPenalty_$PerYear,
    valueOfTime_$PerYear: valueOfTimePerYear,
  };
}

/**
 * Calculate value of time based on mode
 * NOTE: This is now calculated directly in stepBuildoutState using hardwareCapexPerPflopYear and siteCapexAmortPerPflopYear
 * This function is kept for backward compatibility but may not be used
 */
function calculateValueOfTime(params: BuildoutParams): number {
  const { valueOfTimeMode, wacc, hardwareCapexPerPflopYear = 0, siteCapexAmortPerPflopYear = 0, marginPerGpuHour = 0, annualGpuHoursDelivered = 0, hybridWeights } = params;
  
  switch (valueOfTimeMode) {
    case 'wacc_on_capex': {
      // WACC * (hardwareCapexPerPflopYear + siteCapexAmortPerPflopYear)
      const totalCapex = hardwareCapexPerPflopYear + siteCapexAmortPerPflopYear;
      return wacc * totalCapex;
    }
    
    case 'lost_margin': {
      // marginPerGpuHour * annualGpuHoursDelivered
      return marginPerGpuHour * annualGpuHoursDelivered;
    }
    
    case 'hybrid': {
      const waccWeight = hybridWeights?.waccWeight ?? 0.5;
      const marginWeight = hybridWeights?.marginWeight ?? 0.5;
      
      const waccComponent = wacc * (hardwareCapexPerPflopYear + siteCapexAmortPerPflopYear);
      const marginComponent = marginPerGpuHour * annualGpuHoursDelivered;
      
      return waccWeight * waccComponent + marginWeight * marginComponent;
    }
    
    default:
      throw new Error(`Unknown valueOfTimeMode: ${valueOfTimeMode}`);
  }
}

/**
 * Amortize capex using WACC
 * Returns annual payment: capex * (wacc * (1 + wacc)^n) / ((1 + wacc)^n - 1)
 */
function amortizeCapex(capex: number, wacc: number, years: number): number {
  if (wacc <= 0 || years <= 0) {
    return capex / years; // Simple linear amortization if no WACC
  }
  
  const onePlusWacc = 1 + wacc;
  const onePlusWaccN = Math.pow(onePlusWacc, years);
  const denominator = onePlusWaccN - 1;
  
  if (denominator <= 0) {
    return capex / years; // Fallback to linear
  }
  
  return capex * (wacc * onePlusWaccN) / denominator;
}

/**
 * Convert buildout costs to PFLOP-year terms
 */
export function convertBuildoutToPflopYear(
  buildoutResult: BuildoutResult,
  gflopsPerWatt: number,
  pue: number,
  capacityFactor: number
): {
  buildoutPremiumPerPflopYear: number;
  delayPenaltyPerPflopYear: number;
} {
  // Convert kW to PFLOPs
  // 1 kW = 1000 W
  // PFLOPs per kW = (1000 W * gflopsPerWatt * capacityFactor) / (pue * 1e6)
  const pflopsPerKW = (1000 * gflopsPerWatt * capacityFactor) / (pue * 1e6);
  
  // Convert $/kW-year to $/PFLOP-year
  const buildoutPremiumPerPflopYear = buildoutResult.state.annualizedBuildoutPremium_$PerkWyr / pflopsPerKW;
  
  // Convert delay penalty: $/year per kW -> $/PFLOP-year
  // delayPenalty_$PerYear is already per kW, so divide by pflopsPerKW
  const delayPenaltyPerPflopYear = buildoutResult.state.delayPenalty_$PerYear / pflopsPerKW;
  
  return {
    buildoutPremiumPerPflopYear,
    delayPenaltyPerPflopYear,
  };
}

/**
 * Main function: Calculate buildout constraints for a year
 */
export function calculateBuildoutConstraints(
  prevState: BuildoutState | null,
  params: BuildoutParams,
  year: number,
  gflopsPerWatt: number,
  pue: number,
  capacityFactor: number
): BuildoutResult {
  // Step state forward (uses backlogGW and avgWaitYears from params if provided)
  const state = stepBuildoutState(prevState, params, year);
  
  // Convert to PFLOP-year terms
  const { buildoutPremiumPerPflopYear, delayPenaltyPerPflopYear } = convertBuildoutToPflopYear(
    { state, buildoutPremiumPerPflopYear: 0, delayPenaltyPerPflopYear: 0, demandNewGW: params.demandNewGWByYear, buildableGW: params.buildableGWByYear, factors: state },
    gflopsPerWatt,
    pue,
    capacityFactor
  );
  
  // Invariants
  if (state.backlogGW < 0) {
    throw new Error(`[BUILDOUT INVARIANT] backlogGW=${state.backlogGW} < 0. Must be >= 0.`);
  }
  
  if (!isFinite(state.timeToPowerYears)) {
    throw new Error(`[BUILDOUT INVARIANT] timeToPowerYears=${state.timeToPowerYears} is not finite.`);
  }
  
  return {
    state,
    buildoutPremiumPerPflopYear,
    delayPenaltyPerPflopYear,
    demandNewGW: params.demandNewGWByYear,
    buildableGW: params.buildableGWByYear,
    factors: {
      scarcityIndex: state.scarcityIndex,
      buildoutCapex_$PerkW: state.buildoutCapex_$PerkW,
      annualizedBuildoutPremium_$PerkWyr: state.annualizedBuildoutPremium_$PerkWyr,
      timeToPowerYears: state.timeToPowerYears,
      valueOfTime_$PerYear: state.valueOfTime_$PerYear,
      delayPenalty_$PerYear: state.delayPenalty_$PerYear,
    },
  };
}


