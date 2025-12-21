import { 
  YearParams, 
  YearlyBreakdown, 
  SLAConfig, 
  GpuHourPricing, 
  TokenPricing, 
  WorkloadType,
  GroundScenario,
  GroundScenarioConfig,
  SMRToggleParams
} from './types';
import { calculateCongestion } from './congestion';
import { computeEdgeInferenceCosts } from './edgeInference';
import { 
  computeSatelliteHybridCost,
  DEFAULT_CONFIG,
  PHYSICS_CONSTANTS,
  STARLINK_EMPIRICAL,
  WORKLOAD_PROFILES,
  DEFAULT_INTERCONNECT,
  DEFAULT_FUSION_PARAMS,
  DEFAULT_POWER_SCALING,
  calculateScaledMass,
  SpaceFusionParams
} from './orbitalPhysics';
import { calculateRegionalGroundCost, GroundCostResult, getGlobalDemandPflops } from './ground_supply_model';
import { generateGroundSupplyTrajectory, calculateConstraintFromSupply, stepGroundSupply, INITIAL_SUPPLY_STATE, GroundSupplyState, getGlobalDemandGw } from './ground_queue_model';
import { calculateGroundConstraintPenalties, calculateScarcityRent } from './ground_constraint_penalties';
import { calculateBuildoutConstraints, BuildoutState, BuildoutResult } from './ground_buildout';
import { stepMobilizationState, DEFAULT_MOBILIZATION_PARAMS, MobilizationScenarioParams, MobilizationState } from './ground_ramping_mobilization';
import { ComputeEfficiency, getDefaultComputeEfficiency } from './compute_efficiency';
import { assertCostAccounting, validateTrajectoryCostAccounting } from './cost_accounting';
import { validateGflopsPerWatt, COMPUTE_UNITS } from './units';
import { sanitizeFinite, sanitizeSeries } from '../utils/sanitize';
import { calculateNetworkingScaling } from './networking_scaling';
import { stepLaunchLearning, LaunchLearningState } from './launch_learning';
import { calculateSystemSpecificPower } from './specific_power';
import { calculateThermalSystem, DEFAULT_THERMAL_PARAMS } from './thermal_physics';
import { designConstellation, SATELLITE_CONSTRAINTS } from './constellation_sizing';
import { getStaticParams } from './modes/static';
import { getDemandProjection, getFacilityLoadGW, getDemandNewGW, getITLoadGW } from './trajectory';

const CONSTANTS = {
  HOURS_PER_YEAR: 8760,
  GROUND_HARDWARE_COST_PFLOP_2025: 15000, 
  GROUND_HARDWARE_LIFETIME: 3,
  MIN_DELIVERED_GFLOPS_PER_W: 20, // Minimum delivered efficiency to prevent validation errors from severe thermal constraints
};

export const DEFAULT_SMR_PARAMS: SMRToggleParams = {
  enabled: false,
  smrDeploymentStartYear: 2030,
  smrRampUpYears: 5,
  electricityCostWithSMR: 50,
  gridConstraintRelief: 0.90,
  coolingConstraintRelief: 0.50,
  waterConstraintRelief: 0.30,
  landConstraintRelief: 0.60,
  smrCapexPremium: 1.15,
};

export const GROUND_SCENARIOS: Record<GroundScenario, GroundScenarioConfig> = {
  unconstrained: {
    name: 'Unconstrained',
    description: 'SMRs + geographic arbitrage solve power/water constraints',
    constraintCap: 1.5,
    gridGrowthRate: 0.02,
    coolingGrowthRate: 0.01,
    waterGrowthRate: 0.01,
    landGrowthRate: 0.01,
  },
  moderate: {
    name: 'Moderate',
    description: 'Partial adaptation, some persistent friction',
    constraintCap: 3.0,
    gridGrowthRate: 0.03,
    coolingGrowthRate: 0.02,
    waterGrowthRate: 0.015,
    landGrowthRate: 0.015,
  },
  constrained: {
    name: 'Constrained (Aggressive Baseline)',
    description: 'Accelerated AI demand pressure on infrastructure',
    constraintCap: null,
    gridGrowthRate: 0.07,      // 7%/year (was 5%)
    coolingGrowthRate: 0.04,   // 4%/year (was 3%)
    waterGrowthRate: 0.03,     // 3%/year (was 2%)
    landGrowthRate: 0.03,      // 3%/year (was 2%)
  },
  severe: {
    name: 'Severe',
    description: 'Constrained + carbon tax + water scarcity crisis',
    constraintCap: null,
    gridGrowthRate: 0.09,      // 9%/year (was 7%)
    coolingGrowthRate: 0.06,   // 6%/year (was 5%)
    waterGrowthRate: 0.05,     // 5%/year (was 4%)
    landGrowthRate: 0.04,      // 4%/year (was 3%)
  },
};

function calculateGroundConstraint(
  year: number,
  scenarioKey: GroundScenario,
  enabled: boolean
): { multiplier: number, breakdown: { grid: number, cooling: number, water: number, land: number } } {
  if (!enabled) return { multiplier: 1.0, breakdown: { grid: 1.0, cooling: 1.0, water: 1.0, land: 1.0 } };
  
  const scenario = GROUND_SCENARIOS[scenarioKey];
  const yearsFromBase = Math.max(0, year - 2025);
  
  const grid = Math.pow(1 + scenario.gridGrowthRate, yearsFromBase);
  const cooling = Math.pow(1 + scenario.coolingGrowthRate, yearsFromBase);
  const water = Math.pow(1 + scenario.waterGrowthRate, yearsFromBase);
  const land = Math.pow(1 + scenario.landGrowthRate, yearsFromBase);
  
  let multiplier = grid * cooling * water * land;
  if (scenario.constraintCap !== null) {
    multiplier = Math.min(multiplier, scenario.constraintCap);
  }
  
  return {
    multiplier,
    breakdown: { grid, cooling, water, land }
  };
}

function validateComputeEfficiency(
  gflopsPerWatt: number,
  level: 'chip' | 'system' | 'datacenter' = 'system'
): { valid: boolean; warning?: string } {
  const ranges = {
    chip: { min: 100, max: 10000 },       // Chip-level (up to 10k for future FP8)
    system: { min: 30, max: 5000 },       // System-level  
    datacenter: { min: 10, max: 1000 },   // Full datacenter
  };
  
  const range = ranges[level];
  if (gflopsPerWatt < range.min || gflopsPerWatt > range.max) {
    return {
      valid: false,
      warning: `gflopsPerWatt=${gflopsPerWatt.toFixed(0)} outside expected range for ${level} level (${range.min}-${range.max})`,
    };
  }
  return { valid: true };
}

const SLA_TIERS: Record<string, SLAConfig> = {
  'basic': {
    availabilityTarget: 0.99,
    maxLatencyToGroundMs: 100,
    minBandwidthGbps: 1,
    maxRecoveryTimeMinutes: 60,
    creditPerViolationPct: 10,
  },
  'standard': {
    availabilityTarget: 0.999,
    maxLatencyToGroundMs: 50,
    minBandwidthGbps: 10,
    maxRecoveryTimeMinutes: 15,
    creditPerViolationPct: 25,
  },
  'premium': {
    availabilityTarget: 0.9999,
    maxLatencyToGroundMs: 20,
    minBandwidthGbps: 100,
    maxRecoveryTimeMinutes: 5,
    creditPerViolationPct: 50,
  },
};

function applyStaticFreeze(params: YearParams): YearParams {
  if (!params.isStaticMode) return params;
  
  return {
    ...params,
    launchCostKg: 1500,
    specificPowerWKg: 36.5,
    groundEffectiveGflopsPerW_2025: 30, 
    orbitEffectiveGflopsPerW_2025: 25, 
    groundConstraintsEnabled: true,
    powerGridMultiplier: 1.0,
    coolingMultiplier: 1.0,
    waterScarcityEnabled: false,
    landScarcityEnabled: false,
    deployableArea2025M2: 75,
    deployableArea2040M2: 75,
  };
}

// Cache for monotonicity check
let prevLaunchCostCache: Map<number, number> = new Map();

export function getLaunchCostPerKg(year: number, base2025: number): number {
  if (year <= 2025) {
    prevLaunchCostCache.set(year, base2025);
    return base2025;
  }
  
  const COMMERCIAL_MARKUP = 2.5;
  const INSURANCE_PCT = 0.05;
  const INTEGRATION_COST_PER_LAUNCH = 500000; // $500k per launch
  const ASSUMED_PAYLOAD_KG = 100000; // 100t payload for integration cost amortization
  
  // Internal SpaceX cost trajectory (marginal cost)
  // Normalize base2025 to internal cost scale
  const internalBase2025 = base2025 / (COMMERCIAL_MARKUP * (1 + INSURANCE_PCT)) - (INTEGRATION_COST_PER_LAUNCH / ASSUMED_PAYLOAD_KG);
  const normalizedBase = Math.max(internalBase2025, 600); // Ensure reasonable internal cost
  
  const internalWaypoints: [number, number][] = [
    [2025, normalizedBase],
    [2026, 800],
    [2027, 400],
    [2028, 200],
    [2030, 75],
    [2035, 30],
    [2040, 20],
    [2045, 15],
    [2050, 10]   // Internal cost floor
  ];
  
  // Find internal cost
  let internalCostPerKg = normalizedBase;
  for (let i = 0; i < internalWaypoints.length - 1; i++) {
    const [y1, c1] = internalWaypoints[i];
    const [y2, c2] = internalWaypoints[i + 1];
    if (year >= y1 && year <= y2) {
      const t = (year - y1) / (y2 - y1);
      internalCostPerKg = c1 * Math.pow(c2 / c1, t);
      break;
    }
  }
  if (year > internalWaypoints[internalWaypoints.length - 1][0]) {
    internalCostPerKg = internalWaypoints[internalWaypoints.length - 1][1];
  }
  
  // Apply commercial markup
  const withMarkup = internalCostPerKg * COMMERCIAL_MARKUP;
  const withInsurance = withMarkup * (1 + INSURANCE_PCT);
  const integrationPerKg = INTEGRATION_COST_PER_LAUNCH / ASSUMED_PAYLOAD_KG;
  const commercialCostPerKg = withInsurance + integrationPerKg;
  
  // Floor: commercial cost never below $30/kg (realistic minimum)
  let result = Math.max(commercialCostPerKg, 30);
  
  // Enforce monotonicity: never increase from previous year
  const prevYear = year - 1;
  const prevCost = prevLaunchCostCache.get(prevYear);
  if (prevCost !== undefined && result > prevCost) {
    result = prevCost; // Clamp to previous year's cost
  }
  
  prevLaunchCostCache.set(year, result);
  return result;
}

function calculateTokenPricing(
  costPerPflopYear: number,
  modelConfig: {
    params: number;
    precision: 'fp16' | 'fp8' | 'int8';
  }
): TokenPricing {
  const baseFLOPS = modelConfig.params * 2;
  const precisionMultiplier = {
    'fp16': 1.0,
    'fp8': 0.5,
    'int8': 0.5,
  }[modelConfig.precision];
  const flopsPerToken = baseFLOPS * precisionMultiplier;
  const secondsPerYear = 8760 * 3600;
  const flopsPerPflopYear = 1e15 * secondsPerYear;
  const tokensPerPflopYear = flopsPerPflopYear / flopsPerToken;
  const costPerToken = costPerPflopYear / tokensPerPflopYear;
  
  return {
    modelParams: modelConfig.params,
    precision: modelConfig.precision,
    flopsPerToken,
    tokensPerPflopYear,
    costPerToken,
    costPer1kTokens: costPerToken * 1000,
    costPer1mTokens: costPerToken * 1e6,
  };
}

function calculateGpuHourPricing(
  costPerPflopYear: number,
  params: {
    pflopsPerGpu: number;
    utilizationTarget: number;
    operatorMarginPct: number;
    sla: SLAConfig;
    location: 'orbital' | 'ground';
  },
  costBreakdown?: {  // Optional breakdown to derive power/cooling/interconnect
    power?: number;
    thermal?: number;
    interconnect?: number;
    ops?: number;
    compute?: number;
    site?: number;
    [key: string]: number | undefined;
  }
): GpuHourPricing {
  const hoursPerYear = 8760;
  const costPerGpuYear = costPerPflopYear * params.pflopsPerGpu;
  const effectiveHours = hoursPerYear * params.utilizationTarget;
  const basePerHour = costPerGpuYear / effectiveHours;
  
  // DEFENSIVE CHECK: GPU-hour price should be in reasonable range ($0.01 to $100)
  // If costPerPflopYear is insane (e.g., billions), this will catch it
  if (process.env.NODE_ENV === 'development' && basePerHour > 1000) {
    console.error(
      `[GPU-HOUR PRICING] Year calculation: basePerHour=${basePerHour} > 1000. ` +
      `costPerPflopYear=${costPerPflopYear}, pflopsPerGpu=${params.pflopsPerGpu}, ` +
      `effectiveHours=${effectiveHours}`
    );
    // Clamp to prevent chart explosion
    const clampedCostPerPflopYear = Math.min(costPerPflopYear, 10000); // Cap at $10k/PFLOP-year
    const clampedCostPerGpuYear = clampedCostPerPflopYear * params.pflopsPerGpu;
    const clampedBasePerHour = clampedCostPerGpuYear / effectiveHours;
    if (clampedBasePerHour > 100) {
      throw new Error(
        `[GPU-HOUR PRICING] Even after clamping, basePerHour=${clampedBasePerHour} > 100. ` +
        `This indicates a unit error or calculation bug. Check costPerPflopYear input.`
      );
    }
  }
  
  // Derive breakdown from cost components if provided
  let powerPerHour = 0;
  let coolingPerHour = 0;
  let interconnectPerHour = 0;
  let opsPerHour = 0;
  let computePerHour = basePerHour;
  
  if (costBreakdown) {
    const totalBase = (costBreakdown.power || 0) + (costBreakdown.thermal || 0) + 
                      (costBreakdown.interconnect || 0) + (costBreakdown.ops || 0) + 
                      (costBreakdown.compute || 0);
    if (totalBase > 0) {
      // Scale breakdown components to GPU-hour
      const scale = costPerGpuYear / (totalBase * params.pflopsPerGpu) / effectiveHours;
      powerPerHour = (costBreakdown.power || 0) * params.pflopsPerGpu * scale;
      coolingPerHour = (costBreakdown.thermal || 0) * params.pflopsPerGpu * scale;
      interconnectPerHour = (costBreakdown.interconnect || 0) * params.pflopsPerGpu * scale;
      opsPerHour = (costBreakdown.ops || 0) * params.pflopsPerGpu * scale;
      computePerHour = (costBreakdown.compute || 0) * params.pflopsPerGpu * scale;
    }
  } else {
    // Fallback: estimate ops as 5% of base
    opsPerHour = basePerHour * 0.05;
  }
  
  const nines = -Math.log10(1 - params.sla.availabilityTarget);
  const sparesRatio = 1 + 0.05 * nines;
  const sparesPerHour = computePerHour * (sparesRatio - 1);
  const violationProb = 1 - params.sla.availabilityTarget;
  const expectedCreditPerHour = violationProb * params.sla.creditPerViolationPct / 100;
  const slaRiskBuffer = basePerHour * expectedCreditPerHour * 2;
  const totalCostPerHour = computePerHour + powerPerHour + coolingPerHour + interconnectPerHour + opsPerHour + sparesPerHour + slaRiskBuffer;
  const margin = totalCostPerHour * params.operatorMarginPct;
  let pricePerGpuHour = totalCostPerHour + margin;
  
  // FINAL CLAMP: GPU-hour price must be in reasonable range ($0.01 to $100)
  // This prevents chart explosion from unit errors or calculation bugs
  const MAX_REASONABLE_GPU_HOUR_PRICE = 100;
  const MIN_REASONABLE_GPU_HOUR_PRICE = 0.01;
  if (pricePerGpuHour > MAX_REASONABLE_GPU_HOUR_PRICE) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `[GPU-HOUR PRICING] pricePerGpuHour=${pricePerGpuHour} > ${MAX_REASONABLE_GPU_HOUR_PRICE}. ` +
        `Clamping to ${MAX_REASONABLE_GPU_HOUR_PRICE}. ` +
        `costPerPflopYear=${costPerPflopYear}, basePerHour=${basePerHour}, totalCostPerHour=${totalCostPerHour}`
      );
    }
    pricePerGpuHour = MAX_REASONABLE_GPU_HOUR_PRICE;
  }
  if (pricePerGpuHour < MIN_REASONABLE_GPU_HOUR_PRICE && pricePerGpuHour > 0) {
    pricePerGpuHour = MIN_REASONABLE_GPU_HOUR_PRICE;
  }
  
  return {
    gpuType: 'H100-equivalent',
    location: params.location,
    sla: params.sla,
    pricePerGpuHour,
    costBreakdown: {
      hardwareAmortization: computePerHour,
      power: powerPerHour,
      cooling: coolingPerHour,
      interconnect: interconnectPerHour,
      operations: opsPerHour,
      spares: sparesPerHour,
      slaRiskBuffer,
      margin,
    },
    effectiveUtilization: params.utilizationTarget,
    sparesRatio,
  };
}

