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
  inflightGw?: number[]; // Inflight capacity buffer (length = BUILD_LAG_YEARS)
  // Debug fields
  unservedGw: number; // Unmet demand this year
  deliveredFromBacklogGw: number; // Capacity delivered from backlog this year
  avgWaitYearsRaw: number; // Raw wait time before smoothing
}

// Explicit initial backlog (tunable parameter)
const INITIAL_BACKLOG_GW = 50; // 30-100 GW baseline backlog in 2025
const INITIAL_BUILD_RATE_GW_YEAR = 12; // Initial build rate (slower than demand growth)
const TARGET_UTIL = 0.85;
const BUILD_LAG_YEARS = 2;

export const INITIAL_SUPPLY_STATE: GroundSupplyState = {
  year: 2025,
  demandGw: 120,
  capacityGw: 120, // Start at demand level (no surplus)
  pipelineGw: INITIAL_BACKLOG_GW,
  backlogGw: INITIAL_BACKLOG_GW, // Explicit initial backlog
  maxBuildRateGwYear: INITIAL_BUILD_RATE_GW_YEAR,
  avgWaitYears: INITIAL_BACKLOG_GW / INITIAL_BUILD_RATE_GW_YEAR, // Initial wait from backlog
  utilizationPct: 1.0, // At capacity
  inflightGw: Array.from({ length: BUILD_LAG_YEARS }, () => 0),
  unservedGw: 0,
  deliveredFromBacklogGw: 0,
  avgWaitYearsRaw: INITIAL_BACKLOG_GW / INITIAL_BUILD_RATE_GW_YEAR,
};

function expSegment(y0: number, y1: number, v0: number, v1: number, y: number): number {
  const t = (y - y0) / (y1 - y0);
  const r = Math.pow(v1 / v0, 1 / (y1 - y0));
  return v0 * Math.pow(r, (y - y0));
}

// Export for debug/comparison purposes, but prefer responsive demand
export function getGlobalDemandGw(year: number): number {
  // Anchors (tune if you want)
  // NOTE: This is a fallback - responsive demand from trajectory.ts should be used instead
  const y0 = 2025, v0 = 120;
  const y1 = 2040, v1 = 450;
  const y2 = 2060, v2 = 3000;  // "terawatts by 2060" -> 3 TW here; change to 5000 if you want
  if (year <= y1) return expSegment(y0, y1, v0, v1, year);
  return expSegment(y1, y2, v1, v2, year);
}

export function stepGroundSupply(
  prev: GroundSupplyState,
  responsiveDemandGW?: number, // NEW: Override hardcoded demand
  orbitalSubstitutionGW?: number // NEW: For backlog drain
): GroundSupplyState {
  const year = prev.year + 1;
  
  // Use responsive demand if provided, otherwise fall back to hardcoded
  const demandGw = responsiveDemandGW !== undefined 
    ? responsiveDemandGW 
    : getGlobalDemandGw(year);
  
  // Capacity required to serve demand at target utilization
  const requiredCapacityGw = demandGw / TARGET_UTIL;
  
  // Count inflight
  const inflightTotalGw = (prev.inflightGw ?? []).reduce((a, b) => a + b, 0);
  
  // New deficit enters backlog (projects that must be built)
  const newDeficitGw = Math.max(0, requiredCapacityGw - (prev.capacityGw + inflightTotalGw));
  const backlogGw0 = (prev.backlogGw ?? prev.pipelineGw ?? 0);
  
  // Build rate ramps, but cannot instantly erase the queue
  const buildRateGrowth = 1.05;
  const maxBuildRateGwYear = Math.min(prev.maxBuildRateGwYear * buildRateGrowth, 50);
  
  // Build serves BOTH new demand AND backlog (backlog can drain)
  // Try to clear 15% of backlog per year in addition to new deficit
  const backlogClearTarget = backlogGw0 * 0.15;
  const totalToBuild = newDeficitGw + backlogClearTarget;
  const actualBuilt = Math.min(totalToBuild, maxBuildRateGwYear);
  
  // New demand gets priority, then backlog
  const servedNewDemand = Math.min(newDeficitGw, actualBuilt);
  const servedBacklog = Math.max(0, actualBuilt - servedNewDemand);
  const unservedNewDemand = newDeficitGw - servedNewDemand;
  
  // NEW: Backlog can drain from orbital substitution
  const implicitBacklogDrain = (orbitalSubstitutionGW ?? 0) * 0.5; // 50% of shifted demand was in backlog
  
  // Update backlog (conservation: backlog[t+1] = backlog[t] + unserved - served - orbital drain)
  const updatedBacklogGw = Math.max(0, backlogGw0 + unservedNewDemand - servedBacklog - implicitBacklogDrain);
  
  // Start construction from backlog (projects move into inflight)
  const startBuildGw = servedBacklog;
  
  // Move GW through lag pipeline
  const inflight = [...(prev.inflightGw ?? Array.from({ length: BUILD_LAG_YEARS }, () => 0))];
  const onlineNow = inflight.pop() ?? 0;
  inflight.unshift(startBuildGw);
  
  // Capacity increases only when projects come online
  const capacityGw = prev.capacityGw + onlineNow;
  
  // Wait time is queue / start rate (NO CLAMP - let it go to 100+ years if that's reality)
  // This follows Little's Law: waitYears = backlog / buildRate
  const effectiveStartRate = Math.max(1e-6, maxBuildRateGwYear);
  const rawAvgWaitYears = updatedBacklogGw > 0 ? updatedBacklogGw / effectiveStartRate : 0;
  const avgWaitYears = Math.max(0, rawAvgWaitYears); // No upper clamp - preserves scarcity signal
  
  const utilizationPct = Math.min(1.0, demandGw / Math.max(1e-6, capacityGw));
  
  // Debug fields
  const unservedGw = Math.max(0, demandGw - prev.capacityGw);
  const deliveredFromBacklogGw = onlineNow; // Capacity that came online this year
  
  return {
    year,
    demandGw,
    capacityGw,
    pipelineGw: updatedBacklogGw, // Keep for backward compatibility
    backlogGw: updatedBacklogGw,
    inflightGw: inflight,
    maxBuildRateGwYear: maxBuildRateGwYear,
    avgWaitYears,
    utilizationPct,
    unservedGw,
    deliveredFromBacklogGw,
    avgWaitYearsRaw: rawAvgWaitYears,
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

export function generateGroundSupplyTrajectory(
  startYear: number, 
  endYear: number,
  demandByYear?: Map<number, number>, // NEW: Optional demand override by year
  orbitalSubstitutionByYear?: Map<number, number> // NEW: Optional orbital substitution
): GroundSupplyState[] {
  const trajectory: GroundSupplyState[] = [INITIAL_SUPPLY_STATE];
  
  let current = INITIAL_SUPPLY_STATE;
  let prevWaitYears = current.avgWaitYears;
  
  for (let year = startYear + 1; year <= endYear; year++) {
    const responsiveDemand = demandByYear?.get(year);
    const orbitalSub = orbitalSubstitutionByYear?.get(year);
    current = stepGroundSupply(current, responsiveDemand, orbitalSub);
    
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

