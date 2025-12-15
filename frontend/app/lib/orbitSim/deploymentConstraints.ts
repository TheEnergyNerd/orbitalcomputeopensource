/**
 * Deployment Constraints Module
 * 
 * Implements hard physics/engineering constraints on orbital compute growth:
 * 1. Launch Economics (mass and cost gating)
 * 2. Heat Rejection (utilization ceiling)
 * 3. Autonomous Maintenance (failure accumulation and recovery limits)
 * 4. Spectrum/Downlink Bandwidth (RF spectrum limits)
 */

import type { StrategyMode } from "./satelliteClasses";
import { applySpectrumConstraint } from "./spectrumConstraint";

// ============================================================================
// 1. LAUNCH ECONOMICS CONSTRAINTS
// ============================================================================

export interface LaunchConstraints {
  massLimited: number;  // ΔS_mass(t)
  costLimited: number; // ΔS_cost(t)
  allowed: number;     // ΔS_allowed(t)
}

/**
 * Calculate launch mass budget for a year
 * M_launch_year(t) = launches_per_year(t) × max_payload_per_launch
 */
export function calculateLaunchMassBudget(
  launchesPerYear: number,
  maxPayloadPerLaunchT: number = 100 // Starship capacity ~100t
): number {
  return launchesPerYear * maxPayloadPerLaunchT;
}

/**
 * Calculate per-satellite mass
 * M_sat = M_compute + M_solar + M_radiator + M_structure + M_shielding
 */
export function calculateSatelliteMass(
  satelliteClass: "A" | "B",
  year: number,
  strategy: StrategyMode
): number {
  // Base masses from satelliteClasses.ts
  const baseMassA = 1.2; // tons
  const baseMassB = 2.0; // tons
  
  // Mass components (simplified model)
  const M_compute = satelliteClass === "A" ? 0.3 : 0.8; // Compute hardware
  const M_solar = satelliteClass === "A" ? 0.4 : 0.6;  // Solar arrays
  const M_radiator = satelliteClass === "A" ? 0.2 : 0.4; // Heat rejection
  const M_structure = satelliteClass === "A" ? 0.2 : 0.15; // Structure
  const M_shielding = satelliteClass === "A" ? 0.1 : 0.05; // Radiation shielding
  
  // Strategy adjustments
  let shieldingMultiplier = 1.0;
  let radiatorMultiplier = 1.0;
  
  if (strategy === "COST") {
    // Cost-first: cheaper shielding, smaller radiators
    shieldingMultiplier = 0.8;
    radiatorMultiplier = 0.9;
  } else if (strategy === "CARBON") {
    // Carbon-first: larger radiators for better heat rejection
    radiatorMultiplier = 1.2;
  } else if (strategy === "LATENCY") {
    // Latency-first: minimal mass, tight thermal budgets
    shieldingMultiplier = 0.7;
    radiatorMultiplier = 0.8;
  }
  
  // Tech improvement over time (lighter materials)
  const techFactor = 1.0 - (year - 2025) * 0.01; // 1% lighter per year
  
  const totalMass = (M_compute + M_solar + 
                     M_radiator * radiatorMultiplier + 
                     M_structure + 
                     M_shielding * shieldingMultiplier) * techFactor;
  
  return satelliteClass === "A" 
    ? Math.max(0.8, totalMass) // Minimum 0.8t for Class A
    : Math.max(1.5, totalMass); // Minimum 1.5t for Class B
}

/**
 * Calculate launch cost budget based on strategy
 * Cost-first strategy increases LaunchCapexBudget more than others
 * CRITICAL FIX: Updated to account for higher launch costs ($1,500/kg in 2025)
 */
export function calculateLaunchCostBudget(
  year: number,
  strategy: StrategyMode,
  baseLaunches: number
): number {
  // CRITICAL FIX: Updated base cost to account for $1,500/kg launch costs
  // At $1,500/kg with ~1,600 kg average satellite = $2.4M per satellite
  // At 62 sats/launch = $150M per launch (conservative estimate for 2025)
  // Cost declines over time as launch costs drop, so scale by year
  const yearIndex = year - 2025;
  // Launch cost declines from $1,500/kg to ~$100/kg by 2040 (using plateau model)
  // Rough approximation: cost declines exponentially toward floor
  const baseCost2025 = 150; // $150M per launch in 2025 (accounts for $1,500/kg)
  const floorCost = 10; // $10M per launch floor (when costs reach ~$100/kg)
  const decayRate = 0.203; // Same as launch cost decay rate
  const costPerLaunchM = floorCost + (baseCost2025 - floorCost) * Math.exp(-decayRate * yearIndex);
  
  const totalLaunchCostM = baseLaunches * costPerLaunchM;
  
  // Strategy multipliers for launch budget
  const budgetMultipliers: Record<StrategyMode, number> = {
    COST: 1.5,      // Cost-first: higher launch budget
    LATENCY: 1.1,   // Latency-first: moderate budget
    CARBON: 1.2,    // Carbon-first: good budget
    BALANCED: 1.3,  // Balanced: solid budget
  };
  
  return totalLaunchCostM * budgetMultipliers[strategy];
}

