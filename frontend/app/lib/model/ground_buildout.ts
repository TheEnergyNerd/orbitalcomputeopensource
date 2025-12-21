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
    waccEffective?: number; // Effective WACC (rises with backlog)
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
  
  // DIAGNOSTICS ONLY: Calculate queue pressure and scarcity index for charts/debug
  // These are NOT used for pricing - pricing is based on wait-time only
  const EPS = 1e-9;
  const buildableGW = Math.max(buildableGWByYear, EPS);
  const queuePressure = 1 + backlogGW / buildableGW;
  const scarcityIndex = Math.max(0, demandNewGWByYear / buildableGW - 1);
  
  // Buildout capex: Use base only (no scarcity premium - that's handled by scarcity rent)
  // buildoutCapex_$PerkW = base (engineering cost, not scarcity pricing)
  const buildoutCapex_$PerkW = params.buildoutCapexBase_$PerkW;
  
  // Annualize buildout capex (base engineering cost only)
  // annualizedBuildoutPremium_$PerkWyr = amortize(buildoutCapex_$PerkW, wacc, lifetime)
  const annualizedBuildoutPremium_$PerkWyr = amortizeCapex(
    buildoutCapex_$PerkW,
    params.wacc,
    params.projectLifetimeYears
  );
  
  // Calculate value of time (WACC on capex by default)
  // valueOfTimePerYear = wacc * (hardwareCapexPerPflopYear + siteCapexAmortPerPflopYear + buildoutPremiumPerPflopYear)
  // Convert buildoutPremium from kW-year to PFLOP-year for value of time calculation
  const pflopsPerKW = (1000 * params.gflopsPerWatt * params.capacityFactor) / (params.pue * 1e6);
  const buildoutPremiumPerPflopYear = annualizedBuildoutPremium_$PerkWyr / Math.max(pflopsPerKW, 1e-6);
  const valueOfTimePerYear = params.wacc * (
    params.hardwareCapexPerPflopYear + 
    params.siteCapexAmortPerPflopYear + 
    buildoutPremiumPerPflopYear
  );
  
  // Calculate delay penalty: STRICTLY LINEAR (no queuePressure exponentiation)
  // delayPenalty = WACC * (hardwareCapex + siteCapex + buildoutPremium) * waitYears
  // This is the cost of waiting, separate from scarcity rent (cost to avoid waiting)
  const delayPenalty_$PerYear = timeToPowerYears * valueOfTimePerYear;
  
  // Invariants (diagnostic only - queuePressure/scarcityIndex not used for pricing)
  if (process.env.NODE_ENV === 'development') {
    if (timeToPowerYears > 0.01 && delayPenalty_$PerYear <= 0) {
      throw new Error(
        `[BUILDOUT INVARIANT] Year ${year}: timeToPowerYears=${timeToPowerYears.toFixed(2)} > 0 but ` +
        `delayPenalty=${delayPenalty_$PerYear.toFixed(2)} <= 0. Delay penalty must be > 0 when wait time > 0.`
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
  const pflopsPerKW = Math.max((1000 * gflopsPerWatt * capacityFactor) / (pue * 1e6), 1e-6); // Prevent division by zero
  
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
      waccEffective: params.wacc, // Store effective WACC used in calculation
    },
  };
}