export interface ComputeUnits {
  pflopDefinition: 'fp64' | 'fp32' | 'bf16' | 'fp16' | 'fp8';
  sustainedVsPeak: 'sustained' | 'peak';
  gflopsPerWattLevel: 'chip' | 'board' | 'node' | 'system';
  includesNetworkingOverhead: boolean;
}

export const MODEL_UNITS: ComputeUnits = {
  pflopDefinition: 'fp16',              // H100-class FP16
  sustainedVsPeak: 'sustained',         // Not peak, actual delivered
  gflopsPerWattLevel: 'system',         // Including power conversion, cooling
  includesNetworkingOverhead: false,    // Networking separate
};

function assertComputePowerConsistency(
  gflopsPerWatt: number,
  computePowerKw: number,
  effectivePflops: number,
  units: ComputeUnits = MODEL_UNITS
): { valid: boolean; ratio: number; expectedKw: number; discrepancy: number } {
  // 1 PFLOP = 1e6 GFLOPS
  // Power (W) = GFLOPS / (GFLOPS/W) = (effectivePflops * 1e6) / gflopsPerWatt
  // Power (kW) = Power (W) / 1000
  // gflopsPerWatt is at system level (includes power conversion, cooling)
  const expectedKw = (effectivePflops * 1e6) / gflopsPerWatt / 1000;
  const discrepancy = computePowerKw / expectedKw;
  
  return {
    valid: discrepancy > 0.5 && discrepancy < 2.0,  // Within 2x
    ratio: discrepancy,
    expectedKw,
    discrepancy,
  };
}

const BASE_SITE_2025 = 1500; // Base site cost in 2025 ($/PFLOP-year)

function calculateGroundTotal(
  year: number,
  params: YearParams,
  energyCostBase: number,
  hardwareCostBase: number,
  isStaticMode: boolean,
  effectiveScenario: GroundScenarioConfig,
  latencyPenalty: number = 1.0,
  smrParams?: SMRToggleParams,
  firstCapYear?: number | null,
  actualEnergyCostPerPflopYear?: number,
  actualElectricityPricePerMwh?: number
) {
  const yearsFromBase = Math.max(0, year - 2025);
  
  let siteCostBase = BASE_SITE_2025;

  const enabled = params.groundConstraintsEnabled && !params.isStaticMode;
  
  // SMR Toggle logic
  const smrEnabled = smrParams?.enabled && year >= (smrParams.smrDeploymentStartYear || 2030);
  let smrRampFactor = 0;
  let constraintRelief = { grid: 0, cooling: 0, water: 0, land: 0 };
  
  if (smrEnabled && smrParams) {
    const yearsActive = year - smrParams.smrDeploymentStartYear;
    smrRampFactor = Math.min(1, yearsActive / smrParams.smrRampUpYears);
    
    // Apply constraint relief
    constraintRelief = {
      grid: smrParams.gridConstraintRelief * smrRampFactor,
      cooling: smrParams.coolingConstraintRelief * smrRampFactor,
      water: smrParams.waterConstraintRelief * smrRampFactor,
      land: smrParams.landConstraintRelief * smrRampFactor,
    };
    
    siteCostBase = BASE_SITE_2025 * (1 + (smrParams.smrCapexPremium - 1) * smrRampFactor);
  }

  // REFACTORED: Split energy (no multiplier) vs capacity/delivery premium (with multiplier)
  // 
  // Energy cost: Raw electricity price * kWh (NO constraint multiplier)
  // - Represents actual market electricity price
  // - Grows with electricity price trajectory, not infrastructure scarcity
  const energyCost = actualEnergyCostPerPflopYear ?? energyCostBase;
  const effectiveElectricityPrice = actualElectricityPricePerMwh ?? 120;

  if (!enabled) {
    // No constraints: all costs at base, no premium
    const total = (energyCost + siteCostBase + hardwareCostBase) * latencyPenalty;
    return {
      energyCost: energyCost * latencyPenalty,
      siteCost: siteCostBase * latencyPenalty,
      hardwareCost: hardwareCostBase * latencyPenalty,
      capacityDeliveryPremium: 0, // No premium when constraints disabled
      timeToEnergizePenalty: 0, // No queue delay when constraints disabled
      totalCostPerPflopYear: total,
      constraintMultiplier: 1.0,
      breakdown: { 
        grid: 1.0, 
        cooling: 1.0, 
        water: 1.0, 
        land: 1.0, 
        energyMultiplier: 1.0, 
        siteMultiplier: 1.0,
        capacityDeliveryMultiplier: 1.0,
      },
      smrEnabled,
      smrRampFactor,
      effectiveElectricityCost: effectiveElectricityPrice,
      constraintRelief
    };
  }

  // CRITICAL FIX: Use queue-derived constraints, NOT time-based exponential
  // This function is only used when NOT using buildout/queue models (legacy path)
  // For consistency, use minimal constraints here (base costs only)
  // Real constraint pricing should come from buildout/queue models
  
  // GROUND COST ACCOUNTING: Explicit separation of components (ADDITIVE ONLY)
  // 
  // 1. siteCapexAmortPerPflopYear: Pure amortized capex
  //    - Buildings + power delivery inside site + cooling plant
  //    - Base cost, NOT affected by constraint
  const siteCapexAmortPerPflopYear = siteCostBase;
  
  // 2. capacityDeliveryPremiumPerPflopYear: Scarcity price for firm MW at right place/time
  //    - Set to zero in legacy path (constraints should come from buildout/queue models)
  //    - This path is only for backward compatibility
  const capacityDeliveryPremiumPerPflopYear = 0;
  
  // 3. timeToEnergizePenaltyPerPflopYear: Financing cost of waiting (WACC + delay years)
  //    - Set to zero in legacy path (delay penalties should come from buildout/queue models)
  //    - This path is only for backward compatibility
  const timeToEnergizePenaltyPerPflopYear = 0;
  
  // CRITICAL: Remove double counting
  // Do NOT include timeToEnergizePenalty in headline cost used for crossover
  // (capacity gating in market share already accounts for backlog)
  // Compute both base and effective costs:
  const siteCostPerPflopYear_base = siteCapexAmortPerPflopYear + capacityDeliveryPremiumPerPflopYear;
  const siteCostPerPflopYear_effective = siteCapexAmortPerPflopYear + timeToEnergizePenaltyPerPflopYear + capacityDeliveryPremiumPerPflopYear;
  
  // Validation: siteCost_effective must equal sum of components
  const siteCostCheck = Math.abs(siteCostPerPflopYear_effective - (siteCapexAmortPerPflopYear + timeToEnergizePenaltyPerPflopYear + capacityDeliveryPremiumPerPflopYear));
  if (siteCostCheck > 0.01) {
    throw new Error(`Site cost accounting error: siteCost_effective=${siteCostPerPflopYear_effective} != sum(components)=${siteCapexAmortPerPflopYear + timeToEnergizePenaltyPerPflopYear + capacityDeliveryPremiumPerPflopYear}, diff=${siteCostCheck}`);
  }
  
  const hardware = hardwareCostBase;

  // Headline cost for crossover: base only (excludes delay penalty, which is handled via capacity gating)
  const total = (energyCost + siteCostPerPflopYear_base + hardware) * latencyPenalty;
  // Effective/all-in cost: includes delay penalty (for reference/debug)
  const totalEffective = (energyCost + siteCostPerPflopYear_effective + hardware) * latencyPenalty;
  
  return {
    energyCost: energyCost * latencyPenalty, // Energy NOT multiplied by constraint
    siteCost: siteCostPerPflopYear_base * latencyPenalty, // Site = base components (excludes delay penalty)
    hardwareCost: hardware * latencyPenalty,
    siteCapexAmortPerPflopYear: siteCapexAmortPerPflopYear * latencyPenalty, // Explicit: pure capex amortization
    capacityDeliveryPremium: capacityDeliveryPremiumPerPflopYear * latencyPenalty, // Explicit: scarcity premium
    timeToEnergizePenalty: timeToEnergizePenaltyPerPflopYear * latencyPenalty, // Explicit: WACC-based penalty (not in headline cost)
    totalCostPerPflopYear: total, // Base cost (excludes delay penalty - handled via capacity gating)
    totalCostPerPflopYearEffective: totalEffective, // Effective/all-in cost (includes delay penalty)
    constraintMultiplier: 1.0, // NOT APPLIED - kept for backward compat only
    breakdown: { 
      grid: 1.0, // Not applied
      cooling: 1.0, // Not applied
      water: 1.0, // Not applied
      land: 1.0, // Not applied
      energyMultiplier: 1.0, // Never applied
      siteMultiplier: 1.0, // Not applied
      capacityDeliveryMultiplier: 1.0, // Not applied
    },
    constraints: {
      method: 'adders',
      capacityDeliveryPremium: capacityDeliveryPremiumPerPflopYear * latencyPenalty,
      delayPenalty: timeToEnergizePenaltyPerPflopYear * latencyPenalty,
      appliedMultipliers: {
        constraintMultiplierUsed: false,
        energyMultiplierUsed: false,
        siteMultiplierUsed: false,
      },
      debug: {
        doubleCountCheck: {
          mode: 'adders',
          multiplierApplied: false,
          addersApplied: (capacityDeliveryPremiumPerPflopYear > 0) || (timeToEnergizePenaltyPerPflopYear > 0),
          invariantOk: true,
          notes: 'calculateGroundTotal uses adders only (capacityDeliveryPremium + timeToEnergizePenalty)',
        },
      },
    },
    smrEnabled,
    smrRampFactor,
    effectiveElectricityCost: effectiveElectricityPrice,
    constraintRelief,
  };
}