/**
 * Calculate cost per satellite (varies by class and strategy)
 */
export function calculateCostPerSatellite(
  satelliteClass: "A" | "B",
  year: number,
  strategy: StrategyMode
): number {
  const baseCostA = 0.5; // $0.5M per Class A satellite
  const baseCostB = 2.0; // $2.0M per Class B satellite
  
  // Learning curve: costs decrease over time
  const learningFactor = Math.pow(0.95, year - 2025); // 5% cost reduction per year
  
  // Strategy adjustments
  let costMultiplier = 1.0;
  if (strategy === "COST") {
    costMultiplier = 0.8; // Cost-first: cheaper satellites
  } else if (strategy === "LATENCY") {
    costMultiplier = 1.1; // Latency-first: premium for low-latency design
  }
  
  const baseCost = satelliteClass === "A" ? baseCostA : baseCostB;
  return baseCost * learningFactor * costMultiplier;
}

/**
 * Calculate launch-gated satellite deployment limits
 */
export function calculateLaunchConstraints(
  launchesPerYear: number,
  newA: number,
  newB: number,
  year: number,
  strategy: StrategyMode
): LaunchConstraints {
  // Calculate mass budget
  const massBudgetT = calculateLaunchMassBudget(launchesPerYear);
  
  // Calculate per-satellite masses
  const massA = calculateSatelliteMass("A", year, strategy);
  const massB = calculateSatelliteMass("B", year, strategy);
  
  // Mass-limited deployment
  const totalMassNeeded = newA * massA + newB * massB;
  const massLimited = totalMassNeeded <= massBudgetT 
    ? newA + newB 
    : Math.floor(massBudgetT / ((massA + massB) / 2)); // Average mass approximation
  
  // Cost-limited deployment
  // CRITICAL FIX: Cost constraint should not block deployment - deployment happens on growth curve
  // Cost is tracked for the Compute Per Dollar chart, but doesn't gate deployment
  // Only use cost constraint if it's catastrophically over budget (10x), otherwise use mass constraint
  const costBudgetM = calculateLaunchCostBudget(year, strategy, launchesPerYear);
  const costA = calculateCostPerSatellite("A", year, strategy);
  const costB = calculateCostPerSatellite("B", year, strategy);
  const totalCostNeeded = newA * costA + newB * costB;
  const costLimited = totalCostNeeded <= costBudgetM * 10 // Allow 10x over budget before constraining
    ? newA + newB
    : Math.floor(costBudgetM * 10 / ((costA + costB) / 2)); // Average cost approximation
  
  // Final allowed deployment - primarily mass-limited, cost is informational only
  // This allows deployment to proceed on growth curve even when orbital is initially more expensive
  const allowed = massLimited; // Use mass constraint only - cost is tracked but doesn't block deployment
  
  return {
    massLimited,
    costLimited,
    allowed,
  };
}

// ============================================================================
// 2. HEAT REJECTION CONSTRAINTS
// ============================================================================

export interface HeatConstraints {
  utilizationMax: number; // Utilization_max(t) = Q_rad_max(t) / Q_gen(t)
  heatLimited: boolean;  // Whether heat is the limiting factor
  thermalComplexityFactor?: number; // Complexity factor for large radiators
  failureRateMultiplier?: number;   // Failure rate multiplier for complex thermal
  costMultiplier?: number;          // Cost multiplier for complex thermal
}

/**
 * Calculate heat generation per satellite
 * Q_gen = P_compute × (1 - electrical_efficiency)
 */
export function calculateHeatGeneration(
  powerKW: number,
  electricalEfficiency: number = 0.85 // 85% electrical efficiency
): number {
  // FIX: 85% of power becomes heat (not 15%)
  return powerKW * electricalEfficiency; // kW of waste heat (85% of power)
}

