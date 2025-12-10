/**
 * Deployment Constraints Module
 * 
 * Implements three hard physics/engineering constraints on orbital compute growth:
 * 1. Launch Economics (mass and cost gating)
 * 2. Heat Rejection (utilization ceiling)
 * 3. Autonomous Maintenance (failure accumulation and recovery limits)
 */

import type { StrategyMode } from "./satelliteClasses";

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
 */
export function calculateLaunchCostBudget(
  year: number,
  strategy: StrategyMode,
  baseLaunches: number
): number {
  const baseCostPerLaunchM = 50; // $50M per launch (Starship target)
  const totalLaunchCostM = baseLaunches * baseCostPerLaunchM;
  
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
  const costBudgetM = calculateLaunchCostBudget(year, strategy, launchesPerYear);
  const costA = calculateCostPerSatellite("A", year, strategy);
  const costB = calculateCostPerSatellite("B", year, strategy);
  const totalCostNeeded = newA * costA + newB * costB;
  const costLimited = totalCostNeeded <= costBudgetM
    ? newA + newB
    : Math.floor(costBudgetM / ((costA + costB) / 2)); // Average cost approximation
  
  // Final allowed deployment (minimum of mass and cost limits)
  const allowed = Math.min(massLimited, costLimited);
  
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
}

/**
 * Calculate heat generation per satellite
 * Q_gen = P_compute × (1 - electrical_efficiency)
 */
export function calculateHeatGeneration(
  powerKW: number,
  electricalEfficiency: number = 0.85 // 85% electrical efficiency
): number {
  return powerKW * (1 - electricalEfficiency); // kW of waste heat
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
  
  // Radiator area per satellite (varies by class and strategy)
  let radiatorAreaM2 = satelliteClass === "A" ? 5.0 : 12.0; // m²
  
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

/**
 * Calculate heat-limited utilization ceiling
 */
export function calculateHeatUtilizationCeiling(
  satelliteClass: "A" | "B",
  powerKW: number,
  strategy: StrategyMode,
  year: number
): HeatConstraints {
  const Q_gen = calculateHeatGeneration(powerKW);
  const Q_rad_max = calculateMaxHeatRejection(satelliteClass, powerKW, strategy, year);
  
  const utilizationMax = Math.min(1.0, Q_rad_max / Q_gen);
  const heatLimited = utilizationMax < 1.0;
  
  return {
    utilizationMax,
    heatLimited,
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
  strategy: StrategyMode
): number {
  // Base repair capacity: starts very low (1% of fleet per year) and grows with autonomy
  const baseRepairRate = 0.01; // 1% base rate (much lower than before)
  
  // Autonomy improves repair capacity, but starts from a low base
  const autonomyLevel = calculateAutonomyLevel(year, strategy);
  // Repair rate grows with autonomy, but more slowly than before
  const repairRate = baseRepairRate * Math.sqrt(autonomyLevel); // Square root growth (slower)
  
  // Maximum repair capacity: 15% of fleet per year (hard limit, reduced from 20%)
  const maxRepairRate = 0.15;
  const effectiveRepairRate = Math.min(repairRate, maxRepairRate);
  
  // Ensure minimum of 1 satellite can be repaired if we have satellites
  const minRepairCapacity = totalSatellites > 0 ? 1 : 0;
  
  return Math.max(minRepairCapacity, Math.floor(totalSatellites * effectiveRepairRate));
}

/**
 * Calculate autonomous maintenance constraints
 */
export function calculateMaintenanceConstraints(
  totalSatellites: number,
  year: number,
  strategy: StrategyMode
): MaintenanceConstraints {
  // Base failure rate: 2-4% per year per satellite
  const baseFailureRate = 0.03; // 3% average
  
  // Autonomy reduces effective failure rate
  const autonomyLevel = calculateAutonomyLevel(year, strategy);
  const failureRate = baseFailureRate / autonomyLevel;
  
  // Calculate failures this year
  const failuresThisYear = Math.floor(totalSatellites * failureRate);
  
  // Calculate recoverable failures
  const repairCapacity = calculateRepairCapacity(totalSatellites, year, strategy);
  const recoverable = Math.min(failuresThisYear, repairCapacity);
  const permanentLoss = Math.max(0, failuresThisYear - recoverable);
  
  // Survival fraction (1 - permanent loss rate)
  const survivalFraction = 1.0 - (permanentLoss / totalSatellites);
  
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
  };
  dominantConstraint: "LAUNCH" | "HEAT" | "BACKHAUL" | "AUTONOMY" | "NONE";
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
  newB: number
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
  
  // Weighted average heat utilization
  const totalSats = satelliteCountA + satelliteCountB;
  const heatUtilization = totalSats > 0
    ? (satelliteCountA * heatA.utilizationMax + satelliteCountB * heatB.utilizationMax) / totalSats
    : 1.0;
  
  const heatLimited = heatA.heatLimited || heatB.heatLimited;
  
  // 3. Maintenance constraints
  const maintenanceConstraints = calculateMaintenanceConstraints(
    totalSats,
    year,
    strategy
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
  
  // 5. Calculate effective compute (thermal throttling already applied in thermal integration)
  // For now, use the old method but this will be replaced by thermal integration
  const effectiveCompute = rawComputePFLOPs *
    heatUtilization *
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
  
  // Determine dominant constraint
  // The dominant constraint is the one that limits growth the most
  const constraintLimits = {
    LAUNCH: Math.min(launchMassCeiling, launchCostCeiling),
    HEAT: heatCeiling / (rawComputePFLOPs / (satelliteCountA + satelliteCountB || 1)), // Convert to satellite count
    BACKHAUL: backhaulCeiling / (rawComputePFLOPs / (satelliteCountA + satelliteCountB || 1)),
    AUTONOMY: autonomyCeiling,
  };
  
  // Find the minimum (most limiting) constraint
  const minConstraint = Math.min(
    constraintLimits.LAUNCH,
    constraintLimits.HEAT,
    constraintLimits.BACKHAUL,
    constraintLimits.AUTONOMY
  );
  
  let dominantConstraint: "LAUNCH" | "HEAT" | "BACKHAUL" | "AUTONOMY" | "NONE" = "NONE";
  if (minConstraint === constraintLimits.LAUNCH) {
    dominantConstraint = "LAUNCH";
  } else if (minConstraint === constraintLimits.HEAT) {
    dominantConstraint = "HEAT";
  } else if (minConstraint === constraintLimits.BACKHAUL) {
    dominantConstraint = "BACKHAUL";
  } else if (minConstraint === constraintLimits.AUTONOMY) {
    dominantConstraint = "AUTONOMY";
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
    },
    dominantConstraint,
  };
}