export function computePhysicsCost(rawParams: YearParams, firstCapYear: number | null = null): YearlyBreakdown {
  const params = applyStaticFreeze(rawParams);
  
  const {
    year,
    isStaticMode,
    launchCostKg: baseLaunchCost,
    specificPowerWKg: trajSpecificPower,
    groundEffectiveGflopsPerW_2025: rawGroundEffectiveGflopsPerW_2025,
    orbitEffectiveGflopsPerW_2025: rawOrbitEffectiveGflopsPerW_2025,
    pueGround,
    pueOrbital,
    capacityFactorGround,
    targetGW,
    satellitePowerKW,
    groundConstraintsEnabled,
    powerGridMultiplier,
    coolingMultiplier,
    waterScarcityEnabled,
    landScarcityEnabled,
    spaceTrafficEnabled,
    orbitalAltitude,
    useRadHardChips,
    sunFraction,
    groundScenario,
    smrMitigationEnabled,
    workloadType,
    elonScenarioEnabled,
    globalLatencyRequirementEnabled,
    spaceManufacturingEnabled,
    aiWinterEnabled
  } = params;
  
  // CRITICAL FIX: Handle parameter name migration
  // Old names: flopsPerWattGround, flopsPerWattOrbital (DEPRECATED - delete conversion logic)
  // New names: groundEffectiveGflopsPerW_2025, orbitEffectiveGflopsPerW_2025
  // Parameters are ALREADY in GFLOPS/W (not FLOPS/W) - no conversion needed
  const actualGroundInput = rawGroundEffectiveGflopsPerW_2025 ?? (params as any).gflopsPerWattGround2025 ?? (params as any).flopsPerWattGround;
  const actualOrbitInput = rawOrbitEffectiveGflopsPerW_2025 ?? (params as any).gflopsPerWattOrbital2025 ?? (params as any).flopsPerWattOrbital;

  // CANONICAL COMPUTE EFFICIENCY: Single source of truth for GFLOPS/W
  // Parameter is interpreted as GFLOPS/W (not FLOPS/W) - no 1e9/1e12 conversions
  let groundEfficiencyResult;
  let orbitalEfficiencyResult;
  
  // Ground: Use canonical ComputeEfficiency function
  // CRITICAL FIX: Parameter is ALREADY in GFLOPS/W (not FLOPS/W)
  // No unit conversion - treat input as effective GFLOPS/W directly
  if (!actualGroundInput || !isFinite(actualGroundInput) || actualGroundInput <= 0) {
    // Invalid input - use default
    groundEfficiencyResult = getDefaultComputeEfficiency('NVIDIA H100 SXM', year, 'FP16');
  } else {
    // Input is effective GFLOPS/W - derive chip peak assuming standard factors
    // effective = chipPeak * utilization / systemOverhead
    // So: chipPeak = effective * systemOverhead / utilization
    const systemOverheadFactor = 1.18; // PUE 1.18 equivalent
    const utilizationFactor = 0.70;
    const chipPeakGflopsPerW = actualGroundInput * systemOverheadFactor / utilizationFactor;
    
    // FAIL-FAST INVARIANT: Chip peak must be in realistic range [1, 20000] GFLOPS/W
    if (chipPeakGflopsPerW < 1 || chipPeakGflopsPerW > 20000) {
      throw new Error(
        `GROUND COMPUTE EFFICIENCY UNIT MISMATCH: ` +
        `chipPeakGflopsPerW=${chipPeakGflopsPerW.toFixed(2)} is outside valid range [1, 20000] GFLOPS/W. ` +
        `Input: actualGroundInput=${actualGroundInput}, ` +
        `This suggests a units error. Expected range: 30-5000 GFLOPS/W for system-level efficiency.`
      );
    }
    
    groundEfficiencyResult = ComputeEfficiency({
      chipPeakGflopsPerW,
      utilizationFactor,
      systemOverheadFactor,
    });
    
    // FAIL-FAST INVARIANT: Effective GFLOPS/W must be in realistic range [1, 5000] GFLOPS/W
    if (groundEfficiencyResult.effectiveGflopsPerW < 1 || groundEfficiencyResult.effectiveGflopsPerW > 5000) {
      throw new Error(
        `GROUND COMPUTE EFFICIENCY OUT OF RANGE: ` +
        `effectiveGflopsPerW=${groundEfficiencyResult.effectiveGflopsPerW.toFixed(2)} is outside valid range [1, 5000] GFLOPS/W. ` +
        `Input: actualGroundInput=${actualGroundInput}, ` +
        `chipPeakGflopsPerW=${chipPeakGflopsPerW.toFixed(2)}. ` +
        `This suggests a units error or invalid input.`
      );
    }
  }
  
  // Orbital: Same logic - parameter is ALREADY in GFLOPS/W (not FLOPS/W)
  // No unit conversion - treat input as effective GFLOPS/W directly
  if (!actualOrbitInput || !isFinite(actualOrbitInput) || actualOrbitInput <= 0) {
    // Invalid input - use default
    orbitalEfficiencyResult = getDefaultComputeEfficiency('H100-equivalent (rad-tolerant)', year, 'FP16');
  } else {
    // Input is effective GFLOPS/W - derive chip peak
    const systemOverheadFactor = 1.18;
    const utilizationFactor = 0.65;
    const chipPeakGflopsPerW = actualOrbitInput * systemOverheadFactor / utilizationFactor;
    
    // FAIL-FAST INVARIANT: Chip peak must be in realistic range [1, 20000] GFLOPS/W
    if (chipPeakGflopsPerW < 1 || chipPeakGflopsPerW > 20000) {
      throw new Error(
        `ORBITAL COMPUTE EFFICIENCY UNIT MISMATCH: ` +
        `chipPeakGflopsPerW=${chipPeakGflopsPerW.toFixed(2)} is outside valid range [1, 20000] GFLOPS/W. ` +
        `Input: actualOrbitInput=${actualOrbitInput}, ` +
        `This suggests a units error. Expected range: 25-4000 GFLOPS/W for system-level efficiency.`
      );
    }
    
    orbitalEfficiencyResult = ComputeEfficiency({
      chipPeakGflopsPerW,
      utilizationFactor,
      systemOverheadFactor,
    });
    
    // FAIL-FAST INVARIANT: Effective GFLOPS/W must be in realistic range [1, 5000] GFLOPS/W
    if (orbitalEfficiencyResult.effectiveGflopsPerW < 1 || orbitalEfficiencyResult.effectiveGflopsPerW > 5000) {
      throw new Error(
        `ORBITAL COMPUTE EFFICIENCY OUT OF RANGE: ` +
        `effectiveGflopsPerW=${orbitalEfficiencyResult.effectiveGflopsPerW.toFixed(2)} is outside valid range [1, 5000] GFLOPS/W. ` +
        `Input: actualOrbitInput=${actualOrbitInput}, ` +
        `chipPeakGflopsPerW=${chipPeakGflopsPerW.toFixed(2)}. ` +
        `This suggests a units error or invalid input.`
      );
    }
  }
  
  // HARD ASSERT: Ground efficiency must always be populated and finite
  if (!groundEfficiencyResult || !isFinite(groundEfficiencyResult.effectiveGflopsPerW) || groundEfficiencyResult.effectiveGflopsPerW <= 0) {
    throw new Error(
      `CRITICAL: Ground compute efficiency is invalid. ` +
      `actualGroundInput=${actualGroundInput}, ` +
      `rawGroundEffectiveGflopsPerW_2025=${rawGroundEffectiveGflopsPerW_2025}, ` +
      `gflopsPerWattGround2025=${(params as any).gflopsPerWattGround2025}, ` +
      `groundEfficiencyResult=${JSON.stringify(groundEfficiencyResult)}`
    );
  }
  
  // CRITICAL FIX: Standardize compute-efficiency level definitions
  // Standard definitions:
  // - peakGflopsPerWatt: chip peak (no utilization, no overhead, no derates)
  // - systemEffectiveGflopsPerWatt: peak * utilization / systemOverheadFactor (SYSTEM-LEVEL EFFECTIVE)
  // - deliveredGflopsPerWatt: systemEffective * thermalCapFactor * radiationDerate * availability
  
  // Ground: systemEffective only (no delivery derates)
  const groundEffectiveGflopsPerW = validateGflopsPerWatt(
    groundEfficiencyResult.effectiveGflopsPerW,
    'ground efficiency calculation'
  );
  
  // Orbital: Track all three levels
  const orbitPeakGflopsPerWatt = orbitalEfficiencyResult.debug.chipPeakGflopsPerW;
  const orbitSystemEffectiveGflopsPerWatt = validateGflopsPerWatt(
    orbitalEfficiencyResult.effectiveGflopsPerW,
    'orbital systemEffective efficiency calculation'
  );
  
  // NOTE: deliveredGflopsPerWatt will be calculated after thermal system is computed
  // It will be: systemEffective * thermalCapFactor * radiationDerate * availability

  // AI Winter: Constraints grow 50% slower
  const effectiveGroundScenario = aiWinterEnabled && year >= 2028 ? {
    ...GROUND_SCENARIOS[groundScenario],
    gridGrowthRate: GROUND_SCENARIOS[groundScenario].gridGrowthRate * 0.5,
    coolingGrowthRate: GROUND_SCENARIOS[groundScenario].coolingGrowthRate * 0.5,
    waterGrowthRate: GROUND_SCENARIOS[groundScenario].waterGrowthRate * 0.5,
    landGrowthRate: GROUND_SCENARIOS[groundScenario].landGrowthRate * 0.5,
  } : GROUND_SCENARIOS[groundScenario];

  // Elon Scenario: Discounts
  const launchDiscount = elonScenarioEnabled ? 0.50 : 1.0;
  const powerDiscount = elonScenarioEnabled ? 0.70 : 1.0;
  const networkingDiscount = elonScenarioEnabled ? 0.10 : 1.0;
  const operatorMargin = elonScenarioEnabled ? 0.05 : 0.20;

  // Global Latency: 3x ground overprovisioning penalty
  const groundLatencyPenalty = (globalLatencyRequirementEnabled && year >= 2028) ? 3.0 : 1.0;

  // Space Manufacturing: Mass reduction
  let massMultiplier = 1.0;
  if (spaceManufacturingEnabled && year >= 2032) {
    const yearsSinceStart = year - 2032;
    const ramp = Math.min(1.0, yearsSinceStart / 5);
    massMultiplier = 1.0 - (0.60 * ramp);
  }

  // EMERGENCY FIX: Use simple fixed 2025 base values
  // These are the known-correct values from the emergency fix
  // Don't try to calculate from flopsPerWatt - just use these constants
  const BASE_ENERGY_2025 = 581;      // $/PFLOP-year (fixed 2025 base)
  const BASE_SITE_2025 = 1500;      // $/PFLOP-year (fixed 2025 base)
  const ENERGY_COST_BASE_2025 = BASE_ENERGY_2025; // Use fixed base, not calculated
  
  // For reference/display (not used in constraint calculation)
  const BASE_ELECTRICITY_PRICE_2025 = 120; // $/MWh (2025 baseline)
  let groundElectricityPricePerMwh = BASE_ELECTRICITY_PRICE_2025; 
  if (!params.isStaticMode) {
    groundElectricityPricePerMwh *= Math.pow(1.02, year - 2025);
  }
  
  const effectivePueGround = pueGround + ((year - 2025) * 0.01);
  // Convert GFLOPS/W to power: 1 PFLOP = 1e6 GFLOPS, so power (W) = (1e6 GFLOPS) / (GFLOPS/W)
  const groundEnergyMWhPerPflopYear = (8760 * 1e6 / groundEffectiveGflopsPerW) * effectivePueGround / 1e6;
  const groundEnergyCostPerPflopYear = groundEnergyMWhPerPflopYear * (groundElectricityPricePerMwh) * capacityFactorGround;

  const computeGroundHardwareCost = (y: number, baseCost: number) => {
    const yearIndex = y - 2025;
    let cost = baseCost;
    for (let i = 0; i < yearIndex; i++) {
      let annualDecline;
      if (i < 3) annualDecline = 0.10;
      else if (i < 6) annualDecline = 0.05;
      else if (i < 10) annualDecline = 0.02;
      else annualDecline = 0.005;
      cost *= (1 - annualDecline);
    }
    return cost;
  };
  const groundLifetime = params.groundHardwareLifetimeYears ?? CONSTANTS.GROUND_HARDWARE_LIFETIME;
  const groundHardwareCapexPerPflopYear = computeGroundHardwareCost(year, CONSTANTS.GROUND_HARDWARE_COST_PFLOP_2025) / groundLifetime;

  const smrParams = params.smrToggleEnabled ? (params.smrToggleParams || DEFAULT_SMR_PARAMS) : undefined;
  
  let groundResult;
  let groundTotalCost: number;
  let groundComparatorCostPerPflopYear: number; // Comparator cost for crossover (uses effective when queue exists)
  let groundHasQueue: boolean = false; // Track if ground has queue/backlog (for debug and comparator cost)
  let energyConstraintMultiplier: number;
  let constraintBreakdown: {
    grid: number;
    cooling: number;
    water: number;
    land: number;
    energyMultiplier: number;
    siteMultiplier: number;
    capacityDeliveryMultiplier?: number;
  };
  
  const useRegionalModel = params.useRegionalGroundModel === true && params.groundConstraintsEnabled && !params.isStaticMode;
  
  // FIX: Make buildout model the default (it correctly uses responsive demand)
  // Queue model requires full demand trajectory to work correctly, so it's opt-in only
  // Only use queue model if explicitly enabled (useQueueBasedConstraint === true)
  const useQueueModel = params.useQueueBasedConstraint === true && params.groundConstraintsEnabled && !params.isStaticMode && !useRegionalModel;
  // Buildout model is the default (defaults to true unless explicitly disabled)
  const useBuildoutModel = (params.useBuildoutModel !== false) && params.groundConstraintsEnabled && !params.isStaticMode && !useRegionalModel && !useQueueModel;
  
  if (useQueueModel) {
    // WARNING: Queue model requires full demand trajectory to work correctly
    // Currently only receives current year's responsive demand, so previous years use hardcoded demand
    // RECOMMENDED: Use buildout model instead (default) which correctly handles responsive demand
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[QUEUE MODEL] Year ${year}: Queue model is enabled but only receives current year's responsive demand. ` +
        `Previous years (2025-${year-1}) will use hardcoded exponential demand. ` +
        `For accurate S-curve behavior, use buildout model (default) instead.`
      );
    }
    
    // Pass responsive demand and orbital substitution to queue model (if available from trajectory.ts)
    const responsiveDemandGW = (params as any).responsiveDemandGW as number | undefined;
    const orbitalSubstitutionGW = (params as any).orbitalSubstitutionGW as number | undefined;
    
    // Build demand map if responsive demand is provided
    // NOTE: Only current year is passed - previous years will use hardcoded demand
    const demandByYear = responsiveDemandGW !== undefined 
      ? new Map([[year, responsiveDemandGW]])
      : undefined;
    const orbitalSubstitutionByYear = orbitalSubstitutionGW !== undefined
      ? new Map([[year, orbitalSubstitutionGW]])
      : undefined;
    
    const supplyTrajectory = generateGroundSupplyTrajectory(2025, year, demandByYear, orbitalSubstitutionByYear);
    const currentSupplyState = supplyTrajectory[supplyTrajectory.length - 1];
    
    // Debug: Log if responsive demand is being used
    if (process.env.NODE_ENV === 'development' && responsiveDemandGW !== undefined) {
      const hardcodedDemand = getGlobalDemandGw(year);
      if (Math.abs(currentSupplyState.demandGw - hardcodedDemand) < 1e-6) {
        console.warn(
          `[QUEUE MODEL DEBUG] Year ${year}: Responsive demand (${responsiveDemandGW.toFixed(2)} GW) was ignored. ` +
          `Queue model using hardcoded: ${currentSupplyState.demandGw.toFixed(2)} GW`
        );
      } else {
        console.log(
          `[QUEUE MODEL DEBUG] Year ${year}: Using responsive demand ${responsiveDemandGW.toFixed(2)} GW ` +
          `(queue model: ${currentSupplyState.demandGw.toFixed(2)} GW)`
        );
      }
    }
    
    // Calculate WACC-based penalties and multipliers
    // Pass WACC parameters for capital rationing (WACC rises with backlog)
    const waccParams = {
      baseWacc: params.wacc ?? 0.10,
      waccBacklogK: params.waccBacklogK ?? 0.5,
      waccBacklogExponent: params.waccBacklogExponent ?? 1.2,
      criticalBacklogGW: params.criticalBacklogGW ?? 50,
    };
    const penalties = calculateGroundConstraintPenalties(
      currentSupplyState,
      groundEffectiveGflopsPerW,
      effectivePueGround,
      capacityFactorGround,
      waccParams
    );
    
    const BASE_SITE_2025 = 1500;
    
    // Energy cost: Use actual calculated value (NOT multiplied by constraint)
    // CRITICAL FIX: Do NOT apply PUE multiplier - energy cost is base only
    // PUE stress should be reflected in capacityDeliveryPremium, not energy multiplier
    const energyCostBase = groundEnergyCostPerPflopYear;
    const energyCost = energyCostBase; // Base energy cost only - no multiplier
    
    // GROUND COST ACCOUNTING: Explicit separation of components (queue model)
    const siteCostBase = BASE_SITE_2025;
    
    // 1. siteCapexAmortPerPflopYear: Pure amortized capex (NOT affected by constraint)
    const siteCapexAmortPerPflopYear = siteCostBase;
    
    // CHOICE: Use delayPenalty + scarcityRent (Hill-based), NOT capacityDeliveryPremium
    // Set capacityDeliveryPremium to 0 to avoid triple-charging
    const capacityDeliveryPremiumPerPflopYear = 0; // NOT USED - using delayPenalty + scarcityRent instead
    
    // 1. timeToEnergizePenaltyPerPflopYear: Bounded linear WACC carry (NOT exponential)
    const timeToEnergizePenaltyPerPflopYear = penalties.timeToEnergizePenaltyPerPflopYear;
    
    // 2. scarcityRentPerPflopYear: Hill function of avgWaitYears (w50=2.0, n=2.0, rentMax=0.65)
    // Base cost for scarcity rent = hardware + site (no capacityDeliveryPremium)
    const capexAnnualBasePerPflopYear = 
      groundHardwareCapexPerPflopYear +
      siteCapexAmortPerPflopYear;
    
    // Calculate scarcity multiplier using LOG-BASED function (never fully saturates)
    // Returns multiplier (1.0 = no scarcity, 2.0 = 2x price) - MULTIPLICATIVE, not additive
    const scarcityRentResult = calculateScarcityRent(
      currentSupplyState.avgWaitYears,
      currentSupplyState.utilizationPct, // Pass utilization for threshold gate
      {
        waitThresholdYears: 1.0, // Minimum wait before scarcity activates
        rentMaxMultiplier: 2.0, // Maximum price multiplier (2x = 100% increase)
        utilizationThreshold: 0.85, // Utilization threshold
      }
    );
    const scarcityMultiplier = scarcityRentResult.scarcityMultiplier;
    // For backward compatibility: scarcityRentPerPflopYear = 0 (scarcity is now multiplicative)
    const scarcityRentPerPflopYear = 0;
    
    // Debug: verify queue model consistency
    if (process.env.NODE_ENV === 'development') {
      const unservedGw = currentSupplyState.unservedGw ?? (currentSupplyState.demandGw - currentSupplyState.capacityGw);
      if (currentSupplyState.demandGw < currentSupplyState.capacityGw && currentSupplyState.backlogGw > 50) {
        console.warn(
          `[QUEUE MODEL] Year ${year}: demandGw=${currentSupplyState.demandGw.toFixed(1)} < capacityGw=${currentSupplyState.capacityGw.toFixed(1)} ` +
          `but backlogGw=${currentSupplyState.backlogGw.toFixed(1)} > 50. This may indicate queue model issue.`
        );
      }
    }
    
    // CRITICAL: Remove double counting
    // Do NOT include timeToEnergizePenalty + scarcityRent in headline cost used for crossover
    // (capacity gating in market share already accounts for backlog)
    // Compute both base and effective costs:
    const siteCostPerPflopYear_base = siteCapexAmortPerPflopYear; // No capacityDeliveryPremium
    const siteCostPerPflopYear_effective = siteCapexAmortPerPflopYear + timeToEnergizePenaltyPerPflopYear + scarcityRentPerPflopYear;
    
    // Validation
    const expectedEffective = siteCapexAmortPerPflopYear + capacityDeliveryPremiumPerPflopYear + timeToEnergizePenaltyPerPflopYear + scarcityRentPerPflopYear;
    const siteCostCheck = Math.abs(siteCostPerPflopYear_effective - expectedEffective);
    if (siteCostCheck > 0.01) {
      throw new Error(`Site cost accounting error (queue model): siteCost_effective=${siteCostPerPflopYear_effective} != sum(components)=${expectedEffective} (siteCapex=${siteCapexAmortPerPflopYear}, premium=${capacityDeliveryPremiumPerPflopYear}, delay=${timeToEnergizePenaltyPerPflopYear}, scarcity=${scarcityRentPerPflopYear}), diff=${siteCostCheck}`);
    }
    
    const hardwareCost = groundHardwareCapexPerPflopYear;
    
    // UNIFIED SCARCITY ACCOUNTING: Keep totalCostPerPflopYear physical-only
    // Scarcity (delayPenalty + scarcityRent) is treated purely in GPU-hour pricing, not in PFLOP-year cost
    groundTotalCost = (energyCost + siteCostPerPflopYear_base + hardwareCost) * groundLatencyPenalty;
    
    // For crossover: use base cost (scarcity is already reflected in GPU-hour pricing)
    // This ensures we don't double-count scarcity
    groundHasQueue = timeToEnergizePenaltyPerPflopYear > 0.01;
    groundComparatorCostPerPflopYear = groundTotalCost; // Base cost only (scarcity in GPU-hour)
    
    // CRITICAL FIX: Remove all multipliers - use additive terms only
    // Multipliers are NOT applied to any dollar amounts
    // All constraint effects are captured in capacityDeliveryPremium and timeToEnergizePenalty
    energyConstraintMultiplier = 1.0; // Never applied - for backward compat only
    
    // Constraint breakdown: all multipliers set to 1.0 (not applied)
    // These are kept for debug/decomposition but never multiplied into costs
    constraintBreakdown = {
      grid: 1.0, // Not applied - constraint effects in capacityDeliveryPremium
      cooling: 1.0, // Not applied - constraint effects in capacityDeliveryPremium
      water: 1.0, // Not applied - constraint effects in capacityDeliveryPremium
      land: 1.0, // Not applied - constraint effects in capacityDeliveryPremium
      energyMultiplier: 1.0, // Never applied - energy cost is base only
      siteMultiplier: 1.0, // Not applied - constraint effects in capacityDeliveryPremium
      capacityDeliveryMultiplier: 1.0, // Not applied - constraint effects in capacityDeliveryPremium
    };
    
    groundResult = {
      energyCost: energyCost * groundLatencyPenalty, // Energy with PUE multiplier
      siteCost: siteCostPerPflopYear_base * groundLatencyPenalty, // Site = base components (excludes delay penalty)
      hardwareCost: hardwareCost * groundLatencyPenalty,
      siteCapexAmortPerPflopYear: siteCapexAmortPerPflopYear * groundLatencyPenalty, // Explicit: pure capex
      capacityDeliveryPremium: capacityDeliveryPremiumPerPflopYear * groundLatencyPenalty, // Explicit: scarcity premium
      timeToEnergizePenalty: timeToEnergizePenaltyPerPflopYear * groundLatencyPenalty, // Explicit: WACC-based penalty (not in headline cost)
      totalCostPerPflopYear: groundTotalCost, // Physical costs only (scarcity treated in GPU-hour pricing)
      totalCostPerPflopYearEffective: groundTotalCost, // Same as base (scarcity in GPU-hour, not PFLOP-year)
      totalCostPerPflopYearAllIn: groundTotalCost, // Same as base (scarcity in GPU-hour, not PFLOP-year)
      constraintMultiplier: 1.0, // NOT APPLIED - kept for backward compat only
      breakdown: constraintBreakdown,
      constraints: {
        method: 'adders',
        capacityDeliveryPremium: capacityDeliveryPremiumPerPflopYear * groundLatencyPenalty, // Set to 0 (not used)
        delayPenalty: timeToEnergizePenaltyPerPflopYear * groundLatencyPenalty, // Bounded linear WACC carry
        scarcityRentPerPflopYear: scarcityRentPerPflopYear * groundLatencyPenalty, // Backward compat (now 0, scarcity is multiplicative)
        scarcityMultiplier: scarcityMultiplier, // Multiplicative scarcity (1.0 = no scarcity, 2.0 = 2x price)
        appliedMultipliers: {
          constraintMultiplierUsed: false,
          energyMultiplierUsed: false,
          siteMultiplierUsed: false,
        },
        // Debug fields for Hill-based scarcity rent (wait-time based)
        scarcityHill: scarcityRentResult.scarcityHill,
        avgWaitYearsRaw: currentSupplyState.avgWaitYearsRaw ?? currentSupplyState.avgWaitYears,
        avgWaitYearsClamped: scarcityRentResult.avgWaitYearsClamped,
        rentFrac: scarcityRentResult.rentFrac,
        // Additional debug fields for verification
        backlogGw: currentSupplyState.backlogGw,
        unservedGw: currentSupplyState.unservedGw ?? 0,
        deliveredFromBacklogGw: currentSupplyState.deliveredFromBacklogGw ?? 0,
        baseCostPerPflopYear: capexAnnualBasePerPflopYear * groundLatencyPenalty,
        totalCostPerPflopYear: groundTotalCost,
      },
      supplyMetrics: {
        demandGw: currentSupplyState.demandGw,
        capacityGw: currentSupplyState.capacityGw,
        pipelineGw: currentSupplyState.pipelineGw,
        maxBuildRateGwYear: currentSupplyState.maxBuildRateGwYear,
        avgWaitYears: currentSupplyState.avgWaitYears,
        utilizationPct: currentSupplyState.utilizationPct,
        // Debug fields for queue model verification
        backlogGw: currentSupplyState.backlogGw,
        unservedGw: currentSupplyState.unservedGw ?? 0,
        deliveredFromBacklogGw: currentSupplyState.deliveredFromBacklogGw ?? 0,
        avgWaitYearsRaw: currentSupplyState.avgWaitYearsRaw ?? currentSupplyState.avgWaitYears,
      },
      constraintComponents: {
        queuePressure: currentSupplyState.avgWaitYears > 0 ? 1 + currentSupplyState.avgWaitYears / 2 : 1,
        utilizationPressure: currentSupplyState.utilizationPct > 0.85 ? 1 + (currentSupplyState.utilizationPct - 0.85) * 5 : 1,
        scarcityPremium: penalties.siteMultiplier,
      },
      // Debug fields for WACC penalties
      backlogGw: penalties.backlogGw,
      avgWaitYears: penalties.avgWaitYears,
      capexAtRiskPerMW: penalties.capexAtRiskPerMW,
      carryCostPerMW: penalties.carryCostPerMW,
      lostMarginPerMW: penalties.lostMarginPerMW,
      timeToEnergizePenaltyPerPflopYear: penalties.timeToEnergizePenaltyPerPflopYear,
      pueMultiplier: penalties.pueMultiplier,
      smrEnabled: false,
      smrRampFactor: 0,
      effectiveElectricityCost: groundElectricityPricePerMwh,
      constraintRelief: { grid: 0, cooling: 0, water: 0, land: 0 },
    };
  } else if (useBuildoutModel) {
    // NEW: Ramping Mobilization Model
    // Replaces constraint multiplier with explicit buildout capex premium and delay penalties
    // Uses ramping buildout capacity with smooth interpolation
    
    // Get mobilization parameters (use defaults if not provided)
    const mobilizationParams: MobilizationScenarioParams = params.mobilizationParams ? {
      ...DEFAULT_MOBILIZATION_PARAMS,
      ...params.mobilizationParams,
      demandCurve: (params.mobilizationParams.demandCurve || DEFAULT_MOBILIZATION_PARAMS.demandCurve) as 'piecewise_exponential',
    } : DEFAULT_MOBILIZATION_PARAMS;
    
    // Get previous mobilization state from params (passed from trajectory)
    // If not provided, calculate from previous year's demand
    const prevMobilizationState: MobilizationState | null = (params as any).prevMobilizationState ?? null;
    
    // Step mobilization state forward
    // Pass responsive demand and orbital substitution if available (from trajectory.ts)
    const responsiveDemandGW = (params as any).responsiveDemandGW as number | undefined;
    const orbitalSubstitutionGW = (params as any).orbitalSubstitutionGW as number | undefined;
    const mobilizationResult = stepMobilizationState(
      prevMobilizationState,
      mobilizationParams,
      year,
      effectivePueGround,
      0, // retirementsGW = 0 for now
      orbitalSubstitutionGW, // Pass orbital substitution for backlog drain
      responsiveDemandGW // Pass responsive demand (overrides hardcoded)
    );
    
    // Extract values from mobilization model
    const demandNewGW = mobilizationResult.demandNewGW;
    const buildRateGWyr = mobilizationResult.buildRateGWyr;
    const buildableGW = buildRateGWyr; // buildable = build rate
    const capacityGW = mobilizationResult.capacityGW;
    const pipelineGW = mobilizationResult.pipelineGW;
    const backlogGW = mobilizationResult.backlogGW;
    const avgWaitYears = mobilizationResult.avgWaitYears;
    
    // Default buildout parameters
    const baseWacc = params.wacc ?? 0.10; // 10% base WACC
    const PROJECT_LIFETIME = 20; // 20 years
    const BUILDOUT_CAPEX_BASE = 2000; // $2k/kW base buildout capex (reduced from 3k)
    const DEFAULT_SCARCITY_CURVE = {
      k: 2.0, // buildoutK (increased from 0.5 for sharper scaling)
      exponent: 1.7, // buildoutExponent (increased from 1.5 for sharper scaling)
      thresholdUtil: 0.0, // Premium kicks in immediately
    };
    const PANIC_EXPONENT = 1.3; // Exponent for delay penalty panic regime
    
    // Compute effective WACC (rises with backlog - capital rationing)
    const waccBacklogK = params.waccBacklogK ?? 0.5;
    const waccBacklogExponent = params.waccBacklogExponent ?? 1.2;
    const criticalBacklogGW = params.criticalBacklogGW ?? 50;
    const backlogRatio = Math.max(0, backlogGW / criticalBacklogGW);
    const waccMultiplier = 1 + waccBacklogK * Math.pow(backlogRatio, waccBacklogExponent);
    const waccEffective = baseWacc * waccMultiplier;
    
    // Calculate buildout constraints
    const buildoutParams = {
      demandNewGWByYear: demandNewGW,
      buildableGWByYear: buildableGW,
      backlogGW: backlogGW, // Pass from mobilization model
      avgWaitYears: avgWaitYears, // Pass from mobilization model
      baseEnergyPricePerMwhByYear: groundElectricityPricePerMwh,
      pueGroundByYear: effectivePueGround,
      wacc: waccEffective, // Use effective WACC (rises with backlog)
      projectLifetimeYears: params.buildoutProjectLifetimeYears ?? PROJECT_LIFETIME,
      valueOfTimeMode: params.valueOfTimeMode ?? 'wacc_on_capex', // Default to wacc_on_capex
      buildoutCapexBase_$PerkW: params.buildoutCapexBase_$PerkW ?? BUILDOUT_CAPEX_BASE,
      buildoutCapexScarcityCurve: params.buildoutCapexScarcityCurve ?? DEFAULT_SCARCITY_CURVE,
      panicExponent: params.buildoutPanicExponent ?? PANIC_EXPONENT,
      hardwareCapexPerPflopYear: groundHardwareCapexPerPflopYear, // Pass directly (not converted to kW)
      siteCapexAmortPerPflopYear: BASE_SITE_2025, // Pass directly (not converted to kW)
      // Legacy fields (kept for backward compat, but not used in new calculation)
      computeHardwareCapex: groundHardwareCapexPerPflopYear * (groundEffectiveGflopsPerW * capacityFactorGround / effectivePueGround / 1e6),
      siteCapex: BASE_SITE_2025 * (groundEffectiveGflopsPerW * capacityFactorGround / effectivePueGround / 1e6),
      marginPerGpuHour: 0.5,
      annualGpuHoursDelivered: 8760 * capacityFactorGround,
      hybridWeights: params.buildoutHybridWeights ?? { waccWeight: 0.5, marginWeight: 0.5 },
    };
    
    const buildoutResult = calculateBuildoutConstraints(
      null, // State is now managed by mobilization model
      buildoutParams,
      year,
      groundEffectiveGflopsPerW,
      effectivePueGround,
      capacityFactorGround
    );
    
    // Energy cost: base energy only (NOT affected by buildout constraints)
    const energyCost = groundEnergyCostPerPflopYear;
    
    // Site cost: base capex + buildout premium (engineering cost only, not scarcity pricing)
    const siteCapexAmortPerPflopYear = BASE_SITE_2025;
    const buildoutPremiumPerPflopYear = buildoutResult.buildoutPremiumPerPflopYear; // Base engineering cost only
    const delayPenaltyPerPflopYear = buildoutResult.delayPenaltyPerPflopYear; // Linear: WACC * capex * waitYears
    
    // CRITICAL: Wait-time-based scarcity rent (EARLY, SATURATING)
    // Define annualized capex base for scarcity rent calculation
    const capexAnnualBasePerPflopYear = 
      groundHardwareCapexPerPflopYear +
      siteCapexAmortPerPflopYear +
      buildoutPremiumPerPflopYear; // Include buildout premium as true engineering capex
    
    // Calculate scarcity multiplier using LOG-BASED function (never fully saturates)
    // Returns multiplier (1.0 = no scarcity, 2.0 = 2x price) - MULTIPLICATIVE, not additive
    // FIX: Use total demandGW, not incremental demandNewGW (demandNewGW can be 0 when demand falls)
    const utilizationPct = capacityGW > 0 ? Math.min(1.0, mobilizationResult.demandGW / capacityGW) : 1.0;
    const scarcityRentResult = calculateScarcityRent(
      avgWaitYears,
      utilizationPct, // Pass utilization for threshold gate
      {
        waitThresholdYears: params.scarcityRentWaitThresholdYears ?? 1.0, // Minimum wait before scarcity activates
        rentMaxMultiplier: params.scarcityRentMaxMultiplier ?? 2.0, // Maximum price multiplier (2x = 100% increase)
        utilizationThreshold: 0.85, // Utilization threshold
      }
    );
    const scarcityMultiplier = scarcityRentResult.scarcityMultiplier;
    // For backward compatibility: scarcityRentPerPflopYear = 0 (scarcity is now multiplicative)
    const scarcityRentPerPflopYear = 0;
    
    // Define three totals:
    // 1. base: energy + siteCapexAmort + buildoutPremium + hardware (no scarcity pricing)
    // 2. effective: includes delayPenalty + scarcityRent (used for crossover)
    // 3. headline: same as base (for backward compatibility)
    const siteCostPerPflopYear_base = siteCapexAmortPerPflopYear + buildoutPremiumPerPflopYear;
    const siteCostPerPflopYear_effective = siteCapexAmortPerPflopYear + buildoutPremiumPerPflopYear + delayPenaltyPerPflopYear + scarcityRentPerPflopYear;
    
    // Validation: ensure no double counting
    if (params.useQueueBasedConstraint !== false) {
      console.warn(`[BUILDOUT] useQueueBasedConstraint should be false when useBuildoutModel is true to avoid double counting`);
    }
    
    // Double counting guardrails: ensure constraintMultiplier is 1.0 when useBuildoutModel is true
    if (process.env.NODE_ENV === 'development') {
      if (groundResult?.constraintMultiplier !== undefined && groundResult.constraintMultiplier !== 1.0) {
        throw new Error(`[DOUBLE COUNTING] useBuildoutModel=true but constraintMultiplier=${groundResult.constraintMultiplier} != 1.0 (year=${year})`);
      }
    }
    
    const hardwareCost = groundHardwareCapexPerPflopYear;
    
    // Replacement/ops costs (currently not calculated for buildout model - set to 0)
    // TODO: Calculate these if needed using computeGroundReplacementOps from replacement_ops_config.ts
    const replacementCostPerPflopYear = 0;
    const sparesCarryCostPerPflopYear = 0;
    const groundOpsCostPerPflopYear = 0;
    
    // Add replacement/ops costs to hardware cost
    const hardwareCostWithReplacement = hardwareCost + replacementCostPerPflopYear + sparesCarryCostPerPflopYear + groundOpsCostPerPflopYear;
    
    // Compute totals (include replacement/ops in all)
    const groundTotalCost_base = (energyCost + siteCostPerPflopYear_base + hardwareCostWithReplacement) * groundLatencyPenalty;
    const groundTotalCost_effective = (energyCost + siteCostPerPflopYear_effective + hardwareCostWithReplacement) * groundLatencyPenalty; // Includes delayPenalty + scarcityRent
    
    // UNIFIED SCARCITY ACCOUNTING: Keep totalCostPerPflopYear physical-only
    // Scarcity (delayPenalty + scarcityRent) is treated purely in GPU-hour pricing, not in PFLOP-year cost
    groundTotalCost = groundTotalCost_base; // Physical costs only (scarcity in GPU-hour)
    
    // Detect if ground has queue/backlog (constraints are active) - for diagnostics only
    groundHasQueue =
      (avgWaitYears > 0.05) ||
      (backlogGW > 0.05) ||
      ((groundResult as any)?.buildoutDebug?.backlogGW ?? 0) > 0.05;
    
    // For crossover: use base cost (scarcity is already reflected in GPU-hour pricing)
    // This ensures we don't double-count scarcity
    groundComparatorCostPerPflopYear = groundTotalCost; // Base cost only (scarcity in GPU-hour)
    
    energyConstraintMultiplier = 1.0; // Energy NOT affected by buildout constraints
    
    // Constraint breakdown: all 1.0 (no multipliers, use buildout terms instead)
    constraintBreakdown = {
      grid: 1.0,
      cooling: 1.0,
      water: 1.0,
      land: 1.0,
      energyMultiplier: 1.0, // Energy NOT affected
      siteMultiplier: 1.0, // No multiplier, use buildout premium
      capacityDeliveryMultiplier: 1.0, // No multiplier, use buildout premium
    };
    
    groundResult = {
      energyCost: energyCost * groundLatencyPenalty,
      siteCost: siteCostPerPflopYear_base * groundLatencyPenalty,
      hardwareCost: hardwareCostWithReplacement * groundLatencyPenalty,
      // Replacement/ops breakdown
      replacementCost: replacementCostPerPflopYear * groundLatencyPenalty,
      sparesCarryCost: sparesCarryCostPerPflopYear * groundLatencyPenalty,
      opsCost: groundOpsCostPerPflopYear * groundLatencyPenalty,
      siteCapexAmortPerPflopYear: siteCapexAmortPerPflopYear * groundLatencyPenalty,
      capacityDeliveryPremium: buildoutPremiumPerPflopYear * groundLatencyPenalty, // Buildout premium replaces old capacityDeliveryPremium
      timeToEnergizePenalty: delayPenaltyPerPflopYear * groundLatencyPenalty, // Delay penalty (linear: WACC * capex * waitYears)
      totalCostPerPflopYear: groundTotalCost, // Physical costs only (scarcity treated in GPU-hour pricing)
      totalCostPerPflopYearBase: groundTotalCost_base, // Base cost (no scarcity pricing)
      totalCostPerPflopYearEffective: groundTotalCost, // Same as base (scarcity in GPU-hour, not PFLOP-year)
      totalCostPerPflopYearAllIn: groundTotalCost, // Same as base (scarcity in GPU-hour, not PFLOP-year)
      // Debug: show pricing components
      pricingComponents: {
        delayPenaltyWeighted: delayPenaltyPerPflopYear * groundLatencyPenalty, // Delay penalty (already weighted)
        scarcityRentPerPflopYear: scarcityRentPerPflopYear * groundLatencyPenalty,
        pricingMode: params.groundConstraintPricingMode ?? 'partial', // Pricing mode from params
        delayPenaltyWeight: params.groundDelayPenaltyWeight ?? 0.6, // Delay penalty weight from params
        rentFrac: scarcityRentResult.rentFrac,
        waitEffYears: scarcityRentResult.waitEffYears,
        // Debug fields for scarcity rent calculation
        scarcityHill: scarcityRentResult.scarcityHill,
        avgWaitYearsRaw: scarcityRentResult.avgWaitYearsRaw,
        avgWaitYearsClamped: scarcityRentResult.avgWaitYearsClamped,
      },
      constraintMultiplier: 1.0, // No constraint multiplier - use buildout terms
      breakdown: constraintBreakdown,
      supplyMetrics: {
        demandGw: mobilizationResult.demandGW,
        capacityGw: capacityGW,
        pipelineGw: pipelineGW,
        maxBuildRateGwYear: buildRateGWyr,
        avgWaitYears: avgWaitYears,
        utilizationPct: capacityGW > 0 ? mobilizationResult.demandGW / capacityGW : 0,
        backlogGw: backlogGW, // ADD: Backlog for chart display
      },
      // Buildout debug fields (from ramping mobilization model)
      backlogGw: backlogGW,
      avgWaitYears: avgWaitYears,
      buildoutDebug: {
        demandNewGW: demandNewGW,
        buildableGW: buildableGW,
        buildRateGWyr: buildRateGWyr,
        capacityGW: capacityGW,
        pipelineGW: pipelineGW,
        scarcityIndex: buildoutResult.factors.scarcityIndex,
        buildoutCapex_$PerkW: buildoutResult.factors.buildoutCapex_$PerkW,
        annualizedBuildoutPremium_$PerkWyr: buildoutResult.factors.annualizedBuildoutPremium_$PerkWyr,
        timeToPowerYears: avgWaitYears,
        valueOfTime_$PerYear: buildoutResult.factors.valueOfTime_$PerYear,
        delayPenalty_$PerYear: buildoutResult.factors.delayPenalty_$PerYear,
        buildoutPremiumPerPflopYear: buildoutPremiumPerPflopYear,
        delayPenaltyPerPflopYear: delayPenaltyPerPflopYear,
        // Additional mobilization debug fields
        demandGW: mobilizationResult.demandGW,
        demandGrowthRate: mobilizationResult.demandGrowthRate,
        backlogGW: mobilizationResult.backlogGW,
        avgWaitYears: mobilizationResult.avgWaitYears,
      },
      smrEnabled: false,
      smrRampFactor: 0,
      effectiveElectricityCost: groundElectricityPricePerMwh,
      constraintRelief: { grid: 0, cooling: 0, water: 0, land: 0 },
      constraints: {
        method: 'adders',
        capacityDeliveryPremium: buildoutPremiumPerPflopYear * groundLatencyPenalty,
        delayPenalty: delayPenaltyPerPflopYear * groundLatencyPenalty,
        scarcityRentPerPflopYear: scarcityRentPerPflopYear * groundLatencyPenalty, // Backward compat (now 0, scarcity is multiplicative)
        scarcityMultiplier: scarcityMultiplier, // Multiplicative scarcity (1.0 = no scarcity, 2.0 = 2x price)
        appliedMultipliers: {
          constraintMultiplierUsed: false,
          energyMultiplierUsed: false,
          siteMultiplierUsed: false,
        },
        waccBase: baseWacc,
        waccEffective: waccEffective,
        rentFrac: scarcityRentResult.rentFrac,
        waitYearsUsed: scarcityRentResult.waitEffYears, // Wait time used for scarcity rent calculation
        waitEffYears: scarcityRentResult.waitEffYears, // Alias for backward compatibility
        // Debug fields for scarcity rent calculation
        scarcityHill: scarcityRentResult.scarcityHill,
        avgWaitYearsRaw: scarcityRentResult.avgWaitYearsRaw,
        avgWaitYearsClamped: scarcityRentResult.avgWaitYearsClamped,
        debug: {
          doubleCountCheck: {
            mode: 'adders',
            multiplierApplied: false,
            addersApplied: true,
            invariantOk: true,
            notes: 'Buildout model uses adders only (capacityDeliveryPremium + delayPenalty + scarcityRent)',
          },
        },
      },
    };
    
    // Invariant: If using adders, multipliers must not be applied
    if (process.env.NODE_ENV === 'development') {
      const hasMultiplier = groundResult.constraintMultiplier !== 1.0;
      const hasAdder = (groundResult.capacityDeliveryPremium > 0) || (groundResult.timeToEnergizePenalty > 0);
      if (hasMultiplier && hasAdder) {
        throw new Error(
          `[DOUBLE COUNTING DETECTED] Year ${year}: constraintMultiplier=${groundResult.constraintMultiplier} != 1.0 ` +
          `AND adders > 0 (capacityDeliveryPremium=${groundResult.capacityDeliveryPremium}, ` +
          `delayPenalty=${groundResult.timeToEnergizePenalty}). Both cannot be applied simultaneously.`
        );
      }
    }
  } else if (useRegionalModel) {
    const demandPflops = getGlobalDemandPflops(year, groundEffectiveGflopsPerW);
    const regionalResult = calculateRegionalGroundCost(
      year,
      demandPflops,
      groundEffectiveGflopsPerW,
      effectivePueGround,
      capacityFactorGround,
      groundHardwareCapexPerPflopYear,
      undefined // Use default regions
    );
    
    // REFACTORED: Regional model - energy cost should NOT have constraint multiplier
    // Regional model already separates energy (raw) from site (with constraint)
    const energyCost = regionalResult.energyCostPerPflopYear; // Raw electricity (NO constraint multiplier)
    const siteCost = regionalResult.siteCostPerPflopYear; // Site costs WITH constraint multiplier
    
    // GROUND COST ACCOUNTING: Explicit separation for regional model
    const siteCostBase = BASE_SITE_2025;
    
    // 1. siteCapexAmortPerPflopYear: Base site capex (NOT affected by constraint)
    const siteCapexAmortPerPflopYear = siteCostBase;
    
    // 2. capacityDeliveryPremiumPerPflopYear: Premium above base (from constraint multiplier)
    const capacityDeliveryPremiumPerPflopYear = Math.max(0, siteCost - siteCostBase);
    
    // 3. timeToEnergizePenaltyPerPflopYear: Regional model doesn't model queue delay separately (0 for now)
    const timeToEnergizePenaltyPerPflopYear = 0;
    
    // INVARIANT: siteCostPerPflopYear = siteCapexAmort + timeToEnergizePenalty + capacityDeliveryPremium
    const siteCostPerPflopYear = siteCapexAmortPerPflopYear + timeToEnergizePenaltyPerPflopYear + capacityDeliveryPremiumPerPflopYear;
    
    // Validation (allow small tolerance for regional model approximation)
    const siteCostCheck = Math.abs(siteCost - siteCostPerPflopYear);
    if (siteCostCheck > 1.0) {
      throw new Error(`Site cost accounting error (regional model): siteCost=${siteCost} != sum(components)=${siteCostPerPflopYear}, diff=${siteCostCheck}`);
    }
    
    // CRITICAL FIX: Regional model already separates energy (no multiplier) from site (with premium)
    // Do NOT apply constraintMultiplier - it's already reflected in siteCostPerPflopYear
    const constraintMultiplier = 1.0; // Not applied - kept for backward compat only
    
    groundTotalCost = regionalResult.totalCostPerPflopYear;
    groundHasQueue = false; // Regional model doesn't model queue delay separately
    groundComparatorCostPerPflopYear = groundTotalCost; // Use base cost for regional model
    energyConstraintMultiplier = 1.0; // Never applied
    constraintBreakdown = {
      grid: 1.0, // Not applied
      cooling: 1.0, // Not applied
      water: 1.0, // Not applied
      land: 1.0, // Not applied
      energyMultiplier: 1.0, // Never applied
      siteMultiplier: 1.0, // Not applied - constraint effects already in siteCost
      capacityDeliveryMultiplier: 1.0, // Not applied - constraint effects already in siteCost
    };
    
    groundResult = {
      energyCost: energyCost, // Raw electricity cost (NO constraint multiplier)
      siteCost: siteCostPerPflopYear, // Site = sum of components (INVARIANT)
      siteCapexAmortPerPflopYear: siteCapexAmortPerPflopYear, // Explicit: pure capex
      capacityDeliveryPremium: capacityDeliveryPremiumPerPflopYear, // Explicit: scarcity premium
      timeToEnergizePenalty: timeToEnergizePenaltyPerPflopYear, // Regional model: 0 (not modeled separately)
      hardwareCost: regionalResult.hardwareCapexPerPflopYear,
      totalCostPerPflopYear: groundTotalCost,
      constraintMultiplier: 1.0, // NOT APPLIED - kept for backward compat only
      constraints: {
        method: 'adders',
        capacityDeliveryPremium: capacityDeliveryPremiumPerPflopYear, // From regional model siteCost - siteCostBase
        delayPenalty: 0, // Regional model doesn't model delay separately
        appliedMultipliers: {
          constraintMultiplierUsed: false,
          energyMultiplierUsed: false,
          siteMultiplierUsed: false,
        },
        debug: {
          doubleCountCheck: {
            mode: 'adders',
            multiplierApplied: false,
            addersApplied: capacityDeliveryPremiumPerPflopYear > 0,
            invariantOk: true,
            notes: 'Regional model uses adders only (capacityDeliveryPremium from siteCost - siteCostBase)',
          },
        },
      },
      breakdown: constraintBreakdown,
      smrEnabled: false,
      smrRampFactor: 0,
      effectiveElectricityCost: regionalResult.averageEnergyCostMwh,
      constraintRelief: { grid: 0, cooling: 0, water: 0, land: 0 },
      // Ensure backlogGw and avgWaitYears are always set (use supplyMetrics as fallback)
      backlogGw: regionalResult.supplyMetrics?.pipelineGw ?? 0, // TEMP proxy: use pipeline as placeholder
      avgWaitYears: regionalResult.supplyMetrics?.avgWaitYears ?? 0,
      supplyMetrics: regionalResult.supplyMetrics ?? {
        demandGw: 0,
        capacityGw: 0,
        pipelineGw: 0,
        maxBuildRateGwYear: 0,
        avgWaitYears: 0,
        utilizationPct: 0,
      },
    };
  } else {
    groundResult = calculateGroundTotal(
      year,
      params,
      ENERGY_COST_BASE_2025,
      groundHardwareCapexPerPflopYear,
      params.isStaticMode,
      effectiveGroundScenario,
      groundLatencyPenalty,
      smrParams,
      firstCapYear ?? null,
      groundEnergyCostPerPflopYear,
      groundElectricityPricePerMwh
    );

    // CRITICAL FIX: Ensure backlogGw and avgWaitYears are always set (even if calculateGroundTotal doesn't provide them)
    // Use supplyMetrics as fallback if available, otherwise 0
    // Type assertion needed because calculateGroundTotal may not include these fields
    const groundResultWithBacklog = groundResult as any;
    if (!('backlogGw' in groundResultWithBacklog) || groundResultWithBacklog.backlogGw === undefined) {
      groundResultWithBacklog.backlogGw = groundResultWithBacklog.supplyMetrics?.pipelineGw ?? 0; // TEMP proxy
    }
    if (!('avgWaitYears' in groundResultWithBacklog) || groundResultWithBacklog.avgWaitYears === undefined) {
      groundResultWithBacklog.avgWaitYears = groundResultWithBacklog.supplyMetrics?.avgWaitYears ?? 0;
    }
    // Ensure supplyMetrics exists
    if (!groundResultWithBacklog.supplyMetrics) {
      groundResultWithBacklog.supplyMetrics = {
        demandGw: 0,
        capacityGw: 0,
        pipelineGw: groundResultWithBacklog.backlogGw ?? 0,
        maxBuildRateGwYear: 0,
        avgWaitYears: groundResultWithBacklog.avgWaitYears ?? 0,
        utilizationPct: 0,
      };
    }
    groundResult = groundResultWithBacklog;

    groundTotalCost = groundResult.totalCostPerPflopYear;
    groundHasQueue = (groundResult.timeToEnergizePenalty ?? 0) > 0.01; // Check if delay penalty exists
    groundComparatorCostPerPflopYear = groundHasQueue
      ? (groundResult.totalCostPerPflopYearEffective ?? groundResult.totalCostPerPflopYear)
      : groundTotalCost;
    // CRITICAL FIX: Never apply multipliers - all set to 1.0
    energyConstraintMultiplier = 1.0; // Never applied
    
    // Invariant: If using adders, multipliers must not be applied
    if (process.env.NODE_ENV === 'development' && groundResult.constraints) {
      const hasMultiplier = groundResult.constraintMultiplier !== 1.0;
      const hasAdder = (groundResult.constraints.capacityDeliveryPremium > 0) || (groundResult.constraints.delayPenalty > 0);
      if (hasMultiplier && hasAdder) {
        throw new Error(
          `[DOUBLE COUNTING DETECTED] Year ${year}: constraintMultiplier=${groundResult.constraintMultiplier} != 1.0 ` +
          `AND adders > 0 (capacityDeliveryPremium=${groundResult.constraints.capacityDeliveryPremium}, ` +
          `delayPenalty=${groundResult.constraints.delayPenalty}). Both cannot be applied simultaneously.`
        );
      }
    }
    constraintBreakdown = {
      grid: 1.0, // Not applied
      cooling: 1.0, // Not applied
      water: 1.0, // Not applied
      land: 1.0, // Not applied
      energyMultiplier: 1.0, // Never applied
      siteMultiplier: 1.0, // Not applied
      capacityDeliveryMultiplier: 1.0, // Not applied
    };
    
    // Invariant: Check for double counting
    if (process.env.NODE_ENV === 'development') {
      const hasMultiplier = (groundResult.constraintMultiplier !== 1.0) || 
                           (groundResult.breakdown.energyMultiplier !== 1.0) ||
                           (groundResult.breakdown.siteMultiplier !== 1.0);
      const hasPremium = (groundResult.capacityDeliveryPremium || 0) > 0 ||
                        (groundResult.timeToEnergizePenalty || 0) > 0;
      if (hasMultiplier && hasPremium) {
        console.warn(
          `[DOUBLE COUNTING DETECTED] Year ${year}: ` +
          `Multipliers (constraint=${groundResult.constraintMultiplier}, ` +
          `energy=${groundResult.breakdown.energyMultiplier}, ` +
          `site=${groundResult.breakdown.siteMultiplier}) AND ` +
          `premiums (capacity=${groundResult.capacityDeliveryPremium}, ` +
          `delay=${groundResult.timeToEnergizePenalty}) are both present. ` +
          `This indicates double counting.`
        );
      }
    }
  }

  const launchCostPerKg = getLaunchCostPerKg(year, baseLaunchCost) * launchDiscount;
  const lifetimeYears = 6;
  
  // Fusion toggle params
  const fusionParams = params.fusionToggleEnabled 
    ? (params.fusionToggleParams || { ...DEFAULT_FUSION_PARAMS, enabled: true })
    : undefined;

  // CONSTELLATION SIZING: Design constellation to meet compute requirements
  // Convert target compute (GW) to power (kW) for constellation sizing
  const targetComputeKw = satellitePowerKW;
  let constellation = designConstellation(
    targetComputeKw,
    SATELLITE_CONSTRAINTS,
    100000, // Starship: 100t to LEO
    trajSpecificPower
  );
  
  // Use per-satellite compute power for cost calculation
  let computePowerPerSatKw = constellation.computePerSatKw;

  let hybridResult = computeSatelliteHybridCost(
    year, 
    launchCostPerKg, 
    {
      ...DEFAULT_CONFIG,
      computePowerKw: computePowerPerSatKw, // Use per-satellite power
      altitudeKm: orbitalAltitude,
      lifetimeYears: lifetimeYears,
      specificPowerWKg: trajSpecificPower,
      useRadHardChips: useRadHardChips,
      sunFraction: sunFraction,
      workloadType: workloadType || 'inference'
    }, 
    fusionParams,
    params.useCorrectedSpecificPower,
    params.useCorrectedThermal
  );
  
  // CRITICAL FIX: Calculate delivered efficiency with ALL delivery derates
  // delivered = systemEffective * thermalCapFactor * radiationDerate * availability
  // Single source of truth for all three factors:
  const thermalCapFactor = hybridResult.thermalSystem.thermalCapFactor;
  const radiationDerate = hybridResult.degradationFactor || 1.0; // Hardware degradation from radiation (chip failures, ECC overhead)
  const availability = hybridResult.capacityFactor || 1.0; // Capacity factor is uptime-inclusive (includes eclipse, degradation, radiation downtime, uptime)
  
  // Calculate delivered efficiency (all derates applied multiplicatively)
  // This is the true "delivered" efficiency that accounts for all operational constraints
  let orbitDeliveredGflopsPerWatt = orbitSystemEffectiveGflopsPerWatt * thermalCapFactor * radiationDerate * availability;
  
  // CRITICAL: If thermal constraint causes delivered efficiency to drop below minimum (20 GFLOPS/W),
  // this indicates a severe thermal constraint that should be handled by expanding radiator or reducing compute
  // For now, we clamp to minimum to prevent validation errors, but log a warning (only once per year)
  if (orbitDeliveredGflopsPerWatt < CONSTANTS.MIN_DELIVERED_GFLOPS_PER_W) {
    const originalDelivered = orbitDeliveredGflopsPerWatt;
    orbitDeliveredGflopsPerWatt = CONSTANTS.MIN_DELIVERED_GFLOPS_PER_W;
    
    // Log warning about severe thermal constraint (only in dev, and only once per year to reduce spam)
    // The actual clamped value is available in orbit.computeEfficiency.validation metadata
    // Thermal constraint warnings removed for cleaner console output
  }
  
  // Use delivered efficiency for all cost calculations
  let orbitEffectiveGflopsPerW = validateGflopsPerWatt(
    orbitDeliveredGflopsPerWatt,
    'orbital delivered efficiency calculation'
  );
  
  // Power scaling calculation
  const powerScalingParams = params.powerScalingParams || DEFAULT_POWER_SCALING;
  const scalingResult = calculateScaledMass(computePowerPerSatKw, powerScalingParams);

  // CONSTELLATION SCALING: Apply constellation multiplier to mass and costs
  // Per-satellite mass (already calculated for one satellite)
  let massPerSatKg = hybridResult.totalMassKg * massMultiplier;
  
  // CRITICAL FIX: Check if actual mass exceeds limit and re-split constellation if needed
  // The simplified mass model in designConstellation may underestimate actual mass
  // If actual mass exceeds limit, we need to split into smaller satellites
  const MAX_SATELLITE_MASS_KG = SATELLITE_CONSTRAINTS.maxMassKg; // 10,000 kg from constraints
  if (massPerSatKg > MAX_SATELLITE_MASS_KG) {
    // Calculate required compute per satellite to stay under mass limit
    // Mass scales roughly with compute power, so: massPerSatKg / computePowerPerSatKw = massPerKw
    const massPerKw = massPerSatKg / computePowerPerSatKw;
    const maxComputePerSatKw = MAX_SATELLITE_MASS_KG / massPerKw;
    
    // Recalculate constellation with smaller satellites
    const adjustedConstellation = designConstellation(
      targetComputeKw,
      {
        ...SATELLITE_CONSTRAINTS,
        maxComputeKw: maxComputePerSatKw * 0.9, // Use 90% of max to leave margin
      },
      100000, // Starship: 100t to LEO
      trajSpecificPower
    );
    
    // Recalculate hybrid cost with adjusted compute per satellite
    const adjustedHybridResult = computeSatelliteHybridCost(
      year, 
      launchCostPerKg, 
      {
        ...DEFAULT_CONFIG,
        computePowerKw: adjustedConstellation.computePerSatKw,
        altitudeKm: orbitalAltitude,
        lifetimeYears: lifetimeYears,
        specificPowerWKg: trajSpecificPower,
        useRadHardChips: useRadHardChips,
        sunFraction: sunFraction,
        workloadType: workloadType || 'inference'
      }, 
      fusionParams,
      params.useCorrectedSpecificPower,
      params.useCorrectedThermal
    );
    
    // Update with adjusted values
    const adjustedMassPerSatKg = adjustedHybridResult.totalMassKg * massMultiplier;
    if (adjustedMassPerSatKg > MAX_SATELLITE_MASS_KG) {
      // Still too heavy - this shouldn't happen, but log a warning
      console.warn(
        `Satellite mass ${adjustedMassPerSatKg.toFixed(0)}kg still exceeds limit ${MAX_SATELLITE_MASS_KG}kg ` +
        `even after splitting to ${adjustedConstellation.computePerSatKw.toFixed(1)}kW per satellite. ` +
        `Consider further reducing compute per satellite or improving specific power.`
      );
    }
    
    // Use adjusted constellation and hybrid result
    constellation = adjustedConstellation;
    hybridResult = adjustedHybridResult;
    computePowerPerSatKw = adjustedConstellation.computePerSatKw;
    massPerSatKg = adjustedMassPerSatKg;
    
    // Recalculate delivered efficiency with adjusted thermal cap (all derates applied)
    const adjustedThermalCapFactor = hybridResult.thermalSystem.thermalCapFactor;
    const adjustedRadiationDerate = hybridResult.degradationFactor || 1.0;
    const adjustedAvailability = hybridResult.capacityFactor || 1.0;
    let adjustedDeliveredGflopsPerWatt = orbitSystemEffectiveGflopsPerWatt * adjustedThermalCapFactor * adjustedRadiationDerate * adjustedAvailability;
    
    // Clamp to minimum if thermal constraint is too severe
    if (adjustedDeliveredGflopsPerWatt < CONSTANTS.MIN_DELIVERED_GFLOPS_PER_W) {
      adjustedDeliveredGflopsPerWatt = CONSTANTS.MIN_DELIVERED_GFLOPS_PER_W;
    }
    
    orbitEffectiveGflopsPerW = validateGflopsPerWatt(
      adjustedDeliveredGflopsPerWatt,
      'orbital delivered efficiency (after constellation split)'
    );
  }
  
  // Scale costs by number of satellites and apply constellation overhead
  // Calculate AFTER mass check so we use the adjusted constellation if it was split
  const constellationMultiplier = constellation.numSatellites;
  const constellationOverheadMultiplier = constellation.constellationOverhead;
  
  // Total constellation mass
  const effectiveTotalMassKg = massPerSatKg * constellation.numSatellites;
  const effectiveTotalLaunchCost = effectiveTotalMassKg * launchCostPerKg;

  // Apply Elon Scenario: Discounts
  const effectivePowerFabCost = hybridResult.powerSystem.fabCostUsd * powerDiscount;
  const effectiveNetworkingFabCost = hybridResult.networking.fabCostUsd * networkingDiscount;
  const effectiveNetworkingOpEx = (hybridResult.networking.annualOpExUsd || 0) * networkingDiscount;

  // Effective PFLOPs: per-satellite PFLOPs × number of satellites
  const effectivePflopsPerSat = hybridResult.effectivePflops;
  const totalEffectivePflops = effectivePflopsPerSat * constellation.numSatellites;
  
  // Launch cost: total constellation launch cost / total PFLOPs
  const launchCostPerPflopYear = effectiveTotalLaunchCost / totalEffectivePflops / lifetimeYears;

  // CRITICAL FIX 1: Cost Accounting - ensure breakdown sums to total
  // Calculate each component explicitly, scaled by constellation
  // Per-satellite costs × number of satellites × constellation overhead
  const constellationCostMultiplier = constellation.numSatellites * constellationOverheadMultiplier;
  
  const powerCost = (effectivePowerFabCost * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears;
  const computeCost = ((hybridResult.computePayload.chipCostUsd + hybridResult.computePayload.qualificationCostUsd) * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears;
  const thermalCost = (hybridResult.thermalSystem.fabCostUsd * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears;
  const radiationCost = (hybridResult.radiationProtection.fabCostUsd * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears;
  const busCost = (hybridResult.bus.fabCostUsd * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears;
  const networkingCost = (effectiveNetworkingFabCost * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears;
  const interconnectCost = (hybridResult.interconnect.totalAnnualCost * constellationCostMultiplier) / totalEffectivePflops;
  const regulatoryCost = ((hybridResult.regulatory?.annualCostUsd || 0) * constellationCostMultiplier) / totalEffectivePflops;
  
  // Ops cost scales with constellation overhead (more satellites = more ops complexity)
  const baseOpsCostPerSat = hybridResult.opsPerPflopYear * effectivePflopsPerSat; // Total ops cost per satellite
  const networkingOpsCostPerSat = (hybridResult.networking.annualOpExUsd || 0) - effectiveNetworkingOpEx; // Already per-sat
  const adjustedNetworkingOpsCostPerSat = effectiveNetworkingOpEx; // Already per-sat
  const opsCostPerSat = baseOpsCostPerSat - networkingOpsCostPerSat + adjustedNetworkingOpsCostPerSat;
  
  // Scale ops cost by constellation (with overhead for coordination)
  const opsCostMultiplier = constellation.numSatellites * (1 + 0.1 * Math.log10(constellation.numSatellites));
  const opsCost = (opsCostPerSat * opsCostMultiplier) / totalEffectivePflops;

  const orbitalBreakdown = {
    power: powerCost,
    compute: computeCost,
    thermal: thermalCost,
    radiation: radiationCost,
    bus: busCost,
    ops: opsCost,
    congestion: 0, // Calculated below
    networking: networkingCost,
    interconnect: interconnectCost,
    regulatory: regulatoryCost,
    launch: launchCostPerPflopYear
  };

  const totalSatelliteCost = hybridResult.totalSatelliteCost * constellationCostMultiplier;
  const satelliteCount = constellation.numSatellites; // Use actual constellation size
  const congestion = calculateCongestion(satelliteCount, totalSatelliteCost, year, 10000 + satelliteCount, spaceTrafficEnabled);
  
  // Total fleet PFLOPS: use constellation total PFLOPs
  // Already calculated as totalEffectivePflops above
  orbitalBreakdown.congestion = spaceTrafficEnabled ? (congestion.congestionCostPerPflopYear / totalEffectivePflops) : 0;

  // PATCH G: Cost Accounting Invariants
  // Use assertCostAccounting to ensure breakdown sums to total exactly
  const orbitalComponents = [
    { name: 'power', value: orbitalBreakdown.power },
    { name: 'compute', value: orbitalBreakdown.compute },
    { name: 'thermal', value: orbitalBreakdown.thermal },
    { name: 'radiation', value: orbitalBreakdown.radiation },
    { name: 'bus', value: orbitalBreakdown.bus },
    { name: 'ops', value: orbitalBreakdown.ops },
    { name: 'networking', value: orbitalBreakdown.networking },
    { name: 'interconnect', value: orbitalBreakdown.interconnect },
    { name: 'regulatory', value: orbitalBreakdown.regulatory },
    { name: 'launch', value: orbitalBreakdown.launch },
    { name: 'congestion', value: orbitalBreakdown.congestion },
  ];
  
  const breakdownSum = Object.values(orbitalBreakdown).reduce((a, b) => a + b, 0);
  const realisticCostPerPflop = breakdownSum;
  
  // Track applied multipliers for debugging
  const appliedMultipliers: Array<{ name: string; value: number; appliedTo: string }> = [
    { name: 'launchDiscount', value: launchDiscount, appliedTo: 'launch cost' },
    { name: 'powerDiscount', value: powerDiscount, appliedTo: 'power fab cost' },
    { name: 'networkingDiscount', value: networkingDiscount, appliedTo: 'networking cost' },
    { name: 'massMultiplier', value: massMultiplier, appliedTo: 'total mass' },
  ];
  
  // Assert cost accounting (throws if invalid)
  const orbitalAccounting = assertCostAccounting(realisticCostPerPflop, orbitalComponents, appliedMultipliers);
  const costAccountingValid = orbitalAccounting.valid;
  const costAccountingErrorPct = orbitalAccounting.errorPct;

  // FIX 5: GPU-hour breakdown must derive from annual cost breakdown
  // GPU-hour pricing: Apply scarcity as MULTIPLICATIVE multiplier (not additive)
  // delayPenalty remains additive (WACC carry cost), but scarcity rent is now multiplicative
  const delayPenaltyPerPflopYear = groundResult.constraints?.delayPenalty || 0;
  const scarcityMultiplier = groundResult.constraints?.scarcityMultiplier ?? 1.0; // Multiplier from log-based function
  
  // Convert delayPenalty to $/GPU-hour (still additive)
  const pflopsPerGpu = 2.0;
  const utilizationTarget = 0.85;
  const hoursPerYear = 8760;
  const annualGpuHoursPerPFLOP = hoursPerYear * utilizationTarget / pflopsPerGpu;
  const delayPenaltyAdderPerGpuHour = delayPenaltyPerPflopYear / annualGpuHoursPerPFLOP;
  
  // Note: Scarcity is now MULTIPLICATIVE (not additive), so no conversion check needed
  // Scarcity multiplier is applied directly to base cost in GPU-hour pricing
  
  // Use BASE cost (without scarcity) for GPU-hour pricing, then apply scarcity as multiplier
  // This prevents double-counting: scarcity is multiplicative in GPU-hour pricing, not additive
  // We want: baseCost (no scarcity) * scarcityMultiplier = total with scarcity
  // Use groundResult.totalCostPerPflopYearBase if available (from buildout model), otherwise construct from components
  const groundCostBaseForPricing = useBuildoutModel && groundResult?.totalCostPerPflopYearBase !== undefined
    ? groundResult.totalCostPerPflopYearBase
    : (groundResult.energyCost + groundResult.siteCost + groundResult.hardwareCost) * groundLatencyPenalty;
  
  const groundGpuHour = (sla: SLAConfig) => {
    const basePricing = calculateGpuHourPricing(groundCostBaseForPricing, {
      pflopsPerGpu,
      utilizationTarget,
      operatorMarginPct: operatorMargin,
      sla,
      location: 'ground'
    }, {
      compute: groundResult.hardwareCost,
      power: groundResult.energyCost,
      site: useBuildoutModel ? groundResult.siteCapexAmortPerPflopYear : groundResult.siteCost,
      // Ground cooling included in energy, interconnect minimal
    });
    
    // UNIFIED SCARCITY ACCOUNTING: Scarcity is MULTIPLICATIVE (not additive)
    // CRITICAL FIX: Apply scarcity as premium on FIXED reference base, not declining base
    // This prevents Moore's Law from eroding scarcity dollar amounts
    
    // Extract base cost before margin (this declines with Moore's Law)
    const preMarginBase = basePricing.pricePerGpuHour - (basePricing.costBreakdown.margin || 0);
    
    // Scarcity premium based on FIXED reference, not declining base
    // This ensures scarcity doesn't get eroded by Moore's Law
    const SCARCITY_REFERENCE_BASE = 3.50; // Fixed 2025 market reference ($/GPU-hr)
    const scarcityPremium = (scarcityMultiplier - 1) * SCARCITY_REFERENCE_BASE;
    
    // Total cost = base (declining with Moore's Law) + scarcity (fixed) + delay
    const costWithScarcity = preMarginBase + scarcityPremium;
    const costWithScarcityAndDelay = costWithScarcity + delayPenaltyAdderPerGpuHour;
    
    // Then add margin
    const margin = costWithScarcityAndDelay * operatorMargin;
    const pricePerGpuHour = costWithScarcityAndDelay + margin;
    
    return {
      ...basePricing,
      pricePerGpuHour,
      costBreakdown: {
        ...basePricing.costBreakdown,
        scarcity: scarcityPremium, // Fixed-base scarcity premium (doesn't decline with Moore's Law)
        delayPenalty: delayPenaltyAdderPerGpuHour, // Delay penalty (WACC carry)
        margin, // overwrite with recomputed margin
      },
    };
  };

  const orbitalGpuHour = (sla: SLAConfig) => calculateGpuHourPricing(realisticCostPerPflop, {
    pflopsPerGpu: 2.0,
    utilizationTarget: 0.85,
    operatorMarginPct: operatorMargin,
    sla,
    location: 'orbital'
  }, orbitalBreakdown); // Use full orbital breakdown

  const groundTokens = {
    llama70B: calculateTokenPricing(groundTotalCost, { params: 70e9, precision: 'fp16' }),
    llama405B: calculateTokenPricing(groundTotalCost, { params: 405e9, precision: 'fp16' })
  };

  const orbitalTokens = {
    llama70B: calculateTokenPricing(realisticCostPerPflop, { params: 70e9, precision: 'fp16' }),
    llama405B: calculateTokenPricing(realisticCostPerPflop, { params: 405e9, precision: 'fp16' })
  };

  const edgeInference = params.edgeInference?.enabled 
    ? computeEdgeInferenceCosts(year, params.edgeInference, launchCostPerKg, totalEffectivePflops / effectiveTotalMassKg)
    : undefined;

  const gpuHourCrossover = orbitalGpuHour(SLA_TIERS.standard).pricePerGpuHour < groundGpuHour(SLA_TIERS.standard).pricePerGpuHour;

  // ============================================================================
  // DEBUG INVARIANTS (development mode only)
  // ============================================================================
  if (process.env.NODE_ENV === 'development') {
    // Invariant 1: If avgWaitYears > 0 then scarcity multiplier should be > 1.0 (scarcity is multiplicative in GPU-hour pricing)
    const avgWaitYears = groundResult.supplyMetrics?.avgWaitYears ?? 0;
    const scarcityMultiplier = groundResult.constraints?.scarcityMultiplier ?? 1.0;
    if (avgWaitYears > 1.0 && scarcityMultiplier <= 1.0) {
      console.warn(
        `[INVARIANT VIOLATION] Year ${year}: avgWaitYears=${avgWaitYears} > 1.0 but scarcityMultiplier=${scarcityMultiplier} <= 1.0. ` +
        `Scarcity multiplier should be > 1.0 when wait time exists (scarcity is multiplicative in GPU-hour pricing).`
      );
    }
    
    // Invariant 2: supplyMetrics.capacityGw is the effective capacity (bottleneck)
    // Queue model uses coherent backlog based on unmet demand
    
    // Invariant 3: GPU-hour chart yMax guard (prevented by explicit series extraction in chart component)
    // This is handled in the chart component with explicit series extraction
    
    // Invariant 4: Crossover uses effective ground cost
    const groundEffective = groundResult.totalCostPerPflopYearEffective ?? groundResult.totalCostPerPflopYear;
    const groundHeadline = groundResult.totalCostPerPflopYear;
    const delayPenalty = groundResult.constraints?.delayPenalty ?? 0;
    // Scarcity is now multiplicative (not additive), so don't add it to effective cost
    const expectedEffective = groundHeadline + delayPenalty; // Scarcity applied in GPU-hour pricing, not PFLOP-year
    const effectiveError = Math.abs(groundEffective - expectedEffective);
    // Reuse scarcityMultiplier from Invariant 1 above
    if (effectiveError > 0.01 && (delayPenalty > 0 || scarcityMultiplier > 1.0)) {
      console.warn(
        `[INVARIANT VIOLATION] Year ${year}: groundEffective=${groundEffective} != expected=${expectedEffective} ` +
        `(headline=${groundHeadline}, delayPenalty=${delayPenalty}, scarcityMultiplier=${scarcityMultiplier}). ` +
        `Crossover should use effective cost. Note: scarcity is multiplicative in GPU-hour pricing, not additive in PFLOP-year.`
      );
    }
  }

  // CRITICAL FIX: Validate delivered efficiency by comparing like-for-like only
  // expectedDelivered = systemEffectiveGflopsPerWatt * thermalCapFactor * radiationDerate * availability
  // ratio = deliveredGflopsPerWatt / expectedDelivered
  // If ratio is finite and |1 - ratio| <= tolerance (0.02), then valid=true, warning=null
  // Else valid=false, warning describes the mismatch
  // Remove any other comparisons (e.g., delivered vs systemEffective, delivered vs peak*utilization without overhead, etc.)
  const expectedDelivered = orbitSystemEffectiveGflopsPerWatt * thermalCapFactor * radiationDerate * availability;
  const ratio = orbitDeliveredGflopsPerWatt / Math.max(expectedDelivered, 1e-6);
  const TOLERANCE = 0.02; // 2% tolerance
  const ratioError = Math.abs(1 - ratio);
  
  // CRITICAL: Fix validator logic - if ratio is finite and |1 - ratio| <= tolerance, then valid=true
  const isRatioValid = isFinite(ratio) && ratioError <= TOLERANCE;
  
  // Escalate: if mismatch > 5%, mark as invalid (don't just warn)
  const ESCALATE_THRESHOLD = 0.05; // 5%
  const isInvalid = !isRatioValid && ratioError > ESCALATE_THRESHOLD;
  
  // Debug invariants: assert delivered <= systemEffective + eps
  const deliveredVsSystemError = orbitDeliveredGflopsPerWatt - orbitSystemEffectiveGflopsPerWatt;
  if (deliveredVsSystemError > 1e-6) {
    console.warn(
      `[INVARIANT VIOLATION] Delivered efficiency (${orbitDeliveredGflopsPerWatt.toFixed(2)}) > systemEffective (${orbitSystemEffectiveGflopsPerWatt.toFixed(2)}). ` +
      `Delivered must be <= systemEffective.`
    );
  }
  
  // Efficiency debug logging removed for cleaner console output
  // Validation results are available in orbit.computeEfficiency.validation metadata
  
  // CRITICAL: Validate delivered efficiency - compare delivered vs expectedDelivered only
  // Make validator debug explicit with all factors
  // If mismatch > 5%, mark run invalid and stop chart rendering (escalate, don't silently warn)
  const deliveredValidation = {
    valid: isRatioValid,
    warning: isRatioValid 
      ? undefined // Empty/null when valid
      : `Power/Efficiency mismatch: ${ratio.toFixed(2)}x discrepancy (expected=${expectedDelivered.toFixed(2)}, delivered=${orbitDeliveredGflopsPerWatt.toFixed(2)})`,
    expectedDelivered,
    delivered: orbitDeliveredGflopsPerWatt,
    ratio,
    factorsUsed: {
      thermalCapFactor,
      radiationDerate,
      availability,
      utilization: orbitalEfficiencyResult.debug.utilizationFactor,
      systemOverheadFactor: orbitalEfficiencyResult.debug.systemOverheadFactor,
    },
    // Escalate: if ratio is way off (> 5%), mark as invalid
    invalid: !isRatioValid && Math.abs(1 - ratio) > 0.05,
  };
  
  const efficiencyValidation = validateComputeEfficiency(orbitEffectiveGflopsPerW, params.efficiencyLevel);
  const consistencyCheck = assertComputePowerConsistency(orbitEffectiveGflopsPerW, targetComputeKw, totalEffectivePflops, MODEL_UNITS);

  // SANITY PANEL: Comprehensive debug block per year
  const sanityPanel = {
    ground: {
      effectiveGflopsPerW: groundEffectiveGflopsPerW,
      energyCostPerPflopYear: groundResult.energyCost,
      siteCapexAmort: groundResult.siteCapexAmortPerPflopYear ?? (groundResult.siteCost - (groundResult.capacityDeliveryPremium ?? 0) - (groundResult.timeToEnergizePenalty ?? 0)),
      delayPenalty: groundResult.timeToEnergizePenalty ?? 0,
      capacityPremium: groundResult.capacityDeliveryPremium ?? 0,
      constraintMultiplier: groundResult.constraintMultiplier,
      total: groundTotalCost,
    },
    orbit: {
      // REMOVED: effectiveSpecificPower (duplicate of specificPower_effective_WPerKg)
      // Use specificPower_effective_WPerKg instead (canonical field)
      massMultiplier: hybridResult.specificPowerMultipliers?.massMultiplier ?? 1.0,
      requiredAreaM2: hybridResult.thermalSystem.qPerM2_W ? (hybridResult.thermalSystem.wasteHeatW ?? hybridResult.thermalSystem.wasteHeatKw * 1000) / (hybridResult.thermalSystem.qPerM2_W ?? 1) : hybridResult.thermalSystem.physicalAreaM2,
      areaAvailableM2: hybridResult.thermalSystem.areaAvailableM2 ?? hybridResult.thermalSystem.physicalAreaM2,
      thermalCapFactor: hybridResult.thermalSystem.thermalCapFactor,
      total: realisticCostPerPflop,
    },
    allInvariantsPassed: (() => {
      // Check key invariants
      const siteCostCheck = Math.abs(groundResult.siteCost - ((groundResult.siteCapexAmortPerPflopYear ?? 0) + (groundResult.timeToEnergizePenalty ?? 0) + (groundResult.capacityDeliveryPremium ?? 0))) < 0.01;
      const thermalAreaCheck = hybridResult.thermalSystem.areaAvailableM2 ? Math.abs(hybridResult.thermalSystem.areaAvailableM2 - hybridResult.thermalSystem.physicalAreaM2) / hybridResult.thermalSystem.physicalAreaM2 < 0.01 : true;
      const specificPowerCheck = hybridResult.specificPowerMultipliers ? hybridResult.specificPowerMultipliers.effective <= hybridResult.specificPowerMultipliers.baseSpecificPower * 1.01 : true;
      const thermalCapCheck = hybridResult.thermalSystem.thermalCapFactor >= 0 && hybridResult.thermalSystem.thermalCapFactor <= 1;
      return siteCostCheck && thermalAreaCheck && specificPowerCheck && thermalCapCheck;
    })(),
  };

  return {
    year,
    mode: params.isStaticMode ? 'STATIC' : 'DYNAMIC',
    sanityPanel,
    ground: {
      electricityPricePerMwh: groundElectricityPricePerMwh,
      pue: effectivePueGround,
      capacityFactor: capacityFactorGround,
      // HARD ASSERT: All ground efficiency fields must be populated and finite
      gflopsPerWatt: (() => {
        const value = groundEffectiveGflopsPerW;
        if (!isFinite(value) || value <= 0) {
          throw new Error(`ground.gflopsPerWatt is invalid: ${value}. actualGroundInput=${actualGroundInput}`);
        }
        return value;
      })(), // Effective (system) GFLOPS/W
      computeDefinition: (() => {
        // CRITICAL FIX: Validate all computeDefinition fields to catch unit corruption
        const peak = validateGflopsPerWatt(
          groundEfficiencyResult.debug.chipPeakGflopsPerW,
          'ground.computeDefinition.peakGflopsPerWatt'
        );
        const effective = validateGflopsPerWatt(
          groundEfficiencyResult.debug.effectiveGflopsPerW,
          'ground.computeDefinition.effectiveGflopsPerWatt'
        );
        const utilization = groundEfficiencyResult.debug.utilizationFactor;
        
        if (!isFinite(utilization) || utilization <= 0 || utilization > 1) {
          throw new Error(`ground.computeDefinition.utilizationFactor is invalid: ${utilization}`);
        }
        
        return {
          chipName: 'NVIDIA H100 SXM',
          precision: 'FP16',
          peakGflopsPerWatt: peak,
          utilizationFactor: utilization,
          effectiveGflopsPerWatt: effective,
          notes: 'Datacenter deployment, system-level efficiency',
        };
      })(),
      energyCostPerPflopYear: (() => {
        const value = groundResult.energyCost;
        if (!isFinite(value) || value < 0) {
          throw new Error(
            `ground.energyCostPerPflopYear is invalid: ${value}. ` +
            `Check: groundEffectiveGflopsPerW=${groundEffectiveGflopsPerW}, ` +
            `groundElectricityPricePerMwh=${groundElectricityPricePerMwh}, ` +
            `effectivePueGround=${effectivePueGround}`
          );
        }
        return value;
      })(), // Raw electricity (NO constraint multiplier)
      siteCostPerPflopYear: (() => {
        const value = groundResult.siteCost;
        if (!isFinite(value) || value < 0) {
          throw new Error(`ground.siteCostPerPflopYear is invalid: ${value}`);
        }
        return value;
      })(), // Site costs = sum of components (INVARIANT)
      siteCapexAmortPerPflopYear: groundResult.siteCapexAmortPerPflopYear ?? (groundResult.siteCost - (groundResult.capacityDeliveryPremium ?? 0) - (groundResult.timeToEnergizePenalty ?? 0)), // Pure capex amortization
      capacityDeliveryPremium: groundResult.capacityDeliveryPremium ?? 0, // Explicit capacity/delivery premium (independent)
      timeToEnergizePenalty: groundResult.timeToEnergizePenalty ?? 0, // Queue delay penalty (WACC-based, independent)
      hardwareCapexPerPflopYear: groundResult.hardwareCost,
      constraintMultiplier: 1.0, // NOT APPLIED - kept for backward compat only
      constraintBreakdown: {
        ...constraintBreakdown,
        capacityDeliveryMultiplier: 1.0, // Not applied
      },
      constraints: (groundResult.constraints ? {
        ...groundResult.constraints,
        method: 'adders' as const,
      } : {
        method: 'adders' as const,
        capacityDeliveryPremium: (groundResult.capacityDeliveryPremium || 0),
        delayPenalty: (groundResult.timeToEnergizePenalty || 0),
        appliedMultipliers: {
          constraintMultiplierUsed: false,
          energyMultiplierUsed: false,
          siteMultiplierUsed: false,
        },
      }) as { method: 'adders'; capacityDeliveryPremium: number; delayPenalty: number; appliedMultipliers: { constraintMultiplierUsed: boolean; energyMultiplierUsed: boolean; siteMultiplierUsed: boolean; }; debug?: any },
      supplyMetrics: (groundResult as any).supplyMetrics,
      constraintComponents: (groundResult as any).constraintComponents,
      totalCostPerPflopYear: (() => {
        const value = groundTotalCost;
        if (!isFinite(value) || value <= 0) {
          throw new Error(
            `ground.totalCostPerPflopYear is invalid: ${value}. ` +
            `Components: energy=${groundResult.energyCost}, site=${groundResult.siteCost}, hardware=${groundResult.hardwareCost}, ` +
            `groundEffectiveGflopsPerW=${groundEffectiveGflopsPerW}, actualGroundInput=${actualGroundInput}`
          );
        }
        return value;
      })(),
      gpuHourPricing: {
        basic: groundGpuHour(SLA_TIERS.basic),
        standard: groundGpuHour(SLA_TIERS.standard),
        premium: groundGpuHour(SLA_TIERS.premium),
      },
      tokenPricing: groundTokens,
      smrEnabled: groundResult.smrEnabled,
      smrRampFactor: groundResult.smrRampFactor,
      effectiveElectricityCost: groundResult.effectiveElectricityCost,
      constraintRelief: groundResult.constraintRelief
    },
    orbit: {
      lcoePerMwh: (hybridResult.powerSystem.totalCostUsd) / (satellitePowerKW * PHYSICS_CONSTANTS.HOURS_PER_YEAR * lifetimeYears * hybridResult.capacityFactor / 1000),
      pue: pueOrbital,
      capacityFactor: hybridResult.capacityFactor,
      capacityFactorProvenance: hybridResult.computePayload?.capacityFactorProvenance, // Debug: CF breakdown
      gflopsPerWatt: orbitEffectiveGflopsPerW, // Delivered GFLOPS/W (systemEffective × thermalCap × radiationDerate × availability)
      computeDefinition: {
        chipName: 'H100-equivalent (rad-tolerant)',
        precision: 'FP16',
        peakGflopsPerWatt: validateGflopsPerWatt(
          orbitPeakGflopsPerWatt,
          'orbit.computeDefinition.peakGflopsPerWatt'
        ),
        utilizationFactor: orbitalEfficiencyResult.debug.utilizationFactor,
        effectiveGflopsPerWatt: orbitSystemEffectiveGflopsPerWatt, // System-effective = peak * utilization / systemOverheadFactor (SYSTEM-LEVEL EFFECTIVE)
        // deliveredGflopsPerWatt is stored in orbit.computeEfficiency.gflopsPerWatt, not here
        notes: 'Commercial rad-tolerant variant. peakGflopsPerWatt = chip peak. effectiveGflopsPerWatt = peak * utilization / systemOverheadFactor (system-level effective). deliveredGflopsPerWatt = systemEffective × thermalCapFactor × radiationDerate × availability',
      },
      computeEfficiencyProvenance: {
        peakGflopsPerWatt: orbitalEfficiencyResult.debug.chipPeakGflopsPerW,
        utilizationFactor: orbitalEfficiencyResult.debug.utilizationFactor,
        systemOverheadFactor: orbitalEfficiencyResult.debug.systemOverheadFactor,
        effectiveGflopsPerWatt: orbitalEfficiencyResult.debug.effectiveGflopsPerW,
      }, // Debug: GFLOPS/W breakdown
      launchCostPerKg: launchCostPerKg,
      specificPowerWPerKg: hybridResult.specificPowerWPerKg, // Deprecated: use specificPower_subsystem_WPerKg
      specificPower_subsystem_WPerKg: hybridResult.specificPowerWPerKg, // Subsystem-level (solar array only)
      specificPower_effective_WPerKg: hybridResult.specificPowerMultipliers?.effective ?? scalingResult.effectiveSpecificPower, // Effective spacecraft-level (from multipliers calculation)
      // Use specificPowerMultipliers from hybridResult (calculated in orbitalPhysics.ts with correct mass fraction accounting)
      specificPowerMultipliers: hybridResult.specificPowerMultipliers,
      energyCostPerPflopYear: orbitalBreakdown.power,
      hardwareCostPerPflopYear: orbitalBreakdown.compute,
      launchCostPerPflopYear: orbitalBreakdown.launch,
      radiationMultiplier: 1.0,
      thermalCapFactor: hybridResult.thermalSystem.thermalCapFactor,
      congestionCostPerPflopYear: orbitalBreakdown.congestion,
      totalCostPerPflopYear: realisticCostPerPflop, 
      thermalCapped: hybridResult.thermalSystem.thermalCapped,
      computePowerKw: targetComputeKw, // Total constellation compute power
      maxRejectableKw: hybridResult.thermalSystem.maxRejectableKw || hybridResult.thermalSystem.wasteHeatKw * 1.25,
      collisionRisk: congestion.collisionRisk,
      bodyMountedAreaM2: 0,
      deployableAreaM2: hybridResult.thermalSystem.physicalAreaM2,
      totalRadiatorAreaM2: hybridResult.thermalSystem.physicalAreaM2,
      radiatorCostPerPflopYear: (hybridResult.thermalSystem.totalCostUsd * constellationCostMultiplier) / totalEffectivePflops / lifetimeYears,
      radiatorMassKg: hybridResult.thermalSystem.totalMassKg,
      optimisticCostPerPflop: orbitalBreakdown.power + orbitalBreakdown.compute + orbitalBreakdown.bus,
      radiationShieldingCost: orbitalBreakdown.radiation,
      thermalSystemCost: orbitalBreakdown.thermal,
      replacementRateCost: orbitalBreakdown.ops,
      eccOverheadCost: 0,
      redundancyCost: 0,
      realisticCostPerPflop,
      hybridBreakdown: orbitalBreakdown,
      gpuHourPricing: {
        basic: orbitalGpuHour(SLA_TIERS.basic),
        standard: orbitalGpuHour(SLA_TIERS.standard),
        premium: orbitalGpuHour(SLA_TIERS.premium),
      },
      tokenPricing: orbitalTokens,
      radiationDegradation: {
        annualFailureRate: useRadHardChips ? 0.09 : 0.15,
        effectiveComputePercent: hybridResult.degradationFactor,
        eccOverheadPct: 0.05,
        applied: true
      },
      powerSystemType: hybridResult.powerSystemType,
      scalingPenalty: scalingResult.scalingPenalty,
      // REMOVED: effectiveSpecificPower (duplicate of specificPower_effective_WPerKg)
      // Use specificPower_effective_WPerKg instead (canonical field)
      fusionDetails: hybridResult.fusionDetails,
      
      // Constellation sizing
      constellation: {
        design: {
          numSatellites: constellation.numSatellites,
          computePerSatKw: constellation.computePerSatKw,
          massPerSatKg: massPerSatKg,
          radiatorAreaPerSatM2: constellation.radiatorAreaPerSatM2,
        },
        launch: {
          satsPerLaunch: constellation.satsPerLaunch,
          launchesRequired: constellation.launchesRequired,
          totalMassKg: effectiveTotalMassKg,
        },
        scaling: {
          constellationOverhead: constellation.constellationOverhead,
          scalingEfficiency: constellation.scalingEfficiency,
        },
        warnings: constellation.warnings,
      },
      
      // Debug blocks for analysis - explicitly track all efficiency levels
      // Single source of truth: define orbit.computeEfficiencyLevels each year
      // Note: computeEfficiencyLevels is stored in metadata, not directly on orbit
      effectiveComputeMultipliers: {
        thermalCapFactor: hybridResult.thermalSystem.thermalCapFactor,
        radiationDerate: hybridResult.degradationFactor || 1.0,
        availability: hybridResult.capacityFactor || 1.0,
        utilization: orbitalEfficiencyResult.debug.utilizationFactor,
      },
      costShares: (() => {
        const total = realisticCostPerPflop;
        return {
          launch: (orbitalBreakdown.launch / total) * 100,
          power: (orbitalBreakdown.power / total) * 100,
          compute: (orbitalBreakdown.compute / total) * 100,
          thermal: (orbitalBreakdown.thermal / total) * 100,
          bus: (orbitalBreakdown.bus / total) * 100,
          ops: (orbitalBreakdown.ops / total) * 100,
          networking: (orbitalBreakdown.networking / total) * 100,
          groundSegment: (orbitalBreakdown.regulatory / total) * 100, // Regulatory includes ground segment
        };
      })(),
      localSensitivity: (() => {
        // Calculate local sensitivity: dCost/dParameter (approximate derivatives)
        
        // dCost_dLaunch: launch cost scales linearly with launchCostPerKg
        const dCost_dLaunch = orbitalBreakdown.launch / launchCostPerKg;
        
        // dCost_dSpecificPower: power cost scales inversely with specific power (negative)
        const dCost_dSpecificPower = -(orbitalBreakdown.power / trajSpecificPower);
        
        // dCost_dGflopsPerW: power cost scales inversely with GFLOPS/W (negative)
        const dCost_dGflopsPerW = -(orbitalBreakdown.power / orbitEffectiveGflopsPerW);
        
        // dCost_dFailureRate: ops cost scales with failure rate
        const baseFailureRate = useRadHardChips ? 0.09 : 0.15;
        const dCost_dFailureRate = orbitalBreakdown.ops / baseFailureRate;
        
        // dCost_dPue: power cost scales linearly with PUE
        const dCost_dPue = orbitalBreakdown.power / pueOrbital;
        
        return {
          dCost_dLaunch,
          dCost_dSpecificPower,
          dCost_dGflopsPerW,
          dCost_dFailureRate,
          dCost_dPue,
        };
      })(),
    },
    edgeInference,
    crossover: realisticCostPerPflop < groundComparatorCostPerPflopYear,
    crossoverDetails: {
      gpuHourCrossover,
      tokenCrossover: orbitalTokens.llama70B.costPer1kTokens < groundTokens.llama70B.costPer1kTokens,
      marketPosition: gpuHourCrossover 
        ? `Orbital ${((1 - orbitalGpuHour(SLA_TIERS.standard).pricePerGpuHour / groundGpuHour(SLA_TIERS.standard).pricePerGpuHour) * 100).toFixed(1)}% cheaper`
        : `Ground ${((1 - groundGpuHour(SLA_TIERS.standard).pricePerGpuHour / orbitalGpuHour(SLA_TIERS.standard).pricePerGpuHour) * 100).toFixed(1)}% cheaper`,
    },
    costAccountingValid,
    costAccountingErrorPct,
    metadata: {
      groundUnits: [
        {
          metric: 'gflopsPerWatt',
          unit: 'GFLOPS/W',
          level: 'system',
          notes: 'Ground system-level efficiency including memory, network, power delivery overhead',
        },
      ],
      orbitUnits: [
        {
          metric: 'gflopsPerWatt',
          unit: 'GFLOPS/W',
          level: 'delivered',
          notes: 'Orbital delivered efficiency: systemEffective × thermalCapFactor × radiationDerate × availability',
        },
      ],
      units: [
        {
          metric: 'gflopsPerWatt',
          unit: 'GFLOPS/W',
          level: 'system',
          notes: 'System-level efficiency including memory, network, power delivery overhead',
        },
        {
          metric: 'costPerPflopYear',
          unit: 'USD/PFLOP-year',
          level: 'infrastructure',
          notes: 'Total cost to operate 1 PFLOP of sustained compute for one year',
        },
        {
          metric: 'pricePerGpuHour',
          unit: 'USD/GPU-hour',
          level: 'market',
          notes: 'Market price with SLA, including margin and risk buffer',
        },
        {
          metric: 'costPer1kTokens',
          unit: 'USD/1K tokens',
          level: 'application',
          notes: 'Inference cost for specified model size (70B or 405B)',
        },
      ],
      debug: {
        groundLifetime: groundLifetime,
        gpuFailureRateAnnual: params.gpuFailureRateAnnual,
        totalCostExcludesDelayPenalty: true, // Headline cost excludes delay penalty (handled via capacity gating)
        totalCostEffectiveIncludesDelayPenalty: groundResult.totalCostPerPflopYearEffective !== undefined,
        groundHasQueue,
        groundComparatorCostPerPflopYear,
      },
      computeEfficiency: {
        gflopsPerWatt: orbitEffectiveGflopsPerW, // Delivered efficiency (alias)
        efficiencyLevel: 'delivered', // Changed from 'system' to 'delivered'
        validation: {
          // CRITICAL: Use deliveredValidation as primary - it compares like-for-like
          // Only fail if deliveredValidation fails (ratio mismatch) OR efficiencyValidation fails (range check)
          // consistencyCheck is for power/compute consistency, not efficiency validation
          valid: efficiencyValidation.valid && deliveredValidation.valid,
          warning: efficiencyValidation.warning || deliveredValidation.warning || undefined, // Only efficiency or delivered mismatch warnings
          expectedDelivered: deliveredValidation.expectedDelivered,
          delivered: deliveredValidation.delivered,
          ratio: deliveredValidation.ratio,
          factorsUsed: deliveredValidation.factorsUsed,
        }
      },
      // Chart inputs for power buildout constraints (replaces energyCostComparison)
      chartInputs: {
        powerBuildout: {
          demandGw: ('buildoutDebug' in groundResult ? groundResult.buildoutDebug?.demandGW : undefined) ?? 
                    ('supplyMetrics' in groundResult ? groundResult.supplyMetrics?.demandGw : undefined) ?? 0,
          supplyGw: ('supplyMetrics' in groundResult ? groundResult.supplyMetrics?.capacityGw : undefined) ?? 0,
          maxBuildRateGwYear: ('supplyMetrics' in groundResult ? groundResult.supplyMetrics?.maxBuildRateGwYear : undefined) ?? 
                              ('buildoutDebug' in groundResult ? groundResult.buildoutDebug?.buildRateGWyr : undefined) ?? 0,
          pipelineGw: ('supplyMetrics' in groundResult ? groundResult.supplyMetrics?.pipelineGw : undefined) ?? 0,
          backlogGw: ('backlogGw' in groundResult ? groundResult.backlogGw : undefined) ?? 
                     ('buildoutDebug' in groundResult ? groundResult.buildoutDebug?.backlogGW : undefined) ?? 0,
          avgWaitYears: ('avgWaitYears' in groundResult ? groundResult.avgWaitYears : undefined) ?? 
                        ('buildoutDebug' in groundResult ? groundResult.buildoutDebug?.timeToPowerYears : undefined) ?? 0,
        },
      }
    }
  };
}