/**
 * Calculate maximum radiative heat rejection
 * Q_rad_max = σ × ε × A_radiator × T⁴
 * 
 * Pre-collapsed formula: Q_rad_max = radiator_capacity_factor × radiator_area_m2 × power_scaling
 */
export function calculateMaxHeatRejection(
  satelliteClass: "A" | "B",
  powerKW: number,
  strategy: StrategyMode,
  year: number
): number {
  // Base radiator capacity (kW per m² at operating temperature)
  const STEFAN_BOLTZMANN = 5.67e-8; // W/(m²·K⁴)
  const EMISSIVITY = 0.9; // Typical radiator emissivity
  const OPERATING_TEMP_K = 300; // 27°C operating temperature
  
  // REALITY CHECK: Radiator area per satellite with thermal constraints
  // Body-mounted: max 20 m², Deployable: max 100 m²
  // Start conservative with body-mounted radiators
  const MAX_BODY_MOUNTED_M2 = 20;
  const MAX_DEPLOYABLE_M2 = 100;
  const hasDeployable = year >= 2028;
  const maxRadiatorM2 = hasDeployable ? MAX_DEPLOYABLE_M2 : MAX_BODY_MOUNTED_M2;
  
  let radiatorAreaM2 = satelliteClass === "A" ? 5.0 : 12.0; // m² (initial estimate)
  radiatorAreaM2 = Math.min(radiatorAreaM2, maxRadiatorM2); // Cap at thermal limit
  
  // Strategy adjustments
  if (strategy === "CARBON") {
    radiatorAreaM2 *= 1.3; // Larger radiators for carbon-first
  } else if (strategy === "COST") {
    radiatorAreaM2 *= 0.9; // Smaller radiators for cost-first
  } else if (strategy === "LATENCY") {
    radiatorAreaM2 *= 0.85; // Minimal radiators for latency-first
  }
  
  // Tech improvement: better radiator materials over time
  const techFactor = 1.0 + (year - 2025) * 0.02; // 2% improvement per year
  
  // Calculate max heat rejection (simplified Stefan-Boltzmann)
  const Q_rad_max_W = STEFAN_BOLTZMANN * EMISSIVITY * radiatorAreaM2 * 
                      Math.pow(OPERATING_TEMP_K, 4) * techFactor;
  const Q_rad_max_KW = Q_rad_max_W / 1000;
  
  return Q_rad_max_KW;
}

// ============================================================================
// CHIP TDP CONSTANTS (Per Anno feedback: 500-600W per chip)
// ============================================================================
export const CHIP_TDP_WATTS = 500; // Anno's guidance: 500-600W per chip
export const CHIPS_PER_SATELLITE = 10; // Reasonable for a compute sat
export const CHIP_COMPUTE_TFLOPS = 500; // Space-hardened, ~3-5 year lag from consumer

/**
 * Calculate heat-limited utilization ceiling
 * CRITICAL FIX: Enforce hard ceiling at 100% - utilization can NEVER exceed 100%
 * 
 * Also applies thermal complexity risk factor per Anno feedback:
 * "Radiating surface area is crazy rn. You're implying a very very very complex heat management system."
 */
export function calculateHeatUtilizationCeiling(
  satelliteClass: "A" | "B",
  powerKW: number,
  strategy: StrategyMode,
  year: number
): HeatConstraints {
  const Q_gen = calculateHeatGeneration(powerKW);
  const Q_rad_max = calculateMaxHeatRejection(satelliteClass, powerKW, strategy, year);
  
  // CRITICAL: Utilization can NEVER exceed 100% (physically impossible)
  const utilizationMax = Math.min(1.0, Q_rad_max / Q_gen);
  const heatLimited = utilizationMax < 1.0;
  
  // THERMAL COMPLEXITY RISK FACTOR (per Anno feedback)
  // Large radiators = complex thermal systems = higher failure rate and cost
  const RADIATOR_COMPLEXITY_THRESHOLD_M2 = 50; // m² per satellite
  const radiatorAreaPerSat = calculateMaxHeatRejection(satelliteClass, powerKW, strategy, year) / 0.3; // Approximate area
  let complexityFactor = 1.0;
  let failureRateMultiplier = 1.0;
  let costMultiplier = 1.0;
  
  if (radiatorAreaPerSat > RADIATOR_COMPLEXITY_THRESHOLD_M2) {
    const complexityRatio = radiatorAreaPerSat / RADIATOR_COMPLEXITY_THRESHOLD_M2;
    
    // Increase failure rate for complex thermal systems (10% per complexity unit above threshold)
    failureRateMultiplier = 1 + 0.1 * (complexityRatio - 1);
    
    // Increase cost for complex deployable radiators (20% per complexity unit above threshold)
    costMultiplier = 1 + 0.2 * (complexityRatio - 1);
  }
  
  return {
    utilizationMax,
    heatLimited,
    thermalComplexityFactor: complexityFactor,
    failureRateMultiplier,
    costMultiplier,
  };
}

