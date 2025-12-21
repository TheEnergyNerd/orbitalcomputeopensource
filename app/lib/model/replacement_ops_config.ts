/**
 * Unified Replacement/Ops Assumptions Configuration
 * 
 * Single config object for replacement + ops that works for both ground and orbital.
 * Threaded through both cost builders with sensitivity testing.
 */

export interface ReplacementOpsConfig {
  // Replacement assumptions
  annualFailureRate: number;        // 0..1: fraction of units failing per year
  spareRatio: number;                // >=1: spare units carried (e.g., 1.2 = 20% spares)
  repairTurnaroundDays: number;      // Days to repair a failed unit (0 = no repair, replace only)
  onOrbitServiceRate: number;       // 0..1: fraction of failures that can be serviced on-orbit (orbital only)
  refurbishmentCostPct: number;      // 0..1: fraction of unit cost for refurbishment vs full replacement
  
  // Ops assumptions
  opsFtePerGw: number;               // Full-time equivalents per GW of capacity
  opsCostPerFte: number;             // Annual cost per FTE ($)
  insurancePct: number;              // 0..1: insurance cost as fraction of capex
  
  // Downtime modeling
  downtimePenaltyModel: 'none' | 'linear' | 'convex'; // How to model downtime cost
  downtimeCostPerHourPerGw?: number; // Cost per hour of downtime per GW (if modeled)
}

export interface ReplacementOpsOutputs {
  sparesCostPerPflopYear: number;      // Amortized spares capex
  replacementCapexPerPflopYear: number; // Annual replacement capex
  downtimeCostPerPflopYear: number;     // Downtime penalty (if modeled)
  opsCostPerPflopYear: number;          // Operations cost
  totalReplacementOpsPerPflopYear: number; // Sum of all replacement/ops costs
}

export interface ReplacementOpsSensitivity {
  parameter: string;
  baseValue: number;
  perturbedValue: number;
  baseCost: number;
  perturbedCost: number;
  ratioObserved: number;
  ratioExpected: number;
  linearResponse: boolean; // true if ratioObserved ≈ ratioExpected
}

/**
 * Default replacement/ops configs (low/med/high presets)
 */
export const REPLACEMENT_OPS_PRESETS = {
  low: {
    annualFailureRate: 0.01,      // 1% per year
    spareRatio: 1.1,              // 10% spares
    repairTurnaroundDays: 7,      // 1 week repair
    onOrbitServiceRate: 0.3,      // 30% on-orbit serviceable
    refurbishmentCostPct: 0.5,   // 50% of replacement cost
    opsFtePerGw: 0.5,             // 0.5 FTE per GW
    opsCostPerFte: 150_000,       // $150k per FTE
    insurancePct: 0.02,           // 2% of capex
    downtimePenaltyModel: 'linear' as const,
    downtimeCostPerHourPerGw: 10_000, // $10k/hour/GW
  },
  med: {
    annualFailureRate: 0.03,      // 3% per year
    spareRatio: 1.2,              // 20% spares
    repairTurnaroundDays: 14,     // 2 weeks repair
    onOrbitServiceRate: 0.15,     // 15% on-orbit serviceable
    refurbishmentCostPct: 0.7,    // 70% of replacement cost
    opsFtePerGw: 1.0,             // 1 FTE per GW
    opsCostPerFte: 200_000,       // $200k per FTE
    insurancePct: 0.05,           // 5% of capex
    downtimePenaltyModel: 'linear' as const,
    downtimeCostPerHourPerGw: 50_000, // $50k/hour/GW
  },
  high: {
    annualFailureRate: 0.05,      // 5% per year
    spareRatio: 1.5,              // 50% spares
    repairTurnaroundDays: 30,     // 1 month repair
    onOrbitServiceRate: 0.05,     // 5% on-orbit serviceable
    refurbishmentCostPct: 0.9,    // 90% of replacement cost
    opsFtePerGw: 2.0,             // 2 FTE per GW
    opsCostPerFte: 250_000,       // $250k per FTE
    insurancePct: 0.10,           // 10% of capex
    downtimePenaltyModel: 'convex' as const,
    downtimeCostPerHourPerGw: 100_000, // $100k/hour/GW
  },
} as const;

/**
 * Validate replacement/ops config
 */
