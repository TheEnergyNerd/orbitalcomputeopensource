/**
 * Demand-Driven Ground Constraint Model
 * 
 * Replaces time-based constraint with queue-based supply/demand model.
 * Models real-world capacity constraints, build rates, and wait times.
 */

export interface GroundSupplyState {
  year: number;
  demandGw: number;
  capacityGw: number;
  pipelineGw: number; // Legacy name, same as backlogGw
  backlogGw: number; // Explicit backlog state (GW waiting to be built)
  maxBuildRateGwYear: number;
  avgWaitYears: number;
  utilizationPct: number;
}

export const INITIAL_SUPPLY_STATE: GroundSupplyState = {
  year: 2025,
  demandGw: 120,
  capacityGw: 150,
  pipelineGw: 30,
  backlogGw: 30, // Initial backlog (GW waiting to be built)
  maxBuildRateGwYear: 15,
  avgWaitYears: 2,
  utilizationPct: 0.80,
};

function getGlobalDemandGw(year: number): number {
  const BASE_DEMAND_GW = 120;
  const GROWTH_RATE = 0.12;
  const yearsFromBase = year - 2025;
  return BASE_DEMAND_GW * Math.pow(1 + GROWTH_RATE, yearsFromBase);
}

export function stepGroundSupply(prev: GroundSupplyState): GroundSupplyState {
  const year = prev.year + 1;
  const demandGw = getGlobalDemandGw(year);
  
  const newDemand = demandGw - prev.demandGw;
  
  const buildRateGrowth = 1.05;
  const maxBuildRateGwYear = Math.min(
    prev.maxBuildRateGwYear * buildRateGrowth,
    50
  );
  
  // Use backlogGw (explicit state) instead of pipelineGw
  const backlogGw = prev.backlogGw || prev.pipelineGw; // Fallback for legacy
  
  const backlogPressure = backlogGw / 100;
  const effectiveBuildRate = maxBuildRateGwYear * (1 + 0.2 * Math.tanh(backlogPressure));
  
  const targetBuild = newDemand + backlogGw * 0.15;
  const actualBuild = Math.min(targetBuild, effectiveBuildRate);
  
  const capacityGw = prev.capacityGw + actualBuild;
  
  // Update backlog: new demand enters queue, build clears queue
  const newToQueue = Math.max(0, newDemand - actualBuild);
  const clearedFromQueue = Math.max(0, actualBuild - newDemand);
  const updatedBacklogGw = Math.max(0, backlogGw + newToQueue - clearedFromQueue);
  
  // Calculate avgWaitYears = backlogGw / maxBuildRateGwYear (with caps)
  const MAX_WAIT_YEARS = 10; // Cap at 10 years
  const MIN_WAIT_YEARS = 0;
  const rawAvgWaitYears = effectiveBuildRate > 0 ? updatedBacklogGw / effectiveBuildRate : MAX_WAIT_YEARS;
  const avgWaitYears = Math.max(MIN_WAIT_YEARS, Math.min(MAX_WAIT_YEARS, rawAvgWaitYears));
  
  const utilizationPct = Math.min(1.0, demandGw / capacityGw);
  
  return {
    year,
    demandGw,
    capacityGw,
    pipelineGw: updatedBacklogGw, // Keep for backward compatibility
    backlogGw: updatedBacklogGw, // Explicit backlog state
    maxBuildRateGwYear: effectiveBuildRate,
    avgWaitYears,
    utilizationPct,
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
  for (let year = startYear + 1; year <= endYear; year++) {
    current = stepGroundSupply(current);
    trajectory.push(current);
  }
  
  return trajectory;
}