/**
 * Apply thermal constraint derating to compute
 * CRITICAL FIX: If thermal utilization > 100%, derate compute to what thermal can support
 * Per Anno feedback: "radiator_utilization_percent: 146.3% is physically impossible"
 */
export function applyThermalConstraintDerating(
  computePFLOPs: number,
  heatGenKW: number,
  maxHeatRejectionKW: number
): { deratedComputePFLOPs: number; thermalDerating: number; thermalConstrained: boolean } {
  // Calculate utilization (should never exceed 100%)
  const utilization = maxHeatRejectionKW > 0 ? heatGenKW / maxHeatRejectionKW : 1.0;
  
  // CRITICAL: If utilization > 100%, we MUST derate compute
  if (utilization > 1.0) {
    // Derate compute proportionally to what thermal can support
    const thermalDerating = 1.0 / utilization; // e.g., 146% utilization → 68% derating
    const deratedComputePFLOPs = computePFLOPs * thermalDerating;
    
    return {
      deratedComputePFLOPs,
      thermalDerating,
      thermalConstrained: true,
    };
  }
  
  return {
    deratedComputePFLOPs: computePFLOPs,
    thermalDerating: 1.0,
    thermalConstrained: false,
  };
}

// ============================================================================
// 3. AUTONOMOUS MAINTENANCE CONSTRAINTS
// ============================================================================

export interface MaintenanceConstraints {
  failureRate: number;      // Effective failure rate per year
  failuresThisYear: number; // Number of satellites that fail
  recoverable: number;      // Number that can be recovered
  permanentLoss: number;    // Permanent dead mass
  survivalFraction: number; // Fraction of satellites that survive
}

/**
 * Calculate autonomy level (grows with R&D and time)
 * AutonomyLevel(t+1) = AutonomyLevel(t) × (1 + autonomy_R&D_rate)
 */
export function calculateAutonomyLevel(
  year: number,
  strategy: StrategyMode,
  baseAutonomy: number = 1.0
): number {
  // R&D rate varies by strategy
  const rndRates: Record<StrategyMode, number> = {
    COST: 0.05,      // Cost-first: slower autonomy improvement
    LATENCY: 0.08,   // Latency-first: moderate improvement
    CARBON: 0.10,    // Carbon-first: good improvement
    BALANCED: 0.07,  // Balanced: solid improvement
  };
  
  const rndRate = rndRates[strategy];
  const yearsSinceStart = year - 2025;
  
  // Autonomy grows exponentially with R&D investment
  return baseAutonomy * Math.pow(1 + rndRate, yearsSinceStart);
}

/**
 * Calculate repair capacity per year
 * Only a fraction of failed compute can be recovered per year
 * Early years have very limited repair capacity to allow failures to exceed recoveries
 */
export function calculateRepairCapacity(
  totalSatellites: number,
  year: number,
  strategy: StrategyMode,
  autonomyLevelOverride?: number
): number {
  // CRITICAL FIX: Increase base repair capacity to handle normal failure rates
  // Base failure rate is ~3% per year, so repair capacity should be at least 3-5% to handle it
  // Base repair capacity: starts at 2% and grows with autonomy
  const baseRepairRate = 0.02; // 2% base rate (can handle most normal failures)
  
  // Autonomy improves repair capacity significantly
  // Use override if provided (for scenario modes), otherwise calculate from year/strategy
  const autonomyLevel = autonomyLevelOverride ?? calculateAutonomyLevel(year, strategy);
  // Repair rate grows with autonomy (square root for moderate growth)
  const repairRate = baseRepairRate * Math.sqrt(autonomyLevel);
  
  // Maximum repair capacity: 20% of fleet per year (increased from 10%)
  // This allows the system to handle failure spikes and maintenance overload
  const maxRepairRate = 0.20;
  const effectiveRepairRate = Math.min(repairRate, maxRepairRate);
  
  // Ensure minimum of 1 satellite can be repaired if we have satellites
  const minRepairCapacity = totalSatellites > 0 ? 1 : 0;
  
  return Math.max(minRepairCapacity, Math.floor(totalSatellites * effectiveRepairRate));
}