export function validateReplacementOpsConfig(config: ReplacementOpsConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.annualFailureRate < 0 || config.annualFailureRate > 1) {
    errors.push(`annualFailureRate must be in [0, 1], got ${config.annualFailureRate}`);
  }
  
  if (config.spareRatio < 1) {
    errors.push(`spareRatio must be >= 1, got ${config.spareRatio}`);
  }
  
  if (config.repairTurnaroundDays < 0) {
    errors.push(`repairTurnaroundDays must be >= 0, got ${config.repairTurnaroundDays}`);
  }
  
  if (config.onOrbitServiceRate < 0 || config.onOrbitServiceRate > 1) {
    errors.push(`onOrbitServiceRate must be in [0, 1], got ${config.onOrbitServiceRate}`);
  }
  
  if (config.refurbishmentCostPct < 0 || config.refurbishmentCostPct > 1) {
    errors.push(`refurbishmentCostPct must be in [0, 1], got ${config.refurbishmentCostPct}`);
  }
  
  if (config.opsFtePerGw < 0) {
    errors.push(`opsFtePerGw must be >= 0, got ${config.opsFtePerGw}`);
  }
  
  if (config.opsCostPerFte < 0) {
    errors.push(`opsCostPerFte must be >= 0, got ${config.opsCostPerFte}`);
  }
  
  if (config.insurancePct < 0 || config.insurancePct > 1) {
    errors.push(`insurancePct must be in [0, 1], got ${config.insurancePct}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Compute replacement/ops cost for orbital
 */
export function computeOrbitalReplacementOps(
  config: ReplacementOpsConfig,
  params: {
    totalFabCost: number;
    totalMassKg: number;
    launchCostPerKg: number;
    lifetimeYears: number;
    effectivePflops: number;
    effectiveGw: number;
  }
): ReplacementOpsOutputs {
  const validation = validateReplacementOpsConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid replacement/ops config: ${validation.errors.join(', ')}`);
  }
  
  // Calculate replacement rate (accounting for repairability)
  const repairableFraction = config.repairTurnaroundDays > 0 ? config.onOrbitServiceRate : 0;
  const replacementRate = config.annualFailureRate * (1 - repairableFraction);
  
  // Spares cost (amortized)
  const sparesCapex = params.totalFabCost * (config.spareRatio - 1);
  const sparesCostPerPflopYear = (sparesCapex / params.lifetimeYears) / params.effectivePflops;
  
  // Replacement capex (including launch)
  const replacementMassKg = params.totalMassKg * (replacementRate / config.annualFailureRate); // Pro-rated mass
  const replacementLaunchCost = replacementMassKg * replacementRate * params.launchCostPerKg;
  const replacementFabCost = params.totalFabCost * replacementRate * (1 - config.refurbishmentCostPct);
  const replacementCapexPerPflopYear = (replacementLaunchCost + replacementFabCost) / params.effectivePflops;
  
  // Downtime cost (if modeled)
  let downtimeCostPerPflopYear = 0;
  if (config.downtimePenaltyModel !== 'none' && config.downtimeCostPerHourPerGw) {
    const downtimeHoursPerYear = config.annualFailureRate * params.lifetimeYears * 24 * 30; // Rough estimate
    const downtimeCost = downtimeHoursPerYear * config.downtimeCostPerHourPerGw * params.effectiveGw;
    downtimeCostPerPflopYear = downtimeCost / params.effectivePflops;
    
    if (config.downtimePenaltyModel === 'convex') {
      // Convex penalty: downtime cost scales with square of downtime hours
      downtimeCostPerPflopYear *= (downtimeHoursPerYear / 8760); // Scale by utilization
    }
  }
  
  // Ops cost
  const opsCost = params.effectiveGw * config.opsFtePerGw * config.opsCostPerFte;
  const opsCostPerPflopYear = opsCost / params.effectivePflops;
  
  // Insurance cost
  const insuranceCost = params.totalFabCost * config.insurancePct;
  const insuranceCostPerPflopYear = (insuranceCost / params.lifetimeYears) / params.effectivePflops;
  
  const totalReplacementOpsPerPflopYear = 
    sparesCostPerPflopYear + 
    replacementCapexPerPflopYear + 
    downtimeCostPerPflopYear + 
    opsCostPerPflopYear +
    insuranceCostPerPflopYear;
  
  // Invariants
  if (sparesCostPerPflopYear < 0 || replacementCapexPerPflopYear < 0 || 
      downtimeCostPerPflopYear < 0 || opsCostPerPflopYear < 0 || 
      totalReplacementOpsPerPflopYear < 0) {
    throw new Error(`Negative replacement/ops cost detected: spares=${sparesCostPerPflopYear}, replacement=${replacementCapexPerPflopYear}, downtime=${downtimeCostPerPflopYear}, ops=${opsCostPerPflopYear}`);
  }
  
  return {
    sparesCostPerPflopYear,
    replacementCapexPerPflopYear,
    downtimeCostPerPflopYear,
    opsCostPerPflopYear,
    totalReplacementOpsPerPflopYear,
  };
}

/**
 * Compute replacement/ops cost for ground
 */
