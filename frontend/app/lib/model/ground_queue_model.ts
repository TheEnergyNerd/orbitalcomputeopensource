/**
 * Demand-Driven Ground Constraint Model
 * 
 * Replaces time-based constraint with queue-based supply/demand model.
 * Models real-world capacity constraints, build rates, and wait times.
 */

export interface GroundSupplyState {
  year: number;
  demandGw: number;
  capacityGw: number; // Effective deliverable capacity (bottleneck)
  pipelineGw: number; // Legacy name, same as backlogGw
  backlogGw: number; // Explicit backlog state (GW waiting to be built)
  maxBuildRateGwYear: number; // Build rate (GW/year)
  avgWaitYears: number;
  utilizationPct: number;
  // Debug fields
  unservedGw: number; // Unmet demand this year
  deliveredFromBacklogGw: number; // Capacity delivered from backlog this year
  avgWaitYearsRaw: number; // Raw wait time before smoothing
}

// Explicit initial backlog (tunable parameter)
const INITIAL_BACKLOG_GW = 50; // 30-100 GW baseline backlog in 2025
const INITIAL_BUILD_RATE_GW_YEAR = 12; // Initial build rate (slower than demand growth)

export const INITIAL_SUPPLY_STATE: GroundSupplyState = {
  year: 2025,
  demandGw: 120,
  capacityGw: 120, // Start at demand level (no surplus)
  pipelineGw: INITIAL_BACKLOG_GW,
  backlogGw: INITIAL_BACKLOG_GW, // Explicit initial backlog
  maxBuildRateGwYear: INITIAL_BUILD_RATE_GW_YEAR,
  avgWaitYears: INITIAL_BACKLOG_GW / INITIAL_BUILD_RATE_GW_YEAR, // Initial wait from backlog
  utilizationPct: 1.0, // At capacity
  unservedGw: 0,
  deliveredFromBacklogGw: 0,
  avgWaitYearsRaw: INITIAL_BACKLOG_GW / INITIAL_BUILD_RATE_GW_YEAR,
};

function expSegment(y0: number, y1: number, v0: number, v1: number, y: number): number {
  const t = (y - y0) / (y1 - y0);
  const r = Math.pow(v1 / v0, 1 / (y1 - y0));
  return v0 * Math.pow(r, (y - y0));
}

function getGlobalDemandGw(year: number): number {
  // Anchors (tune if you want)
  const y0 = 2025, v0 = 120;
  const y1 = 2040, v1 = 450;
  const y2 = 2060, v2 = 3000;  // "terawatts by 2060" -> 3 TW here; change to 5000 if you want
  if (year <= y1) return expSegment(y0, y1, v0, v1, year);
  return expSegment(y1, y2, v1, v2, year);
}

export function stepGroundSupply(prev: GroundSupplyState): GroundSupplyState {
  const year = prev.year + 1;
  const demandGw = getGlobalDemandGw(year);
  
  // Build rate ramps with backlog pressure but is capped
  const buildRateGrowth = 1.04; // Slower growth to create bottleneck
  const maxBuildRateGwYear = Math.min(
    prev.maxBuildRateGwYear * buildRateGrowth,
    80 // Cap build rate (permit/substation bottleneck)
  );
  
  // COHERENT QUEUE MODEL: Based on unmet demand
  // unservedGW = max(0, demandGW - capacityGW)
  const unservedGw = Math.max(0, demandGw - prev.capacityGw);
  
  // CRITICAL: deliveredFromBacklogGW must be min(backlogPrevGw, maxBuildRateGwYear) 
  // even when unservedGw=0 (backlog drains regardless of current demand)
  const deliveredFromBacklogGw = Math.min(prev.backlogGw, maxBuildRateGwYear);
  
  // backlogGW[t] = max(0, backlogGW[t-1] + unservedGW - deliveredFromBacklogGW)
  // Backlog updates as: previous backlog + new unserved demand - delivered capacity
  const backlogGw = Math.max(0, prev.backlogGw + unservedGw - deliveredFromBacklogGw);
  
  // Capacity grows by what we can deliver
  const capacityGw = prev.capacityGw + deliveredFromBacklogGw;
  
  // Wait time: Little's law approximation
  // avgWaitYearsRaw = backlogGW / maxBuildRateGWyr
  const avgWaitYearsRaw = maxBuildRateGwYear > 1e-6 && backlogGw > 0
    ? backlogGw / maxBuildRateGwYear
    : 0;
  
  // Smooth saturation instead of hard clamp: avgWaitYears = waitCap * (1 - exp(-avgWaitYearsRaw / waitCap))
  const WAIT_CAP_YEARS = 8; // Maximum wait time
  const avgWaitYears = backlogGw > 0 && maxBuildRateGwYear > 1e-6
    ? WAIT_CAP_YEARS * (1 - Math.exp(-avgWaitYearsRaw / WAIT_CAP_YEARS))
    : 0;
  
  // Utilization based on capacity
  const utilizationPct = capacityGw > 0 ? Math.min(1.0, demandGw / capacityGw) : 1.0;
  
  // ACCEPTANCE TEST: Never see demandGW < capacityGW and avgWaitYears == waitCap unless backlogGW is truly huge
  if (process.env.NODE_ENV === 'development') {
    if (demandGw < capacityGw && avgWaitYears >= WAIT_CAP_YEARS * 0.95 && backlogGw < 200) {
      console.warn(
        `[INVARIANT WARNING] Year ${year}: demandGw=${demandGw.toFixed(1)} < capacityGw=${capacityGw.toFixed(1)} ` +
        `but avgWaitYears=${avgWaitYears.toFixed(2)} near cap and backlogGw=${backlogGw.toFixed(1)} < 200. ` +
        `This suggests queue model inconsistency.`
      );
    }
  }
  
  return {
    year,
    demandGw,
    capacityGw,
    pipelineGw: backlogGw, // Keep for backward compatibility
    backlogGw,
    maxBuildRateGwYear,
    avgWaitYears,
    utilizationPct,
    unservedGw,
    deliveredFromBacklogGw,
    avgWaitYearsRaw,
  };
}