/**
 * Unrecoverable failure fraction by scenario
 * Not all failures can be recovered - some are catastrophic
 */
const UNRECOVERABLE_FRACTION: Record<string, number> = {
  BASELINE: 0.15,      // 15% of failures are unrecoverable
  ORBITAL_BEAR: 0.35,  // 35% of failures are unrecoverable (poor maintenance)
  ORBITAL_BULL: 0.05,  // 5% of failures are unrecoverable (excellent maintenance)
};

/**
 * Calculate autonomous maintenance constraints
 */
export function calculateMaintenanceConstraints(
  totalSatellites: number,
  year: number,
  strategy: StrategyMode,
  failureRateBaseOverride?: number,
  autonomyLevelOverride?: number,
  scenarioMode?: string
): MaintenanceConstraints {
  // Base failure rate: 2-4% per year per satellite
  // Use override if provided (for scenario modes), otherwise use default
  const baseFailureRate = failureRateBaseOverride ?? 0.03; // 3% average
  
  // Autonomy reduces effective failure rate
  const autonomyLevel = autonomyLevelOverride ?? calculateAutonomyLevel(year, strategy);
  const failureRate = baseFailureRate / Math.max(0.1, autonomyLevel); // Prevent division by zero
  
  // Calculate failures this year
  const failuresThisYear = Math.floor(totalSatellites * failureRate);
  
  // FIX: Not all failures can be recovered - some are catastrophic
  // Get unrecoverable fraction based on scenario
  const scenarioKey = scenarioMode || "BASELINE";
  const unrecoverableFraction = UNRECOVERABLE_FRACTION[scenarioKey] || UNRECOVERABLE_FRACTION.BASELINE;
  const unrecoverableThisYear = Math.floor(failuresThisYear * unrecoverableFraction);
  
  // Calculate recoverable failures (capacity-limited AND scenario-limited)
  const repairCapacity = calculateRepairCapacity(totalSatellites, year, strategy, autonomyLevelOverride);
  const potentiallyRecoverable = failuresThisYear - unrecoverableThisYear;
  const recoverable = Math.min(potentiallyRecoverable, repairCapacity);
  
  // Permanent loss = unrecoverable + (failures - recoverable)
  const permanentLoss = unrecoverableThisYear + Math.max(0, failuresThisYear - recoverable - unrecoverableThisYear);
  
  // Survival fraction (1 - permanent loss rate)
  const survivalFraction = totalSatellites > 0
    ? Math.max(0.1, 1.0 - (permanentLoss / totalSatellites))
    : 1.0;
  
  return {
    failureRate,
    failuresThisYear,
    recoverable,
    permanentLoss,
    survivalFraction: Math.max(0, survivalFraction),
  };
}

// ============================================================================
// 4. COMBINED CONSTRAINT APPLICATION
// ============================================================================

export interface EffectiveComputeResult {
  rawCompute: number;           // Compute_raw(t)
  heatUtilization: number;      // Utilization_heat(t)
  backhaulUtilization: number;  // Utilization_backhaul(t) (assumed 1.0 for now)
  survivalFraction: number;     // Survival_fraction(t)
  effectiveCompute: number;     // Compute_effective(t)
  constraints: {
    launch: LaunchConstraints;
    heat: HeatConstraints;
    maintenance: MaintenanceConstraints;
  };
  // Debug data for ceiling calculations
  ceilings: {
    launchMass: number;         // Maximum satellites allowed by mass
    launchCost: number;         // Maximum satellites allowed by cost
    heat: number;               // Maximum compute allowed by heat rejection
    backhaul: number;           // Maximum compute allowed by backhaul (for now = rawCompute)
    autonomy: number;           // Maximum satellites sustainable by autonomy
    spectrum: number;           // Maximum compute allowed by downlink capacity
  };
  dominantConstraint: "LAUNCH" | "HEAT" | "BACKHAUL" | "AUTONOMY" | "SPECTRUM" | "NONE";
  // Spectrum constraint data
  spectrum?: {
    downlinkCapacityTbps: number;
    downlinkUsedTbps: number;
    downlinkUtilizationPercent: number;
    spectrumConstrained: boolean;
    spectrumDerating: number;
  };
}

