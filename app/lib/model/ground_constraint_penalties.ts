/**
 * Ground Constraint Penalties Model
 * 
 * Calculates WACC-based penalties and multipliers from backlog/wait time:
 * - timeToEnergizePenaltyPerPflopYear: WACC carry + lost margin
 * - siteMultiplier: land + interconnect scarcity
 * - pueMultiplier: cooling/water stress
 */

import { GroundSupplyState } from './ground_queue_model';

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
}

/**
 * Calculate ground constraint penalties from supply state
 * 
 * @param state Current ground supply state
 * @param flopsPerWattGround GFLOPS/W for ground compute
 * @param pueGround PUE for ground datacenters
 * @param capacityFactorGround Capacity factor for ground
 * @returns Penalties and multipliers
 */
export function calculateGroundConstraintPenalties(
  state: GroundSupplyState,
  flopsPerWattGround: number,
  pueGround: number,
  capacityFactorGround: number
): GroundConstraintPenalties {
  const backlogGw = state.backlogGw || state.pipelineGw; // Use explicit backlog
  const avgWaitYears = state.avgWaitYears;
  const maxBuildRateGwYear = state.maxBuildRateGwYear;
  const utilizationPct = state.utilizationPct;
  
  // Convert GW to MW
  const backlogMw = backlogGw * 1000;
  
  // Constants
  const WACC = 0.10; // 10% weighted average cost of capital
  const MARGIN_PER_MW_YEAR = 2_000_000; // $2M/MW-year lost margin when delayed
  const CAPEX_PER_MW = 3_000_000; // $3M/MW capex at risk
  const BASE_SITE_COST_PER_MW_YEAR = 150_000; // $150k/MW-year base site cost
  const BASE_PUE = 1.3; // Baseline PUE
  
  // 1. Time-to-Energize Penalty: WACC carry + lost margin
  // When avgWaitYears > 0, there's capital tied up and lost revenue
  let capexAtRiskPerMW = 0;
  let carryCostPerMW = 0;
  let lostMarginPerMW = 0;
  let timeToEnergizePenaltyPerPflopYear = 0;
  
  // CRITICAL: These must be nonzero when avgWaitYears > 0
  if (avgWaitYears > 0.01) { // Use small threshold to avoid floating point issues
    // Capex at risk: capital tied up waiting
    capexAtRiskPerMW = CAPEX_PER_MW;
    
    // WACC carry cost: cost of capital while waiting
    // PATCH D: Use compound interest: ((1+WACC)^avgWaitYears - 1)
    const carryMultiplier = Math.pow(1 + WACC, avgWaitYears) - 1;
    carryCostPerMW = CAPEX_PER_MW * carryMultiplier;
    
    // Lost margin: revenue opportunity cost
    // Lost margin = marginPerMWYear * waitYears
    lostMarginPerMW = MARGIN_PER_MW_YEAR * avgWaitYears;
    
    // Total penalty per MW-year
    const totalPenaltyPerMWYear = carryCostPerMW + lostMarginPerMW;
    
    // Convert to per-PFLOP-year
    // 1 MW = 1e6 W
    // PFLOPs per MW = (1e6 W * flopsPerWattGround * capacityFactorGround) / (pueGround * 1e6)
    const pflopsPerMW = (flopsPerWattGround * capacityFactorGround) / pueGround;
    timeToEnergizePenaltyPerPflopYear = totalPenaltyPerMWYear / pflopsPerMW;
    
    // Validation: ensure nonzero when wait time exists
    if (timeToEnergizePenaltyPerPflopYear <= 0 || carryCostPerMW <= 0 || lostMarginPerMW <= 0) {
      throw new Error(`Penalties must be > 0 when avgWaitYears=${avgWaitYears} > 0. Got: penalty=${timeToEnergizePenaltyPerPflopYear}, carry=${carryCostPerMW}, margin=${lostMarginPerMW}`);
    }
  }
  
  // 2. Site Multiplier: land + interconnect scarcity
  // Grows with backlog and utilization
  const landScarcityFactor = 1 + 0.5 * Math.min(1, backlogGw / 100); // Up to 1.5x at 100 GW backlog
  const interconnectScarcityFactor = 1 + 0.3 * Math.min(1, utilizationPct / 0.85); // Up to 1.3x at 85% util
  const siteMultiplier = landScarcityFactor * interconnectScarcityFactor;
  
  // 3. PUE Multiplier: cooling/water stress
  // Higher utilization and backlog increase cooling/water stress
  const coolingStressFactor = 1 + 0.2 * Math.min(1, utilizationPct / 0.85); // Up to 1.2x
  const waterStressFactor = 1 + 0.15 * Math.min(1, backlogGw / 100); // Up to 1.15x
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
  };
}