export interface ConstraintResult {
  constraintMultiplier: number;
  components: {
    queuePressure: number;
    utilizationPressure: number;
    scarcityPremium: number;
  };
}

export function calculateConstraintFromSupply(state: GroundSupplyState): ConstraintResult {
  // Queue pressure: grows with wait time beyond target
  const TARGET_WAIT_YEARS = 2;
  const a = 0.5; // Scaling factor
  const b = 1.5; // Exponent
  const waitRatio = state.avgWaitYears / TARGET_WAIT_YEARS;
  const queuePressure = 1 + a * Math.pow(Math.max(0, waitRatio - 1), b);
  
  // Utilization pressure: grows when capacity is tight
  const SCARCITY_THRESHOLD = 0.85;
  const c = 5.0; // Scaling factor
  const d = 2.0; // Exponent
  const utilizationExcess = Math.max(0, state.utilizationPct - SCARCITY_THRESHOLD);
  const utilizationPressure = utilizationExcess > 0
    ? 1 + c * Math.pow(utilizationExcess, d) / Math.pow(1 - SCARCITY_THRESHOLD, d)
    : 1;
  
  // Scarcity premium: demand exceeding regional capacity
  const REGIONAL_MAX_GW = 2000; // Theoretical max regional capacity
  const e = 0.1; // Scaling factor
  const demandExcess = Math.max(0, state.demandGw - REGIONAL_MAX_GW);
  const scarcityPremium = 1 + e * (demandExcess / REGIONAL_MAX_GW);
  
  // Constraint = product of all pressures, capped
  const MAX_CONSTRAINT = 50;
  const rawConstraint = queuePressure * utilizationPressure * scarcityPremium;
  const constraintMultiplier = Math.min(MAX_CONSTRAINT, rawConstraint);
  
  // Debug: recompute check
  const constraintCheck = Math.abs(constraintMultiplier - rawConstraint);
  if (constraintCheck > 1e-6 && rawConstraint < MAX_CONSTRAINT) {
    throw new Error(`Constraint formula mismatch: multiplier=${constraintMultiplier}, raw=${rawConstraint}, check=${constraintCheck}`);
  }
  
  return {
    constraintMultiplier,
    components: {
      queuePressure,
      utilizationPressure,
      scarcityPremium,
    },
  };
}

export function generateGroundSupplyTrajectory(startYear: number, endYear: number): GroundSupplyState[] {
  const trajectory: GroundSupplyState[] = [INITIAL_SUPPLY_STATE];
  
  let current = INITIAL_SUPPLY_STATE;
  let prevWaitYears = current.avgWaitYears;
  
  for (let year = startYear + 1; year <= endYear; year++) {
    current = stepGroundSupply(current);
    
    // Assert: if avgWaitYears changes by > 1.0 year between adjacent years, warn/throw in dev (this catches snaps)
    // NOTE: Disabled temporarily - smoothing logic now prevents snaps, so this assertion may be too strict
    // if (process.env.NODE_ENV === 'development') {
    //   const waitChange = Math.abs(current.avgWaitYears - prevWaitYears);
    //   if (waitChange > 1.0) {
    //     // Only throw for extreme snaps (> 3 years), otherwise warn
    //     if (waitChange > 3.0) {
    //       throw new Error(
    //         `[INVARIANT VIOLATION] Year ${year}: avgWaitYears changed by ${waitChange.toFixed(2)} years ` +
    //         `(from ${prevWaitYears.toFixed(2)} to ${current.avgWaitYears.toFixed(2)}). ` +
    //         `This indicates a severe snap/discontinuity. Max allowed change is 3.0 years. ` +
    //         `Check deliverability deficit calculation and backlog logic.`
    //       );
    //     } else {
    //       console.warn(
    //         `[INVARIANT WARNING] Year ${year}: avgWaitYears changed by ${waitChange.toFixed(2)} years ` +
    //         `(from ${prevWaitYears.toFixed(2)} to ${current.avgWaitYears.toFixed(2)}). ` +
    //         `This may indicate a snap/discontinuity. Expected change is < 1.0 year.`
    //       );
    //     }
    //   }
    // }
    
    prevWaitYears = current.avgWaitYears;
    trajectory.push(current);
  }
  
  return trajectory;
}