/**
 * Calculate effective compute with all physics constraints applied
 * Compute_effective(t) = Compute_raw(t) × Utilization_heat(t) × Utilization_backhaul(t) × Survival_fraction(t)
 */
export function calculateConstrainedEffectiveCompute(
  rawComputePFLOPs: number,
  satelliteCountA: number,
  satelliteCountB: number,
  powerPerA: number,
  powerPerB: number,
  year: number,
  strategy: StrategyMode,
  launchesPerYear: number,
  newA: number,
  newB: number,
  failureRateBaseOverride?: number,
  autonomyLevelOverride?: number,
  scenarioMode?: string
): EffectiveComputeResult {
  // 1. Launch constraints
  const launchConstraints = calculateLaunchConstraints(
    launchesPerYear,
    newA,
    newB,
    year,
    strategy
  );
  
  // 2. Heat constraints (average across Class A and B)
  const heatA = calculateHeatUtilizationCeiling("A", powerPerA, strategy, year);
  const heatB = calculateHeatUtilizationCeiling("B", powerPerB, strategy, year);
  
  // Calculate heat generation and max rejection for thermal derating
  const heatGenA = calculateHeatGeneration(powerPerA);
  const heatGenB = calculateHeatGeneration(powerPerB);
  const maxRejectionA = calculateMaxHeatRejection("A", powerPerA, strategy, year);
  const maxRejectionB = calculateMaxHeatRejection("B", powerPerB, strategy, year);
  
  // CRITICAL FIX: Apply thermal constraint derating if utilization > 100%
  // Per Anno feedback: "radiator_utilization_percent: 146.3% is physically impossible"
  const thermalDeratingA = applyThermalConstraintDerating(
    rawComputePFLOPs * (satelliteCountA / (satelliteCountA + satelliteCountB || 1)),
    heatGenA * satelliteCountA,
    maxRejectionA * satelliteCountA
  );
  const thermalDeratingB = applyThermalConstraintDerating(
    rawComputePFLOPs * (satelliteCountB / (satelliteCountA + satelliteCountB || 1)),
    heatGenB * satelliteCountB,
    maxRejectionB * satelliteCountB
  );
  
  // Weighted average heat utilization (capped at 100%)
  const totalSats = satelliteCountA + satelliteCountB;
  const heatUtilization = totalSats > 0
    ? Math.min(1.0, (satelliteCountA * heatA.utilizationMax + satelliteCountB * heatB.utilizationMax) / totalSats)
    : 1.0;
  
  const heatLimited = heatA.heatLimited || heatB.heatLimited || thermalDeratingA.thermalConstrained || thermalDeratingB.thermalConstrained;
  
  // 3. Maintenance constraints
  const maintenanceConstraints = calculateMaintenanceConstraints(
    totalSats,
    year,
    strategy,
    failureRateBaseOverride,
    autonomyLevelOverride,
    scenarioMode
  );
  
  // 4. Backhaul as hard competing bottleneck (NO STATIC CLAMP)
  // Calculate backhaul capacity dynamically
  const backhaul_tbps = (satelliteCountA + satelliteCountB) * 0.5; // 0.5 TBps per satellite
  const FLOPS_PER_TBPS = 1e15 / 1e12; // 1000 PFLOPs per TBps
  const backhaul_compute_limit = backhaul_tbps * FLOPS_PER_TBPS;
  
  // Backhaul utilization is the ratio of compute to backhaul capacity
  const backhaulUtilization = backhaul_tbps > 0
    ? Math.min(1.0, rawComputePFLOPs / backhaul_compute_limit)
    : 1.0;
  
  // 5. Calculate effective compute with thermal derating applied
  // CRITICAL FIX: Apply thermal derating if utilization > 100%
  const computeAfterThermalDerating = (thermalDeratingA.deratedComputePFLOPs + thermalDeratingB.deratedComputePFLOPs);
  
  // 6. Apply spectrum/downlink constraint (NEW)
  const spectrumResult = applySpectrumConstraint(
    computeAfterThermalDerating,
    year
  );
  
  // Effective compute after all constraints: thermal → spectrum → backhaul → maintenance
  const effectiveCompute = spectrumResult.exportableComputePFLOPs *
    backhaulUtilization *
    maintenanceConstraints.survivalFraction;
  
  // 6. Calculate ceiling values (for debug and visualization)
  const massBudgetT = calculateLaunchMassBudget(launchesPerYear);
  const massA = calculateSatelliteMass("A", year, strategy);
  const massB = calculateSatelliteMass("B", year, strategy);
  const avgMass = (massA + massB) / 2;
  const launchMassCeiling = Math.floor(massBudgetT / avgMass);
  
  const costBudgetM = calculateLaunchCostBudget(year, strategy, launchesPerYear);
  const costA = calculateCostPerSatellite("A", year, strategy);
  const costB = calculateCostPerSatellite("B", year, strategy);
  const avgCost = (costA + costB) / 2;
  const launchCostCeiling = Math.floor(costBudgetM / avgCost);
  
  // Heat ceiling: maximum compute allowed by heat rejection
  // This is the compute that would be available if all satellites were at max heat utilization
  const heatCeiling = rawComputePFLOPs * heatUtilization;
  
  // Backhaul ceiling: maximum compute allowed by backhaul bandwidth
  // Use the backhaul_compute_limit we calculated above
  const backhaulCeiling = backhaul_compute_limit > 0
    ? backhaul_compute_limit
    : rawComputePFLOPs; // Fallback to raw if no satellites
  
  // Autonomy ceiling: maximum satellites sustainable by repair capacity
  const autonomyCeiling = Math.floor(
    maintenanceConstraints.recoverable / (maintenanceConstraints.failureRate || 0.001)
  );
  
  // Spectrum ceiling: maximum compute allowed by downlink capacity
  const spectrumCeiling = spectrumResult.exportableComputePFLOPs;
  
  // Determine dominant constraint
  // The dominant constraint is the one that limits growth the most
  const constraintLimits = {
    LAUNCH: Math.min(launchMassCeiling, launchCostCeiling),
    HEAT: heatCeiling / (rawComputePFLOPs / (satelliteCountA + satelliteCountB || 1)), // Convert to satellite count
    BACKHAUL: backhaulCeiling / (rawComputePFLOPs / (satelliteCountA + satelliteCountB || 1)),
    AUTONOMY: autonomyCeiling,
    SPECTRUM: spectrumCeiling / (rawComputePFLOPs / (satelliteCountA + satelliteCountB || 1)),
  };
  
  // Find the minimum (most limiting) constraint
  const minConstraint = Math.min(
    constraintLimits.LAUNCH,
    constraintLimits.HEAT,
    constraintLimits.BACKHAUL,
    constraintLimits.AUTONOMY,
    constraintLimits.SPECTRUM
  );
  
  let dominantConstraint: "LAUNCH" | "HEAT" | "BACKHAUL" | "AUTONOMY" | "SPECTRUM" | "NONE" = "NONE";
  if (minConstraint === constraintLimits.LAUNCH) {
    dominantConstraint = "LAUNCH";
  } else if (minConstraint === constraintLimits.HEAT) {
    dominantConstraint = "HEAT";
  } else if (minConstraint === constraintLimits.BACKHAUL) {
    dominantConstraint = "BACKHAUL";
  } else if (minConstraint === constraintLimits.AUTONOMY) {
    dominantConstraint = "AUTONOMY";
  } else if (minConstraint === constraintLimits.SPECTRUM) {
    dominantConstraint = "SPECTRUM";
  }
  
  return {
    rawCompute: rawComputePFLOPs,
    heatUtilization,
    backhaulUtilization,
    survivalFraction: maintenanceConstraints.survivalFraction,
    effectiveCompute,
    constraints: {
      launch: launchConstraints,
      heat: {
        utilizationMax: heatUtilization,
        heatLimited,
      },
      maintenance: maintenanceConstraints,
    },
    ceilings: {
      launchMass: launchMassCeiling,
      launchCost: launchCostCeiling,
      heat: heatCeiling,
      backhaul: backhaulCeiling,
      autonomy: autonomyCeiling,
      spectrum: spectrumCeiling,
    },
    dominantConstraint,
    spectrum: {
      downlinkCapacityTbps: spectrumResult.downlinkCapacityTbps,
      downlinkUsedTbps: spectrumResult.downlinkUsedTbps,
      downlinkUtilizationPercent: spectrumResult.downlinkUtilizationPercent,
      spectrumConstrained: spectrumResult.spectrumConstrained,
      spectrumDerating: spectrumResult.spectrumDerating,
    },
  };
}