export function computeGroundReplacementOps(
  config: ReplacementOpsConfig,
  params: {
    hardwareCapexPerPflopYear: number;
    effectiveGw: number;
    effectivePflops: number;
  }
): ReplacementOpsOutputs {
  const validation = validateReplacementOpsConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid replacement/ops config: ${validation.errors.join(', ')}`);
  }
  
  // Ground replacement is simpler (no launch cost)
  const replacementRate = config.annualFailureRate * (1 - (config.repairTurnaroundDays > 0 ? 0.5 : 0)); // 50% repairable if repair possible
  
  // Spares cost
  const hardwareCapexTotal = params.hardwareCapexPerPflopYear * params.effectivePflops * 20; // Assume 20-year lifetime
  const sparesCapex = hardwareCapexTotal * (config.spareRatio - 1);
  const sparesCostPerPflopYear = (sparesCapex / 20) / params.effectivePflops;
  
  // Replacement capex
  const replacementCapexPerPflopYear = params.hardwareCapexPerPflopYear * replacementRate * (1 - config.refurbishmentCostPct);
  
  // Downtime cost (if modeled)
  let downtimeCostPerPflopYear = 0;
  if (config.downtimePenaltyModel !== 'none' && config.downtimeCostPerHourPerGw) {
    const downtimeHoursPerYear = config.annualFailureRate * 8760; // Hours per year
    const downtimeCost = downtimeHoursPerYear * config.downtimeCostPerHourPerGw * params.effectiveGw;
    downtimeCostPerPflopYear = downtimeCost / params.effectivePflops;
  }
  
  // Ops cost
  const opsCost = params.effectiveGw * config.opsFtePerGw * config.opsCostPerFte;
  const opsCostPerPflopYear = opsCost / params.effectivePflops;
  
  // Insurance cost
  const insuranceCost = hardwareCapexTotal * config.insurancePct;
  const insuranceCostPerPflopYear = (insuranceCost / 20) / params.effectivePflops;
  
  const totalReplacementOpsPerPflopYear = 
    sparesCostPerPflopYear + 
    replacementCapexPerPflopYear + 
    downtimeCostPerPflopYear + 
    opsCostPerPflopYear +
    insuranceCostPerPflopYear;
  
  // Invariants
  if (sparesCostPerPflopYear < 0 || replacementCapexPerPflopYear < 0 || 
      downtimeCostPerPflopYear < 0 || opsCostPerPflopYear < 0 || 
      totalReplacementOpsPerPflopYear < 0) {
    throw new Error(`Negative replacement/ops cost detected: spares=${sparesCostPerPflopYear}, replacement=${replacementCapexPerPflopYear}, downtime=${downtimeCostPerPflopYear}, ops=${opsCostPerPflopYear}`);
  }
  
  return {
    sparesCostPerPflopYear,
    replacementCapexPerPflopYear,
    downtimeCostPerPflopYear,
    opsCostPerPflopYear,
    totalReplacementOpsPerPflopYear,
  };
}

/**
 * Sensitivity test: finite difference for annualFailureRate
 */
export function testReplacementOpsSensitivity(
  config: ReplacementOpsConfig,
  computeFn: (config: ReplacementOpsConfig, params: any) => ReplacementOpsOutputs,
  params: any,
  testParameter: 'annualFailureRate' | 'spareRatio' = 'annualFailureRate'
): ReplacementOpsSensitivity | null {
  if (process.env.NODE_ENV !== 'development') {
    return null; // Only run in dev mode
  }
  
  const baseValue = config[testParameter];
  const perturbedValue = testParameter === 'annualFailureRate' 
    ? baseValue * 1.01  // +1% relative
    : baseValue + 0.01; // +0.01 absolute
  
  const baseConfig = { ...config };
  const perturbedConfig = { ...config, [testParameter]: perturbedValue };
  
  const baseResult = computeFn(baseConfig, params);
  const perturbedResult = computeFn(perturbedConfig, params);
  
  const baseCost = baseResult.totalReplacementOpsPerPflopYear;
  const perturbedCost = perturbedResult.totalReplacementOpsPerPflopYear;
  
  if (baseCost <= 0) {
    return null; // Can't test sensitivity if base cost is zero
  }
  
  const ratioObserved = perturbedCost / baseCost;
  const ratioExpected = testParameter === 'annualFailureRate'
    ? 1.01  // +1% relative change
    : (baseValue + 0.01) / baseValue; // Relative change for spareRatio
  
  // Check if response is approximately linear (within 10% tolerance)
  const linearResponse = Math.abs(ratioObserved - ratioExpected) / ratioExpected < 0.10;
  
  return {
    parameter: testParameter,
    baseValue,
    perturbedValue,
    baseCost,
    perturbedCost,
    ratioObserved,
    ratioExpected,
    linearResponse,
  };
}

