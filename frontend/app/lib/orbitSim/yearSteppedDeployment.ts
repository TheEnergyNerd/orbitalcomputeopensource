/**
 * Year-Stepped Deployment Model
 * 
 * Implements deterministic, strategy-aware satellite growth without time-travel.
 * Each year's deployment depends only on:
 * - Previous year's satellite counts
 * - Current year's strategy
 * - Annual launch capacity
 */

import {
  getAnnualLaunchCapacity,
  STRATEGY_GROWTH_MULTIPLIERS,
  getClassBShare,
  getClassACompute,
  getClassAPower,
  getClassBCompute,
  getClassBPower,
  getOrbitAllocation,
  calculateRetirements,
  type StrategyMode,
  type SatelliteClass,
  SAT_A_LIFETIME_Y,
  SAT_B_LIFETIME_Y,
} from "./satelliteClasses";
import type { ScenarioMode } from "./simulationConfig";
import { getScenarioParams, getScenarioKey } from "./scenarioParams";
import { designComputeBus } from "./physics/designBus";
import type { BusPhysicsOutputs } from "./physics/physicsTypes";
import { DEFAULT_ORBIT_ENV } from "./physics/physicsConfig";
import {
  calculateLaunchConstraints,
  calculateConstrainedEffectiveCompute,
  type EffectiveComputeResult,
  calculateSatelliteMass,
  calculateCostPerSatellite,
  calculateMaxHeatRejection,
  calculateHeatGeneration,
  calculateAutonomyLevel,
  calculateRepairCapacity,
  calculateLaunchCostBudget,
} from "./deploymentConstraints";
import {
  initializeThermalState,
  updateThermalState,
  type ThermalState,
} from "./thermalIntegration";
import {
  stepPhysics,
  createPhysicsState,
  type PhysicsState,
  type PhysicsOutput,
} from "./physicsEngine";
import {
  addDebugStateEntry,
  validateState,
  validateStateAcrossYears,
  getDebugState,
  type DebugStateEntry,
} from "./debugState";
import { applyAutoDesignSafety } from "./autoDesignSafety";
import {
  calculateCongestionMetrics,
  getShellCongestion,
  type CongestionMetrics,
} from "./congestionModel";
import { getShellByAltitude, ORBIT_SHELLS } from "./orbitShells";
import { calculateShellCapacity } from "./shellCapacity";
import { getBatterySpec, calculateBatteryRequirements } from "./batteryModel";

// Legacy ScenarioKind type for compatibility (mapped from scenarioKey)
type ScenarioKind = "bear" | "baseline" | "bull";

export interface YearDeploymentState {
  year: number;
  strategy: StrategyMode;
  
  // Class A counts
  S_A: number;
  S_A_lowLEO: number;
  S_A_midLEO: number;
  S_A_sunSync: number;
  
  // Class B counts (always sun-sync)
  S_B: number;
  
  // Deployment history (for retirement calculations)
  deployedByYear_A: Map<number, number>;
  deployedByYear_B: Map<number, number>;
  
  // Aggregate metrics
  totalComputePFLOPs: number;
  totalPowerMW: number;
  
  // Cumulative tracking for survival calculation
  cumulativeSatellitesLaunched?: number;
  cumulativeFailures?: number;
  failuresByYear?: Map<number, number>; // Track failures by year for debris calculation
  
  // Physics state (single source of truth)
  physicsState?: PhysicsState;
  // Thermal state (LEGACY - kept for compatibility)
  thermalState?: import("./thermalIntegration").ThermalState;
}

export interface YearDeploymentResult {
  year: number;
  strategy: StrategyMode;
  
  // New deployments this year
  newA: number;
  newB: number;
  newA_lowLEO: number;
  newA_midLEO: number;
  newA_sunSync: number;
  
  // Total counts after deployment and retirements
  S_A: number;
  S_B: number;
  S_A_lowLEO: number;
  S_A_midLEO: number;
  S_A_sunSync: number;
  S_B_sunSync: number;
  
  // Aggregate metrics
  totalComputePFLOPs: number;
  totalPowerMW: number;
  
  // Effective compute (after constraints)
  effectiveComputePFLOPs: number;
  heatUtilization: number;
  survivalFraction: number;
  
  // Per-satellite metrics
  computePerA: number;
  powerPerA: number;
  computePerB: number;
  powerPerB: number;
  
  // Constraint information
  constraints?: {
    launch: { massLimited: number; costLimited: number; allowed: number };
    heat: { utilizationMax: number; heatLimited: boolean };
    maintenance: { failureRate: number; failuresThisYear: number; recoverable: number; permanentLoss: number; survivalFraction: number };
  };
  
  // Physics state (single source of truth)
  physicsState?: PhysicsState;
  // Thermal state (LEGACY - kept for compatibility)
  thermalState?: ThermalState;
}

const START_YEAR = 2025;

/**
 * Calculate deployment for a single year
 * 
 * @param state Previous year's state
 * @param strategy Strategy for this year (can change mid-run)
 */
export function calculateYearDeployment(
  state: YearDeploymentState,
  strategy: StrategyMode,
  scenarioMode: ScenarioMode = "BASELINE"
): YearDeploymentResult {
  const { year, S_A, S_B, deployedByYear_A, deployedByYear_B } = state;
  
  // 1. Calculate annual launch capacity
  const yearOffset = year - START_YEAR;
  const baseLaunches = getAnnualLaunchCapacity(yearOffset, scenarioMode);
  
  // 2. Apply strategy growth multiplier
  const growthMultiplier = STRATEGY_GROWTH_MULTIPLIERS[strategy];
  const totalLaunches = Math.round(baseLaunches * growthMultiplier);
  
  // 3. Split between Class A and Class B (before constraints)
  const fracB = getClassBShare(strategy, year);
  const newB_target = Math.round(totalLaunches * fracB);
  const newA_target = totalLaunches - newB_target;
  
  // 3.5. APPLY LAUNCH CONSTRAINTS (mass and cost gating)
  const launchConstraints = calculateLaunchConstraints(
    totalLaunches,
    newA_target,
    newB_target,
    year,
    strategy
  );
  
  // Apply launch-gated limits proportionally to A and B
  const totalTarget = newA_target + newB_target;
  const allowedTotal = launchConstraints.allowed;
  const scaleFactor = totalTarget > 0 ? allowedTotal / totalTarget : 0;
  
  const newA = Math.round(newA_target * scaleFactor);
  const newB = Math.round(newB_target * scaleFactor);
  
  // 4. Distribute Class A across orbits based on strategy
  const orbitAlloc = getOrbitAllocation(strategy);
  const newA_lowLEO = Math.round(newA * orbitAlloc.lowLEO);
  const newA_midLEO = Math.round(newA * orbitAlloc.midLEO);
  const newA_sunSync = newA - newA_lowLEO - newA_midLEO; // Remainder to ensure exact count
  
  // 5. Calculate retirements
  const retiredA = calculateRetirements(deployedByYear_A, year, SAT_A_LIFETIME_Y);
  const retiredB = calculateRetirements(deployedByYear_B, year, SAT_B_LIFETIME_Y);
  
  // 6. Update counts (new - retired)
  const satellitesTotal_start = S_A + S_B;
  const launchesThisYear_debug = newA + newB;
  const satellitesRetiredThisYear = retiredA + retiredB;
  
  const S_A_new = Math.max(0, S_A + newA - retiredA);
  const S_B_new = Math.max(0, S_B + newB - retiredB);
  
  const satellitesTotal_after_launches_retirements = S_A_new + S_B_new;
  
  // Update orbit-specific counts (simplified: assume retirements are proportional)
  const S_A_total_prev = state.S_A_lowLEO + state.S_A_midLEO + state.S_A_sunSync;
  const S_A_lowLEO_new = S_A_total_prev > 0
    ? Math.max(0, state.S_A_lowLEO + newA_lowLEO - Math.round(retiredA * (state.S_A_lowLEO / S_A_total_prev)))
    : newA_lowLEO;
  const S_A_midLEO_new = S_A_total_prev > 0
    ? Math.max(0, state.S_A_midLEO + newA_midLEO - Math.round(retiredA * (state.S_A_midLEO / S_A_total_prev)))
    : newA_midLEO;
  const S_A_sunSync_new = S_A_new - S_A_lowLEO_new - S_A_midLEO_new;
  const S_B_sunSync_new = S_B_new; // All Class B are sun-sync
  
  // 7. Calculate tech curves with progress factors
  // Get scenario params (centralized)
  const scenarioParams = getScenarioParams(scenarioMode);
  const scenarioKey = getScenarioKey(scenarioMode);
  const scenarioKind: ScenarioKind = scenarioKey === "orbitalBull" ? "bull" :
                                     scenarioKey === "orbitalBear" ? "bear" :
                                     "baseline";

  const startYear = 2025;
  const yearIndex = year - startYear;

  // Use scenario params for tech growth, launch cost, demand
  const techGrowthPerYear = scenarioParams.techGrowthPerYear;
  const launchCostDeclinePerYear = scenarioParams.launchCostDeclinePerYear;
  const demandGrowthPerYear = scenarioParams.demandGrowthPerYear;
  const amortizationYears = 10; // Keep legacy param for now

  // Exponential in years, not "/5" hacks.
  const techProgressFactor = Math.pow(techGrowthPerYear, yearIndex);
  const launchCostDeclineFactor = Math.pow(launchCostDeclinePerYear, yearIndex);
  const demandGrowthFactor = Math.pow(demandGrowthPerYear, yearIndex);

  // Use scenario parameters (from scenarioParams.ts) instead of hardcoded values
  const failureRateBase = scenarioParams.failureRateBase;
  const autonomyLevel = scenarioParams.autonomyLevel;
  const backhaulPerSatTBps = scenarioParams.backhaulPerSatTBps;
  const launchCarbonPerKg = scenarioParams.launchCarbonPerKg;
  
  // Base compute per satellite (from tech curves)
  const baseComputePerA = getClassACompute(year);
  const baseComputePerB = getClassBCompute(year);
  
  // Apply tech progress (scenario-dependent)
  const computePerA = baseComputePerA * techProgressFactor;
  const computePerB = baseComputePerB * techProgressFactor;
  
  const BASELINE_PFLOPS_PER_KW = 0.0001;
  const LIMIT_PFLOPS_PER_KW_2036 = 0.005;
  const LIMIT_PFLOPS_PER_KW_2040 = 0.01;
  const efficiencySaturation = BASELINE_PFLOPS_PER_KW + (LIMIT_PFLOPS_PER_KW_2040 - BASELINE_PFLOPS_PER_KW) * 
                               (1 - Math.exp(-0.1 * yearIndex));
  const cappedEfficiency = yearIndex < 11 ? Math.min(efficiencySaturation, LIMIT_PFLOPS_PER_KW_2036) : efficiencySaturation;
  
  const baseComputePerKwTflops = cappedEfficiency / 1000;
  const computePerKwGrowth = 1.0;
  const computePerKwTflops = baseComputePerKwTflops;
  let physicsMassPerSatelliteKgA: number;
  let physicsMassPerSatelliteKgB: number;
  let physicsPowerPerSatelliteKw: number;
  let physicsComputeTflopsDerated: number;
  let physicsComputeTflopsNominal: number;
  let modifiedRadiatorAreaPerSat: number;
  let powerGrowthPerYear: number = scenarioParams.powerGrowthPerYear;
  const placeholderBus: BusPhysicsOutputs = {
    orbitEnv: DEFAULT_ORBIT_ENV,
    busPowerKw: 0,
    solarArrayAreaM2: 0,
    radiatorAreaM2: 0,
    solarArrayMassKg: 0,
    radiatorMassKg: 0,
    siliconMassKg: 0,
    structureMassKg: 0,
    shieldingMassKg: 0,
    powerElectronicsMassKg: 0,
    avionicsMassKg: 0,
    batteryMassKg: 0,
    adcsMassKg: 0,
    propulsionMassKg: 0,
    otherMassKg: 0,
    totalMassKg: 0,
    computeTflopsNominal: 0,
    computeTflopsDerated: 0,
    annualFailureProb: 0,
    availability: 0,
  };
  let modifiedBusPhysicsA: BusPhysicsOutputs = placeholderBus;
  let modifiedBusPhysicsB: BusPhysicsOutputs = placeholderBus;
  
  type SandboxOverrides = {
    radiatorArea_m2?: number;
    emissivity?: number;
    busPowerKw?: number;
    radiatorTempC?: number;
    opticalTerminals?: number;
    linkCapacityGbps?: number;
    groundStations?: number;
    mooresLawDoublingYears?: number;
    launchCostPerKg?: number;
    launchCostImprovementRate?: number; // Annual improvement rate (e.g., 0.15 = 15% per year)
    satelliteBaseCost?: number;
    processNode?: number;
    chipTdp?: number;
    radiationHardening?: number;
    memoryPerNode?: number;
    solarEfficiency?: number;
    degradationRate?: number;
    batteryBuffer?: number;
    powerMargin?: number;
    batteryDensity?: number;
    batteryCost?: number;
  };
  let sandboxOverrides: SandboxOverrides | null = null;
  if (typeof window !== 'undefined') {
    const params = (window as { __physicsSandboxParams?: { physicsOverrides?: SandboxOverrides } }).__physicsSandboxParams;
    if (params?.physicsOverrides) {
      sandboxOverrides = params.physicsOverrides;
    }
  }
  const baseMassPerSatKg = 1500.0;
  const basePowerPerSatKw = 150.0; // Starting at 150kW in 2025
  const baseComputeTflopsPerSat = 50.0;
  
  // Power per sat progression: 150kW (2025) → 300kW (2028) → 500kW (2032) → 750kW (2036) → 1000kW (2040)
  const POWER_PROGRESSION: Record<number, number> = {
    2025: 150,
    2028: 300,
    2032: 500,
    2036: 750,
    2040: 1000,
  };
  
  const getBusPower = (year: number): number => {
    // If exact year match, use that value
    if (POWER_PROGRESSION[year]) {
      return POWER_PROGRESSION[year];
    }
    
    // Find surrounding years for interpolation
    const years = Object.keys(POWER_PROGRESSION).map(Number).sort((a, b) => a - b);
    
    if (year <= years[0]) return POWER_PROGRESSION[years[0]];
    if (year >= years[years.length - 1]) return POWER_PROGRESSION[years[years.length - 1]];
    
    let lowerYear = years[0];
    let upperYear = years[years.length - 1];
    
    for (let i = 0; i < years.length - 1; i++) {
      if (year >= years[i] && year <= years[i + 1]) {
        lowerYear = years[i];
        upperYear = years[i + 1];
        break;
      }
    }
    
    // Linear interpolation
    const lower = POWER_PROGRESSION[lowerYear];
    const upper = POWER_PROGRESSION[upperYear];
    const t = (year - lowerYear) / (upperYear - lowerYear);
    
    return lower + (upper - lower) * t;
  };
  
  powerGrowthPerYear = 0.12; // Keep for compatibility
  const massPowerGrowthFactor = Math.pow(1.12, yearIndex);
  
  // FIX: Accelerate compute deflation - change from 1.45x to 1.6x for ORBITAL_BULL
  // Use sandbox Moore's Law if available
  const mooresLawDoublingYears = sandboxOverrides?.mooresLawDoublingYears ?? 2.5;
  const computeGrowthFactor = sandboxOverrides 
    ? Math.pow(2, yearIndex / mooresLawDoublingYears) // Use sandbox Moore's Law
    : (scenarioMode === "ORBITAL_BULL" 
      ? Math.pow(1.6, yearIndex) // 60% annual growth for BULL scenario
      : Math.pow(1.45, yearIndex)); // 45% for others
  
  const massPerSatKg = Math.min(baseMassPerSatKg * massPowerGrowthFactor, 5000.0);
  // Use sandbox power if available, otherwise use progression curve
  const powerPerSatKw = sandboxOverrides?.busPowerKw ?? Math.min(getBusPower(year), 2000.0);
  const computeTflopsPerSat = baseComputeTflopsPerSat * computeGrowthFactor;
  
  physicsMassPerSatelliteKgA = massPerSatKg;
  physicsMassPerSatelliteKgB = massPerSatKg * 0.9;
  physicsPowerPerSatelliteKw = powerPerSatKw;
  physicsComputeTflopsNominal = computeTflopsPerSat;
  physicsComputeTflopsDerated = computeTflopsPerSat * 0.95;
  
  // FIX #2: Radiator sizing using realistic flux limit (0.3 kW/m² for 300K radiator)
  // FIX: 85% of bus power becomes heat (15% is electrical losses)
  const heatGenPerSatKw = powerPerSatKw * 0.85; // 85% of power becomes heat
  
  // Calculate radiator capacity per m² from sandbox if available
  let RADIATOR_FLUX_LIMIT_KW_PER_M2 = 0.3; // Default
  if (sandboxOverrides) {
    const STEFAN_BOLTZMANN = 5.67e-8;
    const T_SINK = 200; // K (deep space)
    const emissivity = sandboxOverrides.emissivity ?? 0.9;
    const T_rad_K = (sandboxOverrides.radiatorTempC ?? 70) + 273.15;
    const heatRejectionPerM2_W = emissivity * STEFAN_BOLTZMANN * 
      (Math.pow(T_rad_K, 4) - Math.pow(T_SINK, 4));
    RADIATOR_FLUX_LIMIT_KW_PER_M2 = heatRejectionPerM2_W / 1000; // Convert to kW
  }
  
  const safety_margin = 1.2;
  // Use sandbox radiator area if specified, otherwise calculate
  modifiedRadiatorAreaPerSat = sandboxOverrides?.radiatorArea_m2 ?? 
    ((heatGenPerSatKw / RADIATOR_FLUX_LIMIT_KW_PER_M2) * safety_margin);
  
  // Calculate solar array mass: ~5 kg/kW (200 W/kg specific power)
  // This matches the designBus.ts calculation: SOLAR_SPECIFIC_MASS_KG_PER_KW = 5
  const solarArrayMassKg = powerPerSatKw * 5.0;
  // Calculate solar array area: power / (solar constant * efficiency)
  // Solar constant: 1361 W/m², panel efficiency: ~30%, so ~450 W/m² effective
  const solarArrayAreaM2 = powerPerSatKw * 1000 / 450; // Convert kW to W, then divide by effective flux
  
  modifiedBusPhysicsA = {
    orbitEnv: DEFAULT_ORBIT_ENV,
    busPowerKw: powerPerSatKw,
    solarArrayAreaM2: solarArrayAreaM2,
    radiatorAreaM2: modifiedRadiatorAreaPerSat,
    solarArrayMassKg: solarArrayMassKg,
    radiatorMassKg: massPerSatKg * 0.3,
    siliconMassKg: massPerSatKg * 0.1,
    structureMassKg: massPerSatKg * 0.1,
    shieldingMassKg: massPerSatKg * 0.05,
    powerElectronicsMassKg: massPerSatKg * 0.05,
    avionicsMassKg: massPerSatKg * 0.08,
    batteryMassKg: massPerSatKg * 0.2,
    adcsMassKg: massPerSatKg * 0.04,
    propulsionMassKg: massPerSatKg * 0.03,
    otherMassKg: massPerSatKg * 0.18,
    totalMassKg: massPerSatKg,
    computeTflopsNominal: computeTflopsPerSat,
    computeTflopsDerated: physicsComputeTflopsDerated,
    annualFailureProb: scenarioMode === "ORBITAL_BEAR" ? 0.05 : scenarioMode === "ORBITAL_BULL" ? 0.005 : 0.01,
    availability: scenarioMode === "ORBITAL_BEAR" ? 0.9 : scenarioMode === "ORBITAL_BULL" ? 0.98 : 0.95,
  };
  modifiedBusPhysicsB = { 
    ...modifiedBusPhysicsA, 
    batteryMassKg: massPerSatKg * 0.15, 
    totalMassKg: physicsMassPerSatelliteKgB 
  };
  
  // All scenarios now use standardized physics (ORBITAL_BULL model)
  // Old broken designComputeBus code removed - all scenarios use hardcoded physics above
  
  const physicsComputePFLOPsDerated = physicsComputeTflopsDerated * 1e3;
  
  // Use sandbox power if available (sandboxOverrides already declared above)
  const powerPerA = sandboxOverrides?.busPowerKw ?? physicsPowerPerSatelliteKw;
  const powerPerB = sandboxOverrides?.busPowerKw ?? physicsPowerPerSatelliteKw;
  
  const computePerA_physics = physicsComputePFLOPsDerated;
  const computePerB_physics = physicsComputePFLOPsDerated;
  
  const actualComputePFLOPs = 
    S_A_new * computePerA_physics + 
    S_B_new * computePerB_physics;
  
  const satellitesTotal_current = S_A_new + S_B_new;
  const computePerSatelliteFlops = physicsComputeTflopsDerated * 1e12;
  const compute_raw_flops_consistent = satellitesTotal_current * computePerSatelliteFlops;
  
  // Power calculation (for display)
  const totalPowerMW = 
    (S_A_new * powerPerA + S_B_new * powerPerB) / 1000;
  
  // Temporary demand for maintenance calculation (will be replaced with proper demand later)
  const tempBaseDemandPFLOPs = 50; // Temporary placeholder for maintenance
  const tempDemandGrowthFactor = Math.pow(1.08, yearIndex);
  const totalComputePFLOPs = tempBaseDemandPFLOPs * tempDemandGrowthFactor;
  
  // FIX: 85% of bus power becomes heat (15% is electrical losses)
  const heatGenPerA_kw = powerPerA * 0.85; // 85% of power becomes heat
  const heatGenPerB_kw = powerPerB * 0.85; // 85% of power becomes heat
  
  // FIX #2: Radiator sizing using realistic flux limit (0.3 kW/m² for 300K radiator)
  // Reuse constants defined above
  const radiatorAreaPerA = (heatGenPerA_kw / RADIATOR_FLUX_LIMIT_KW_PER_M2) * safety_margin;
  const radiatorAreaPerB = (heatGenPerB_kw / RADIATOR_FLUX_LIMIT_KW_PER_M2) * safety_margin;
  
  // Apply strategy adjustments (but keep minimum viable size)
  let strategyMultiplierA = 1.0;
  let strategyMultiplierB = 1.0;
  if (strategy === "CARBON") {
    strategyMultiplierA = 1.3; // Larger radiators for carbon-first
    strategyMultiplierB = 1.3;
  } else if (strategy === "COST") {
    strategyMultiplierA = 0.9; // Smaller radiators for cost-first (but still viable)
    strategyMultiplierB = 0.9;
  } else if (strategy === "LATENCY") {
    strategyMultiplierA = 0.85; // Minimal radiators for latency-first
    strategyMultiplierB = 0.85;
  }
  
  const finalRadiatorAreaPerA = Math.max(radiatorAreaPerA * strategyMultiplierA, 2.0);
  const finalRadiatorAreaPerB = Math.max(radiatorAreaPerB * strategyMultiplierB, 5.0);
  
  const power_total_kw_raw = satellitesTotal_current * physicsPowerPerSatelliteKw;
  const power_total_kw = power_total_kw_raw;
  const compute_raw_flops = satellitesTotal_current * physicsComputeTflopsDerated * 1e12;
  
  let finalRadiatorAreaPerA_modified: number;
  let finalRadiatorAreaPerB_modified: number;
  if (scenarioMode === "ORBITAL_BULL") {
    finalRadiatorAreaPerA_modified = Math.max(modifiedRadiatorAreaPerSat * strategyMultiplierA, 2.0);
    finalRadiatorAreaPerB_modified = Math.max(modifiedRadiatorAreaPerSat * strategyMultiplierB, 5.0);
  } else {
    finalRadiatorAreaPerA_modified = Math.max(finalRadiatorAreaPerA * strategyMultiplierA, 2.0);
    finalRadiatorAreaPerB_modified = Math.max(finalRadiatorAreaPerB * strategyMultiplierB, 5.0);
  }
  const radiatorArea_m2 = (S_A_new * finalRadiatorAreaPerA_modified + S_B_new * finalRadiatorAreaPerB_modified);
  
  const backhaul_capacity_tbps = (S_A_new + S_B_new) * backhaulPerSatTBps;
  const maintenance_capacity_pods = Math.max(50, (S_A_new + S_B_new) * 0.05);
  
  // Determine orbital shell for radiation flux calculation
  // Use the dominant shell (most satellites)
  let dominantShell = "lowLEO"; // Default
  if (S_A_lowLEO_new + S_A_midLEO_new + S_A_sunSync_new > 0) {
    const lowLEO_count = S_A_lowLEO_new;
    const midLEO_count = S_A_midLEO_new;
    const sunSync_count = S_A_sunSync_new + S_B_new; // Class B are all sun-sync
    
    if (sunSync_count >= lowLEO_count && sunSync_count >= midLEO_count) {
      dominantShell = "sunSync";
    } else if (midLEO_count >= lowLEO_count) {
      dominantShell = "midLEO";
    } else {
      dominantShell = "lowLEO";
    }
  }
  
  let physicsState: PhysicsState;
  if (state.physicsState && year > 2025) {
    let reset_temp = false;
    if (state.physicsState.survival_fraction < 0.2 || (S_A + S_B) === 0) {
      reset_temp = true;
    }
    
    physicsState = {
      ...state.physicsState,
      power_total_kw,
      compute_raw_flops,
      radiatorArea_m2,
      backhaul_capacity_tbps,
      maintenance_capacity_pods,
      temp_core_C: reset_temp ? 70 : state.physicsState.temp_core_C,
      survival_fraction: reset_temp ? 1.0 : state.physicsState.survival_fraction,
      orbitalShell: dominantShell,
    };
  } else {
    // Check for physics sandbox overrides
    let sandboxOverrides: any = null;
    if (typeof window !== 'undefined' && (window as any).__physicsSandboxParams?.physicsOverrides) {
      sandboxOverrides = (window as any).__physicsSandboxParams.physicsOverrides;
    }
    
    // Use sandbox overrides if available, otherwise use defaults
    const emissivity = sandboxOverrides?.emissivity ?? 0.9;
    const temp_core_C = sandboxOverrides?.radiatorTempC ?? 70;
    
    // Calculate radiator_kw_per_m2 from sandbox params if available
    // Using Stefan-Boltzmann: q = εσ(T⁴ - T_sink⁴)
    let radiator_kw_per_m2 = 0.3; // Default
    if (sandboxOverrides) {
      const STEFAN_BOLTZMANN = 5.67e-8;
      const T_SINK = 200; // K (deep space)
      const T_rad_K = (sandboxOverrides.radiatorTempC || temp_core_C) + 273.15;
      const heatRejectionPerM2_W = emissivity * STEFAN_BOLTZMANN * 
        (Math.pow(T_rad_K, 4) - Math.pow(T_SINK, 4));
      radiator_kw_per_m2 = heatRejectionPerM2_W / 1000; // Convert to kW
    }
    
    // Override radiator area if sandbox specifies it
    const effectiveRadiatorArea = sandboxOverrides?.radiatorArea_m2 ?? radiatorArea_m2;
    
    // Override power if sandbox specifies it (but keep compute calculation)
    const effectivePowerKw = sandboxOverrides?.busPowerKw ?? power_total_kw;
    
    physicsState = createPhysicsState(
      effectivePowerKw,
      compute_raw_flops,
      effectiveRadiatorArea,
      backhaul_capacity_tbps,
      maintenance_capacity_pods,
      {
        electrical_efficiency: 0.85,
        radiator_kw_per_m2: radiator_kw_per_m2,
        emissivity: emissivity,
        eclipse_fraction: 0.1,
        shadowing_loss: 0.05,
        thermal_mass_J_per_C: 2e6,
        temp_core_C: temp_core_C,
        auto_design_mode: false,
        risk_mode: "SAFE",
      }
    );
  }
  
  const satellite_count = S_A_new + S_B_new;
  
  const physicsOutput = stepPhysics(physicsState, satellite_count, scenarioMode);
  
  const computeExportablePF = physicsOutput.compute_exportable_flops;
  
  // Calculate maintenance overload BEFORE applying survival multiplier
  // Get actual satellite failures from constraints calculation (needed for maintenance)
  const effectiveComputeResult = calculateConstrainedEffectiveCompute(
    totalComputePFLOPs,
    S_A_new,
    S_B_new,
    powerPerA,
    powerPerB,
    year,
    strategy,
    totalLaunches,
    newA,
    newB,
    failureRateBase,
    autonomyLevel,
    scenarioMode
  );
  
  const satellitesFailed = effectiveComputeResult.constraints.maintenance.failuresThisYear;
  const satellitesRecovered = effectiveComputeResult.constraints.maintenance.recoverable;
  const satellitesFailedThisYear = satellitesFailed;
  const satellitesRecoveredThisYear = satellitesRecovered;
  
  // FIX: Calculate unrecoverable failures based on scenario
  // This ensures survival fraction shows realistic decay
  const unrecoverableThisYear = satellitesFailed - satellitesRecovered;
  // CRITICAL FIX: maintenance_used_pods must be >= satellitesRecovered (recovery consumes resources)
  // Each recovered satellite requires at least 1 maintenance pod
  const maintenance_used_pods = Math.max(satellitesRecovered, satellitesFailed - satellitesRecovered);
  const repairCapacity = calculateRepairCapacity(S_A_new + S_B_new, year, strategy);
  
  // MAINTENANCE MUST AFFECT SURVIVAL
  // Calculate maintenance utilization and apply penalty
  // CRITICAL FIX: Cap utilization at 100% (physical limit)
  // Utilization = actual work done / capacity, not demand / capacity
  // If demand > capacity, utilization is 100% and there's a backlog
  const total_maintenance_workload = satellitesFailed; // Total failures need maintenance attention
  const maintenance_utilization_percent = repairCapacity > 0 
    ? Math.min(100, Math.max(0, 100 * total_maintenance_workload / repairCapacity)) // CRITICAL: Cap at 100%
    : 0;
  
  // Debug logging removed for production
  
  let final_survival_fraction = physicsOutput.survival_fraction;
  if (maintenance_utilization_percent > 100 && final_survival_fraction > 0) {
    const overload = maintenance_utilization_percent / 100;
    // CRITICAL FIX: Reduce penalty severity - maintenance overload shouldn't kill the fleet
    // Use a gentler exponential decay: exp(-0.1 * overload) instead of exp(-0.25 * overload)
    // This means at 200% utilization, survival = exp(-0.2) ≈ 0.82 (18% reduction) instead of 0.61 (39% reduction)
    final_survival_fraction *= Math.exp(-0.1 * overload);
    
    // CRITICAL FIX: Respect risk mode minimums and scenario-specific survival rates
    // BASELINE: minimum 0.95 (95%)
    // ORBITAL_BULL: minimum 0.98 (98%)
    // ORBITAL_BEAR: minimum 0.92 (92%)
    // AGGRESSIVE mode: minimum 0.1 (10%)
    // YOLO mode: can reach 0.0 (fleet can die)
    const isYoloMode = physicsState.risk_mode === "YOLO";
    const isSafeMode = physicsState.risk_mode === "SAFE";
    if (isSafeMode) {
      // Scenario-specific survival rates
      const minSurvival = scenarioMode === "ORBITAL_BULL" ? 0.98 : 
                         scenarioMode === "ORBITAL_BEAR" ? 0.92 : 
                         0.95; // BASELINE
      final_survival_fraction = Math.max(minSurvival, final_survival_fraction);
    } else if (!isYoloMode) {
      // AGGRESSIVE mode: minimum 0.1
      final_survival_fraction = Math.max(0.1, final_survival_fraction);
    }
    // YOLO mode: no minimum (can reach 0.0)
  }
  
  // DEBUG: Log why survival_fraction is 0
  if (final_survival_fraction === 0 && year >= 2040) {
    console.error(`[DEBUG SURVIVAL FRACTION] Year ${year} - survival_fraction is 0:`, {
      year,
      physics_survival_fraction: physicsOutput.survival_fraction,
      maintenance_utilization_percent,
      temp_core_C: physicsOutput.temp_core_C,
      temp_above_450: physicsOutput.temp_core_C > 450,
      heatGen_kw: physicsOutput.heatGen_kw,
      heatReject_kw: physicsOutput.heatReject_kw,
      radiator_utilization: physicsOutput.radiator_utilization,
      radiator_capacity_kw: physicsOutput.radiator_capacity_kw,
      power_total_kw: physicsState.power_total_kw,
      radiatorArea_m2: physicsState.radiatorArea_m2,
      satellitesTotal: S_A_new + S_B_new,
      S_A_new,
      S_B_new,
    });
  }
  
  // RULE 1: SURVIVAL IS A HARD MULTIPLIER (END OF TICK)
  // Every year AFTER survival_fraction updates (now includes maintenance penalty):
  let final_S_A_new = S_A_new;
  let final_S_B_new = S_B_new;
  let final_S_A_lowLEO_new = S_A_lowLEO_new;
  let final_S_A_midLEO_new = S_A_midLEO_new;
  let final_S_A_sunSync_new = S_A_sunSync_new;
  let final_S_B_sunSync_new = S_B_sunSync_new;
  let final_totalLaunches = totalLaunches;
  let final_newA = newA;
  let final_newB = newB;
  let final_radiatorArea_m2 = radiatorArea_m2;

  // DEBUG: Assert state transition correctness BEFORE survival is applied
  // NOTE: Failures and recoveries affect survival_fraction, not the raw count at this stage
  // The count after launches/retirements should be: start + launches - retired
  // Failures are handled via survival_fraction multiplication later
  const expected_end_before_survival = satellitesTotal_start + launchesThisYear_debug - satellitesRetiredThisYear;
  const actual_end_before_survival = satellitesTotal_after_launches_retirements;
  
  // The issue: survival_fraction is being applied AFTER the transition
  // This means: satellitesTotal_end = (satellitesTotal_start + launches - retired) * survival_fraction
  // But failures/recoveries affect survival_fraction, not the raw count
  // NOTE: Allow up to 1.0 difference due to rounding in orbit allocation calculations
  const difference = Math.abs(actual_end_before_survival - expected_end_before_survival);
  if (difference > 1.0) {
    console.error(`[DEBUG SATELLITE STATE TRANSITION] Year ${year} - ASSERTION FAILED:`, {
      satellitesTotal_start,
      launchesThisYear: launchesThisYear_debug,
      satellitesRetiredThisYear,
      satellitesFailedThisYear,
      satellitesRecoveredThisYear,
      survival_fraction: final_survival_fraction,
      satellitesTotal_after_launches_retirements: actual_end_before_survival,
      expected_end_before_survival,
      difference: actual_end_before_survival - expected_end_before_survival,
      S_A_start: S_A,
      S_B_start: S_B,
      newA,
      newB,
      retiredA,
      retiredB,
      S_A_new,
      S_B_new,
      // Show the calculation breakdown
      calculation: `${satellitesTotal_start} + ${launchesThisYear_debug} - ${satellitesRetiredThisYear} = ${expected_end_before_survival}`,
      actual: `${S_A_new} + ${S_B_new} = ${actual_end_before_survival}`,
    });
    throw new Error(`[DEBUG SATELLITE STATE TRANSITION] Year ${year}: satellitesTotal_after_launches_retirements (${actual_end_before_survival}) != expected (${expected_end_before_survival}). Difference: ${actual_end_before_survival - expected_end_before_survival}`);
  } else if (difference > 0.5) {
    // Log warning for rounding differences (0.5-1.0), but don't throw
    console.warn(`[DEBUG SATELLITE STATE TRANSITION] Year ${year} - Rounding difference: ${difference.toFixed(2)} (expected: ${expected_end_before_survival}, actual: ${actual_end_before_survival})`);
  }
  
  // CRITICAL FIX: Calculate survival fraction from cumulative failures
  // survival_fraction = 1 - (cumulativeFailures / cumulativeSatellitesLaunched)
  // Track cumulative values across years
  const cumulativeSatellitesLaunched = (state.cumulativeSatellitesLaunched || 0) + launchesThisYear_debug;
  const cumulativeFailures = (state.cumulativeFailures || 0) + satellitesFailedThisYear - satellitesRecoveredThisYear;
  
  // CRITICAL FIX: Recalculate survival_fraction from cumulative data
  // This ensures survival tracks actual fleet state, not just physics model
  const survival_from_cumulative = cumulativeSatellitesLaunched > 0
    ? Math.max(0.1, 1 - (cumulativeFailures / cumulativeSatellitesLaunched))
    : 1.0;
  
  // Blend physics-based survival with cumulative-based survival
  // 70% physics model, 30% cumulative tracking (as per audit recommendation)
  const blended_survival_fraction = 0.7 * final_survival_fraction + 0.3 * survival_from_cumulative;
  final_survival_fraction = Math.max(0.1, Math.min(1.0, blended_survival_fraction));
  
  // CRITICAL FIX: survival_fraction should never be 0 (minimum 0.1)
  // Apply survival fraction multiplier (always > 0 now)
  final_S_A_new = Math.floor(S_A_new * final_survival_fraction);
  final_S_B_new = Math.floor(S_B_new * final_survival_fraction);
  final_S_A_lowLEO_new = Math.floor(S_A_lowLEO_new * final_survival_fraction);
  final_S_A_midLEO_new = Math.floor(S_A_midLEO_new * final_survival_fraction);
  final_S_A_sunSync_new = Math.floor(S_A_sunSync_new * final_survival_fraction);
  final_S_B_sunSync_new = Math.floor(S_B_sunSync_new * final_survival_fraction);
  final_radiatorArea_m2 = radiatorArea_m2 * final_survival_fraction;
  // Launches are not multiplied - they represent new deployments, not existing fleet
  
  // DEBUG: Log the transition for debugging (after survival is applied)
  const satellitesTotal_end = final_S_A_new + final_S_B_new;
  
  // Assert final state: satellitesTotal_end should equal (start + launches - retired - failed + recovered) * survival_fraction
  // OR: satellitesTotal_end should equal (start + launches - retired) * survival_fraction (if failures are handled via survival)
  const expected_end_after_survival = Math.floor(actual_end_before_survival * final_survival_fraction);
  
  if (Math.abs(satellitesTotal_end - expected_end_after_survival) > 0.1 && final_survival_fraction > 0) {
    console.error(`[DEBUG SATELLITE STATE TRANSITION] Year ${year} - FINAL STATE ASSERTION FAILED:`, {
      satellitesTotal_start,
      launchesThisYear: launchesThisYear_debug,
      satellitesRetiredThisYear,
      satellitesFailedThisYear,
      satellitesRecoveredThisYear,
      survival_fraction: final_survival_fraction,
      satellitesTotal_after_launches_retirements: actual_end_before_survival,
      satellitesTotal_end,
      expected_end_after_survival,
      difference: satellitesTotal_end - expected_end_after_survival,
      S_A_start: S_A,
      S_B_start: S_B,
      newA,
      newB,
      retiredA,
      retiredB,
      S_A_new,
      S_B_new,
      final_S_A_new,
      final_S_B_new,
    });
    // Don't throw here - just log, as this might be expected behavior
  }
  
  // Debug logging removed for production
  
  // Update physics state for next year
  // NOTE: survival_fraction should never be 0 now (minimum 0.1), so no special reset needed
  let next_temp_core_C = physicsOutput.temp_core_C;
  
  // If survival is very low (< 0.2), gradually cool down to allow recovery
  const MAX_TEMP_SOFT_C = 90; // Soft temperature limit (same as physics engine)
  if (final_survival_fraction < 0.2 && next_temp_core_C > MAX_TEMP_SOFT_C) {
    // Gradually reduce temperature when survival is critically low
    const cooling_rate = 0.1; // 10% reduction per year
    next_temp_core_C = Math.max(MAX_TEMP_SOFT_C, next_temp_core_C * (1 - cooling_rate));
    // Debug logging removed for production
  }
  
  const nextPhysicsState: PhysicsState = {
    ...physicsState,
    power_total_kw: power_total_kw_raw, // Raw capacity (satellitesTotal * bus_power_kw), not survival-adjusted
    compute_raw_flops: physicsOutput.compute_raw_flops, // Already multiplied by survival in physics
    radiatorArea_m2: final_radiatorArea_m2, // RULE 1: multiplied by survival
    emissivity: physicsOutput.radiator_utilization > 1.0 ? physicsState.emissivity * 0.995 : physicsState.emissivity,
    temp_core_C: next_temp_core_C, // CRITICAL FIX: Reset if fleet died
    degraded_pods: physicsOutput.degraded_pods,
    failures_unrecovered: physicsOutput.failures_unrecovered,
    survival_fraction: final_survival_fraction,
    thermal_mass_J_per_C: Math.max((final_S_A_new + final_S_B_new) * 5e8, 1e8), // RULE 2: cannot be zero
  };
  
  // RULE 4: EXPORTABLE COMPUTE IS THE ONLY REAL COMPUTE
  // CRITICAL FIX: compute_exportable_flops is already in PFLOPs, don't divide by 1e15
  const thermalEffectiveComputePFLOPs = computeExportablePF; // Already in PFLOPs
  
  // effectiveComputeResult already calculated above for maintenance
  // Override effective compute with thermal-integrated value
  const finalEffectiveCompute = thermalEffectiveComputePFLOPs;
  
  // 9. Collect debug state
  // CRITICAL FIX: Use physics-based masses instead of hardcoded values
  // Economics should be derived from physics, not independent estimates
  const massA = physicsMassPerSatelliteKgA / 1000; // Convert kg to tons for compatibility
  const massB = physicsMassPerSatelliteKgB / 1000; // Convert kg to tons for compatibility
  
  // CRITICAL FIX: Derive costs from physics-based components
  // Economic audit: Class A ~$3.0M, Class B ~$2.9M per satellite (radiator dominates at $1.9M)
  // Cost = Battery + Radiator + Launch adder
  // Battery: $1,000/kWh × capacity_kWh
  // Radiator: $500/kg × radiator_mass_kg
  // Launch: launch_cost_per_kg × (battery_mass + radiator_mass)
  const BATTERY_COST_PER_KWH = 1000; // $/kWh
  const RADIATOR_COST_PER_KG = 500; // $/kg
  // Note: Use sandbox override if available, otherwise use base cost
  // The actual cost_per_kg_to_leo is calculated later and will also respect sandbox override
  const BASE_LAUNCH_COST_PER_KG = sandboxOverrides?.launchCostPerKg ?? 200; // $/kg (Starship optimistic)
  
  // Calculate battery capacity from mass (200 Wh/kg = 0.2 kWh/kg)
  const batteryMassA_kg = scenarioMode === "ORBITAL_BULL"
    ? physicsMassPerSatelliteKgA * 0.2 // Estimate: ~20% of total mass is battery for Class A
    : modifiedBusPhysicsA.batteryMassKg;
  const batteryMassB_kg = scenarioMode === "ORBITAL_BULL"
    ? physicsMassPerSatelliteKgB * 0.15 // Estimate: ~15% of total mass is battery for Class B
    : modifiedBusPhysicsB.batteryMassKg;
  const radiatorMassA_kg = scenarioMode === "ORBITAL_BULL"
    ? physicsMassPerSatelliteKgA * 0.3 // Estimate: ~30% of total mass is radiator
    : modifiedBusPhysicsA.radiatorMassKg;
  const radiatorMassB_kg = scenarioMode === "ORBITAL_BULL"
    ? physicsMassPerSatelliteKgB * 0.3 // Estimate: ~30% of total mass is radiator
    : modifiedBusPhysicsB.radiatorMassKg;
  
  const batteryCapacityA_kWh = batteryMassA_kg * 0.2;
  const batteryCapacityB_kWh = batteryMassB_kg * 0.2;
  
  // Class A cost: Battery + Radiator + Launch adder + Battery Tax
  const batteryCostA = batteryCapacityA_kWh * BATTERY_COST_PER_KWH;
  const radiatorCostA = radiatorMassA_kg * RADIATOR_COST_PER_KG;
  const launchAdderA = (batteryMassA_kg + radiatorMassA_kg) * BASE_LAUNCH_COST_PER_KG;
  const batteryTaxA = 150_000; // $150k for eclipse batteries (150 kWh @ $1k/kWh)
  const costA = (batteryCostA + radiatorCostA + launchAdderA + batteryTaxA) / 1e6; // Convert to millions
  
  // Class B cost: Battery + Radiator + Launch adder + Battery Tax (smaller battery)
  const batteryCostB = batteryCapacityB_kWh * BATTERY_COST_PER_KWH;
  const radiatorCostB = radiatorMassB_kg * RADIATOR_COST_PER_KG;
  const launchAdderB = (batteryMassB_kg + radiatorMassB_kg) * BASE_LAUNCH_COST_PER_KG;
  const batteryTaxB = 10_000; // $10k for safe mode batteries (10 kWh)
  const costB = (batteryCostB + radiatorCostB + launchAdderB + batteryTaxB) / 1e6; // Convert to millions
  // FIX: Heat generation is 85% of power (not 10%)
  const heatGenA = calculateHeatGeneration(powerPerA); // Returns powerPerA * 0.85
  const heatGenB = calculateHeatGeneration(powerPerB); // Returns powerPerB * 0.85
  // FIX: Heat rejection equals heat generation in steady state (not 10×)
  const heatRejectA = heatGenA; // Steady state: heatReject = heatGen
  const heatRejectB = heatGenB; // Steady state: heatReject = heatGen
  // autonomyLevel already set from scenario mode above
  // repairCapacity already calculated above for maintenance
  
  // Calculate additional values for new debug fields (RULE 1: use survival-adjusted counts)
  const classA_compute_raw = final_S_A_new * computePerA; // PFLOPs
  const classB_compute_raw = final_S_B_new * computePerB; // PFLOPs
  const classA_power_kw = final_S_A_new * powerPerA;
  const classB_power_kw = final_S_B_new * powerPerB;
  
  // Calculate total power in TWh for cost calculations
  // Convert kW to TWh: 1 kW * 8760 hours/year = 8760 kWh = 0.00876 TWh
  const totalPowerTwh = (classA_power_kw + classB_power_kw) * 8760 / 1e9; // kW * hours/year / (kWh to TWh conversion)
  
  // Backhaul utilization from physics
  const backhaul_used_tbps_from_physics = physicsOutput.compute_exportable_flops / (1e15 / 1e12);
  const utilization_backhaul_raw = backhaul_capacity_tbps > 0
    ? Math.min(1.0, backhaul_used_tbps_from_physics / backhaul_capacity_tbps)
    : 1.0;
  
  // Maintenance debt (cumulative unrecovered failures)
  // Get previous entry for same scenario
  const previousEntryKey = year > 2025 ? `${year - 1}_${scenarioMode}` : null;
  const previousEntry = previousEntryKey ? (getDebugState()[previousEntryKey] as DebugStateEntry | undefined) : undefined;
  const maintenance_debt_prev = previousEntry?.maintenance_debt || 0;
  // FIX: Use actual unrecoverable failures from maintenance constraints, not just physics output
  const failures_unrecovered_this_year = unrecoverableThisYear;
  const maintenance_debt = maintenance_debt_prev + failures_unrecovered_this_year;
  
  // satellitesFailed, satellitesRecovered, and maintenance_used_pods already calculated above for maintenance penalty
  
  // Thermal reality from physics
  const avgRadiatorArea = physicsState.radiatorArea_m2 / (S_A_new + S_B_new || 1);
  const physics_radiator_kw_per_m2 = physicsState.radiator_kw_per_m2;
  
  // Legacy backhaul calculations for compatibility
  // CRITICAL FIX: Use same backhaul capacity as physics state (0.5 TBps = 500 Gbps per satellite)
  const backhaul_bw_per_PFLOP = 10; // Gbps per PFLOP
  const backhaul_bandwidth_used = totalComputePFLOPs * backhaul_bw_per_PFLOP; // Gbps
  const backhaul_capacity_factor = S_A_lowLEO_new > 0 && S_A_midLEO_new > 0 ? 1.0 : 0.7;
  const backhaul_bandwidth_total = backhaul_capacity_tbps * 1000 * backhaul_capacity_factor; // Convert TBps to Gbps, then scale
  
  // Launch economics
  const payload_per_launch_tons = 100; // Starship capacity
  const launches_per_year = totalLaunches;
  const launchBudgetM = calculateLaunchCostBudget(year, strategy, totalLaunches);
  
  // Retirement physics
  const retirements_by_lifetime = retiredA + retiredB; // All retirements are by lifetime currently
  const retirements_by_failure = 0; // Not currently tracked separately
  
  // Strategy effects
  const strategy_growth_target = totalLaunches; // Target satellites per year
  const strategy_launch_budget_multipliers: Record<StrategyMode, number> = {
    COST: 1.5,
    LATENCY: 1.1,
    CARBON: 1.2,
    BALANCED: 1.3,
  };
  const strategy_launch_budget_multiplier = strategy_launch_budget_multipliers[strategy];
  const strategy_RnD_autonomy_rates: Record<StrategyMode, number> = {
    COST: 0.05,
    LATENCY: 0.08,
    CARBON: 0.10,
    BALANCED: 0.07,
  };
  const strategy_RnD_autonomy_bias = strategy_RnD_autonomy_rates[strategy];
  const strategy_radiator_mass_biases: Record<StrategyMode, number> = {
    COST: 0.9,
    LATENCY: 0.8,
    CARBON: 1.2,
    BALANCED: 1.0,
  };
  const strategy_radiator_mass_bias = strategy_radiator_mass_biases[strategy];
  
  // Carbon & Cost crossover (MUST depend on launch mass, replacement cadence, radiator mass)
  // NOT static constants
  
  // Calculate replacement cadence (satellites replaced per year) (RULE 1: use survival-adjusted counts)
  const replacementCadence = retiredA + retiredB + effectiveComputeResult.constraints.maintenance.permanentLoss;
  const replacementRate = (final_S_A_new + final_S_B_new) > 0 ? replacementCadence / (final_S_A_new + final_S_B_new) : 0;
  
  // Calculate total radiator mass (from thermal state) (RULE 1: use survival-adjusted counts)
  // CRITICAL FIX: Use actual bus radiator mass per satellite, not area-based calculation
  // Per audit: Realistic radiators are 5-15 kg/m², not 127 kg/m²
  // Use the physics-based radiator mass from modifiedBusPhysics
  // CRITICAL FIX: Radiator mass is same for both classes (thermal system is independent of orbit)
  const totalRadiatorMassKg = (final_S_A_new + final_S_B_new) * modifiedBusPhysicsA.radiatorMassKg;
  
  // Carbon calculation: depends on launch mass and replacement cadence
  // Launch carbon: scenario-dependent kg CO2 per kg to LEO (includes manufacturing)
  // Note: totalLaunchMassKg will be calculated in the cost section below
  // For now, use launches for carbon calculation
  const launchMassForCarbonKg = launches_per_year * payload_per_launch_tons * 1000;
  const launchCarbonKg = launchMassForCarbonKg * launchCarbonPerKg;
  // Replacement carbon: higher replacement cadence = more carbon
  // CRITICAL FIX: Use actual bus radiator mass per satellite from physics model
  // CRITICAL FIX: Radiator mass is same for both classes
  const avgRadiatorMassPerSat = modifiedBusPhysicsA.radiatorMassKg; // Use physics-based radiator mass (same for A and B)
  const replacementCarbonKg = replacementCadence * avgRadiatorMassPerSat * launchCarbonPerKg; // Carbon per replacement (already in kg, no need to multiply by 1000)
  const totalOrbitalCarbonKg = launchCarbonKg + replacementCarbonKg;
  
  // Helper function for sanity clamping
  function sane(x: number, maxAbs: number): number {
    if (!Number.isFinite(x)) return maxAbs;
    if (x > maxAbs) return maxAbs;
    if (x < -maxAbs) return -maxAbs;
    return x;
  }

  // Helper function for clamping values between min and max
  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // ============================================
  // PHYSICS-FIRST COST & ECONOMICS (calculate first, used in shares)
  // ============================================
  // --- Orbital cost from first principles ---
  
  // B. Use incremental launch mass for cost + carbon (PHYSICS-BASED)
  const satellitesTotal = final_S_A_new + final_S_B_new;
  const prevSatellitesTotal = previousEntry?.satellitesTotal ?? 0;
  const launchesThisYear = Math.max(0, satellitesTotal - prevSatellitesTotal);
  
  // Use physics-based mass per satellite (already includes radiator, solar, structure, etc.)
  // CRITICAL FIX: Use class-specific masses
  // Class A has larger batteries (eclipse survival), Class B has smaller batteries (safe mode only)
  // Economic audit: Class A ~700 kg battery, Class B ~536 kg battery (for 193 kW system)
  // Both classes have same radiator mass (~3,860 kg) - thermal system is independent of orbit
  const avgMassPerSatelliteKg = satellitesTotal_current > 0
    ? (S_A_new * physicsMassPerSatelliteKgA + S_B_new * physicsMassPerSatelliteKgB) / satellitesTotal_current
    : physicsMassPerSatelliteKgA; // Default to Class A if no satellites
  
  // Launch mass is only NEW sats (physics mass already includes all components)
  const launchMassThisYearKg = launchesThisYear * avgMassPerSatelliteKg;
  
  // CRITICAL FIX: Elon/Handmer target is <$50/kg for true optimism (Starship fuel costs ~$10-20/kg)
  // Per audit: Current model is ~$300/kg (too conservative), target is <$50/kg
  // For Elon/Handmer optimism in 2030s: Bull should floor at ~$20/kg (Starship fuel costs)
  // Base $/kg (e.g. from a "2025 launch budget / mass" assumption)
  // Scenario-dependent launch cost (only economic difference)
  const base_cost_per_kg_to_leo = scenarioMode === "ORBITAL_BULL" ? 10 : // Bull: $10/kg (Elon-optimistic Starship)
                                   scenarioMode === "ORBITAL_BEAR" ? 500 : // Bear: $500/kg (conservative)
                                   200; // Baseline: $200/kg (standard)
  
  // Apply sandbox launch cost with improvement rate if provided
  let cost_per_kg_to_leo: number;
  if (sandboxOverrides?.launchCostPerKg) {
    const baseLaunchCost = sandboxOverrides.launchCostPerKg;
    const improvementRate = sandboxOverrides.launchCostImprovementRate ?? launchCostDeclinePerYear;
    // Apply improvement rate: cost decreases by improvementRate each year
    const improvementFactor = Math.pow(1 - improvementRate, yearIndex);
    cost_per_kg_to_leo = baseLaunchCost * improvementFactor;
    console.log(`[SANDBOX OVERRIDE] Year ${year}: cost_per_kg_to_leo = ${cost_per_kg_to_leo.toFixed(2)} (base: ${baseLaunchCost}, improvement: ${(improvementRate * 100).toFixed(1)}%/yr)`);
  } else {
    cost_per_kg_to_leo = base_cost_per_kg_to_leo * launchCostDeclineFactor;
  }
  const launchCostThisYearUSD = launchMassThisYearKg * cost_per_kg_to_leo;
  const avgCostPerSatelliteUSD = (costA + costB) / 2;
  const replacementCostUSD = replacementCadence * avgCostPerSatelliteUSD;
  
  // Radiator cost multiplier (kept as before)
  const radiatorCostMultiplier =
    1.0 + totalRadiatorMassKg / 1_000_000;
  
  // Total capex + replacement for this year only
  const totalOrbitalCostThisYearUSD =
    (launchCostThisYearUSD + replacementCostUSD) * radiatorCostMultiplier;

  // === Compute demand + shares =======================================
  // demandGrowthFactor already calculated above from scenario params

  // Demand side - scaled up for realistic 2040 targets (50GW orbital)
  // Base demand starts at 200k PFLOPs in 2025, grows at 35% YoY
  const baseDemandPFLOPs_2025 = 200_000;      // Starting point (doubled from 100k)
  const baseDemandPFLOPs = baseDemandPFLOPs_2025;
  
  // Orbital addressable share: 15% of workloads are latency-insensitive (batch/async)
  const orbitalAddressableShare = 0.15;
  const totalDemandPFLOPs = baseDemandPFLOPs * demandGrowthFactor;
  const orbitalAddressableDemandPFLOPs = totalDemandPFLOPs * orbitalAddressableShare;
  const totalDemandFlops = totalDemandPFLOPs * 1e15; // Convert to FLOPS for comparison

  // Supply side: physics engine is already giving us PFLOPs, not literal FLOPS
  const computeExportablePFLOPs = computeExportablePF; // interpret as PFLOPs
  const compute_exportable_flops = computeExportablePFLOPs * 1e15; // Convert to FLOPS for comparison

  // 1) "Physics" share from raw exportable compute
  const physicalOrbitShare =
    totalDemandFlops > 0
      ? clamp(compute_exportable_flops / totalDemandFlops, 0, 1)
      : 0;

  // 2) Soft ramp cap so orbit share cannot jump to 100% in a couple years.
  //    Scenario-dependent: Bull relaxes faster, Bear stays capped longer
  const baseRampCap = yearIndex <= 0 ? 0 : clamp(1 - Math.exp(-yearIndex / 6), 0, 0.8);
  const rampCapMultiplier = scenarioMode === "ORBITAL_BULL" ? 1.3 : // Bull: faster adoption
                            scenarioMode === "ORBITAL_BEAR" ? 0.6 : // Bear: slower adoption
                            1.0; // Baseline: standard
  const rampCap = clamp(baseRampCap * rampCapMultiplier, 0, 0.95);

  // 3) Apply ramp + enforce a permanent minimum ground share (baseline always has *some* ground)
  let orbitComputeShare = clamp(
    Math.min(physicalOrbitShare, rampCap),
    0,
    0.8
  );

  const minGroundShare = 0.2; // keep at least 20% ground in baseline
  if (orbitComputeShare > 1 - minGroundShare) {
    orbitComputeShare = 1 - minGroundShare;
  }

  // 4) GATE ADOPTION ON COST PARITY (before cost calculation, use previous year's costs)
  // Get previous year's costs to check parity
  const prevCostGround = previousEntry?.cost_per_compute_ground ?? 340;
  const prevCostOrbit = previousEntry?.cost_per_compute_orbit ?? Infinity;
  const cheaperOrbit = prevCostOrbit < prevCostGround * 0.95; // 5% cheaper than ground
  
  // Scenario-dependent adoption caps and growth rates
  const preParityCap = scenarioMode === "ORBITAL_BULL" ? 0.35 : // Bull: higher experimental cap
                       scenarioMode === "ORBITAL_BEAR" ? 0.15 : // Bear: lower experimental cap
                       0.25; // Baseline: standard
  const prevOrbitShare = previousEntry?.orbit_compute_share ?? 0;
  
  // Scenario-dependent growth rates
  const preParityGrowthRate = scenarioMode === "ORBITAL_BULL" ? 0.05 : // Bull: 5% growth before parity
                               scenarioMode === "ORBITAL_BEAR" ? 0.02 : // Bear: 2% growth before parity
                               0.03; // Baseline: 3% growth
  const postParityGrowthRate = scenarioMode === "ORBITAL_BULL" ? 0.12 : // Bull: 12% growth after parity
                                scenarioMode === "ORBITAL_BEAR" ? 0.05 : // Bear: 5% growth after parity
                                0.08; // Baseline: 8% growth
  
  if (!cheaperOrbit && orbitComputeShare > preParityCap) {
    // Cap at preParityCap, but allow gradual growth (scenario-dependent)
    const maxGrowth = prevOrbitShare + preParityGrowthRate;
    orbitComputeShare = Math.min(orbitComputeShare, Math.min(preParityCap, maxGrowth));
  } else if (cheaperOrbit) {
    // After parity: allow more aggressive adoption toward the ramp cap (scenario-dependent)
    const maxGrowth = prevOrbitShare + postParityGrowthRate;
    orbitComputeShare = Math.min(orbitComputeShare, Math.min(rampCap, maxGrowth));
  }

  let groundComputeShare = 1 - orbitComputeShare;

  // Snap tiny orbit contributions back to all-ground for clarity
  if (orbitComputeShare < 1e-3) {
    orbitComputeShare = 0;
    groundComputeShare = 1;
  }

  // === Latency mix ====================================================
  const latency_ground_ms = 120;
  const baseLatencyOrbitMs = 30;
  const latencyImprovementPerYear = 0.01;
  const latency_orbit_ms = baseLatencyOrbitMs * Math.pow(1 - latencyImprovementPerYear, yearIndex);

  const latency_mix_ms =
    groundComputeShare * latency_ground_ms +
    orbitComputeShare * latency_orbit_ms;

  // === Cost / compute =================================================
  // FIXED: Use scenario params for learning rates and initial multiples
  
  // 1) Ground cost per compute should decline with tech progress (scenario-dependent)
  const baseGroundCostPerCompute = 340; // $/unit in 2025
  const cost_per_compute_ground = baseGroundCostPerCompute * Math.pow(1 - scenarioParams.groundLearningRate, yearIndex);
  
  // 2) Use physics-based derated compute for cost calculation (use modified bus physics)
  const busAvailability = scenarioMode === "ORBITAL_BULL"
    ? 0.95 // Hardcoded availability for ORBITAL_BULL
    : (modifiedBusPhysicsA?.availability ?? 0.9);
  const fleetTotalComputeTflopsDerated = 
    satellitesTotal * physicsComputeTflopsDerated * busAvailability;
  const fleetTotalComputePFLOPsDerated = fleetTotalComputeTflopsDerated * 1e3; // Convert to PFLOPs
  
  // 3) Raw orbital unit cost from physics (cumulative amortization)
  const prevCumulativeOrbitalCostUSD =
    previousEntry?.cumulativeOrbitalCostUSD ?? 0;
  const prevCumulativeExportedPFLOPs =
    previousEntry?.cumulativeExportedPFLOPs ?? 0;

  const cumulativeOrbitalCostUSD =
    prevCumulativeOrbitalCostUSD + totalOrbitalCostThisYearUSD;
  const cumulativeExportedPFLOPs =
    prevCumulativeExportedPFLOPs + fleetTotalComputePFLOPsDerated;

  // Raw orbit unit cost
  const rawOrbitUnitCost =
    cumulativeExportedPFLOPs > 0 && cumulativeOrbitalCostUSD > 0
      ? cumulativeOrbitalCostUSD / cumulativeExportedPFLOPs
      : Infinity;

  // 4) One-time calibration: in the first year with non-zero orbit compute,
  // make orbit cost ≈ initialOrbitCostMultiple × ground cost (scenario-dependent)
  const orbitCostScaleKey = `orbitCostScale_${scenarioMode}`;
  const orbitCostScaleInitializedKey = `orbitCostScaleInitialized_${scenarioMode}`;
  
  // Use state to persist calibration across years (stored in debug state)
  let orbitCostScale = previousEntry?.[orbitCostScaleKey as keyof typeof previousEntry] as number | undefined;
  let orbitCostScaleInitialized = previousEntry?.[orbitCostScaleInitializedKey as keyof typeof previousEntry] as boolean | undefined;
  
  if (!orbitCostScaleInitialized && Number.isFinite(rawOrbitUnitCost) && rawOrbitUnitCost > 0) {
    const desiredOrbitUnitCost = cost_per_compute_ground * scenarioParams.orbitInitialCostMultiple;
    orbitCostScale = desiredOrbitUnitCost / rawOrbitUnitCost;
    orbitCostScaleInitialized = true;
  }

  const orbitScale = orbitCostScale ?? 1;
  let cost_per_compute_orbit_raw =
    Number.isFinite(rawOrbitUnitCost) && rawOrbitUnitCost > 0
      ? rawOrbitUnitCost * orbitScale
      : cost_per_compute_ground * scenarioParams.orbitInitialCostMultiple; // Fallback to initial multiple

  // 5) Apply learning rate (scenario-dependent)
  // Orbit cost improves over time with learning
  const cost_per_compute_orbit = Number.isFinite(cost_per_compute_orbit_raw)
    ? cost_per_compute_orbit_raw * Math.pow(1 - scenarioParams.orbitLearningRate, yearIndex)
    : Infinity;

  // Clamp only for display, not for the diagnostic raw value.
  const orbit_cost_per_compute_display = Math.min(cost_per_compute_orbit, 1e7);

  // 5) Blended cost per compute
  let raw_cost_per_compute_mix: number;
  if (orbitComputeShare === 0) {
    // Pure ground year (no orbit contribution at all)
    raw_cost_per_compute_mix = cost_per_compute_ground;
  } else if (!Number.isFinite(cost_per_compute_orbit)) {
    // If orbit cost blew up, treat orbit as "very bad" but finite
    const badOrbit = cost_per_compute_ground * scenarioParams.orbitInitialCostMultiple;
    raw_cost_per_compute_mix =
      groundComputeShare * cost_per_compute_ground +
      orbitComputeShare * badOrbit;
  } else {
    raw_cost_per_compute_mix =
      groundComputeShare * cost_per_compute_ground +
      orbitComputeShare * cost_per_compute_orbit;
  }

  const cost_per_compute_mix = sane(raw_cost_per_compute_mix, 1e7);

  // === Annual OPEX ====================================================
  // Ground OPEX = Electricity bill + Hardware maintenance
  // Electricity: total_demand_kw * 8760 hours * $0.10/kWh
  // Hardware maintenance: 10% of ground CAPEX
  
  // Calculate base demand in TWh for carbon calculations
  const baseDemandTWh0 = 10_000;
  const baseDemandTWh = baseDemandTWh0 * demandGrowthFactor;
  
  // Estimate ground power from demand (assume ~8 kW per PFLOP for ground datacenters)
  // This accounts for PUE, cooling, and realistic datacenter power density
  const kwPerPFLOP = 8; // 8 kW per PFLOP (accounts for PUE ~2.0, cooling, etc.)
  const totalDemandKw = totalDemandPFLOPs * kwPerPFLOP; // Total power in kW
  const electricityCostPerKwh = 0.10; // $0.10/kWh industrial rate
  const hoursPerYear = 8760;
  const groundElectricityBillUSD = totalDemandKw * hoursPerYear * electricityCostPerKwh;
  
  // Estimate ground CAPEX (assume $500 per PFLOP for ground datacenter hardware)
  const groundCapexPerPFLOP = 500; // $500 per PFLOP
  const groundCapexUSD = totalDemandPFLOPs * groundCapexPerPFLOP;
  const groundHardwareMaintenanceUSD = groundCapexUSD * 0.10; // 10% maintenance
  
  const allGroundOpexUSD = groundElectricityBillUSD + groundHardwareMaintenanceUSD;
  const annual_opex_ground_all_ground = allGroundOpexUSD;
  const annual_opex_ground = groundComputeShare * annual_opex_ground_all_ground;

  // FIX: OPEX should be based on operational costs, not fleet value
  // Operational costs per satellite: ~$15k/year (laser comm, stationkeeping, ground ops)
  // Plus amortized replacement cost: ~$286k/year per satellite (7-year lifetime)
  // Total: ~$301k/year per satellite, but only operational portion (~$15k) is OPEX
  // Replacement amortization is already included in cost/compute, so don't double-count
  const operationalCostPerSatellite = 15_000; // $15k operational per satellite/year
  const base_annual_opex_orbit = satellitesTotal * operationalCostPerSatellite;
  
  // Add ground station costs: $50M base + $1M per 10k satellites
  const groundStationCosts = 50_000_000 + Math.floor(satellitesTotal / 10_000) * 1_000_000;
  
  // Add insurance: $10M per 10k satellites (risk-adjusted)
  const insuranceCosts = Math.floor(satellitesTotal / 10_000) * 10_000_000;
  
  const base_annual_opex_orbit_with_fixed = base_annual_opex_orbit + groundStationCosts + insuranceCosts;

  // === Congestion costs =================================================
  // Calculate congestion metrics and add costs to OPEX
  const failuresByYear = new Map<number, number>(state.failuresByYear || []);
  failuresByYear.set(year, satellitesFailedThisYear);
  
  // Determine primary shell (use LEO_550 as default, or LEO_1100 if Class B dominant)
  const primaryShell = satellitesTotal > 0 && final_S_B_new > final_S_A_new ? "LEO_1100" : "LEO_550";
  const shellName = primaryShell;
  
  // Estimate compute value per hour for downtime cost
  const computeValuePerHour = cost_per_compute_orbit > 0 
    ? (computeExportablePFLOPs * cost_per_compute_orbit) / (365 * 24) 
    : 1e6; // Fallback: $1M/hour
  
  const congestionMetrics = calculateCongestionMetrics(
    year,
    START_YEAR,
    satellitesTotal,
    shellName,
    Object.fromEntries(failuresByYear),
    cost_per_kg_to_leo,
    computeValuePerHour
  );
  
  // === Multi-shell capacity calculations =================================
  // Calculate capacity and utilization for each shell
  const shellUtilizationByAltitude: Record<string, number> = {};
  const shellPowerBreakdown: Array<{ shell: string; powerGW: number; sats: number }> = [];
  
  // FIX: Use actual fleet power (power_total_kw) for total, not shell-constrained estimate
  // The shell breakdown is for utilization tracking, but total power should match KPI
  const totalOrbitalPowerGW = power_total_kw / 1e6; // Convert kW to GW (matches KPI calculation)
  
  // Distribute satellites across shells (simplified: assume even distribution for now)
  // In a full implementation, this would track actual shell assignments
  const satsPerShell = satellitesTotal / ORBIT_SHELLS.length;
  
  for (const shell of ORBIT_SHELLS) {
    const capacity = calculateShellCapacity(shell.altitude_km, shell.spacing_km);
    const effectivePower = Math.min(powerPerSatKw, shell.max_power_per_sat_kw);
    const radiationFactor = 1 - (shell.radiation_penalty || 0);
    
    // Estimate satellite count in this shell (simplified distribution)
    const satsInShell = Math.min(satsPerShell, capacity.maxSatellites);
    const shellPowerGW = (satsInShell * effectivePower * radiationFactor) / 1e6;
    
    shellUtilizationByAltitude[shell.id] = satsInShell / capacity.maxSatellites;
    shellPowerBreakdown.push({
      shell: shell.id,
      powerGW: shellPowerGW,
      sats: satsInShell,
    });
  }
  
  // === Battery metrics ====================================================
  const batterySpec = getBatterySpec(year);
  // Calculate battery requirements for typical eclipse (35 minutes for LEO)
  const typicalEclipseMinutes = 35;
  const batteryReqs = calculateBatteryRequirements(year, powerPerSatKw, typicalEclipseMinutes);
  
  // Add congestion costs to orbital OPEX
  const annual_opex_orbit = base_annual_opex_orbit_with_fixed + congestionMetrics.congestionCostAnnual;

  const raw_annual_opex_mix = annual_opex_ground + annual_opex_orbit;
  const annual_opex_mix = sane(raw_annual_opex_mix, 1e12);

  // === Carbon =========================================================
  // D. Fix carbon: per-year launches + cumulative amortization
  // carbon_ground is in g CO2/kWh (for intensity calculations)
  const groundCarbonPerKwh = 400; // g CO2/kWh
  const carbon_ground = groundCarbonPerKwh; // g CO2/kWh (used for intensity)
  const launch_carbon_per_kg = launchCarbonPerKg; // Use scenario-dependent value

  // Carbon this year: only new launches + replacements (PHYSICS-BASED)
  const launchCarbonKgThisYear = launchMassThisYearKg * launch_carbon_per_kg;
  const replacementCarbonKgThisYear =
    // CRITICAL FIX: Use weighted average mass (Class A and Class B have different masses)
    replacementCadence * avgMassPerSatelliteKg * launch_carbon_per_kg;

  const totalOrbitalCarbonKgThisYear =
    launchCarbonKgThisYear + replacementCarbonKgThisYear;

  // Cumulative orbital carbon + energy served
  const prevCumulativeOrbitalCarbonKg =
    previousEntry?.cumulativeOrbitalCarbonKg ?? 0;
  const prevCumulativeOrbitEnergyTwh =
    previousEntry?.cumulativeOrbitEnergyTwh ?? 0;

  const cumulativeOrbitalCarbonKg =
    prevCumulativeOrbitalCarbonKg + totalOrbitalCarbonKgThisYear;

  // CRITICAL FIX: Energy served = actual energy produced, not demand share
  // Per audit: E_TWh = (P_fleet_kW × 8760 hours) / 10^9
  // This is the actual energy throughput of the fleet, not a share of demand
  const HOURS_PER_YEAR = 8760;
  const orbitEnergyServedTwhThisYear = (power_total_kw_raw * HOURS_PER_YEAR) / 1e9;
  const cumulativeOrbitEnergyTwh =
    prevCumulativeOrbitEnergyTwh + orbitEnergyServedTwhThisYear;

  // FIX #1 (continued): Carbon Fix
  // Calculate carbon_orbit as Intensity: (total_carbon_kg * 1000) / (orbitEnergyServedTwh * 1e9)
  // Formula: carbon_orbit_intensity = (carbon_orbit_total_kg * 1000) / (orbitEnergyServedTwh * 1e9)
  // Note: orbitEnergyServedTwhThisYear uses corrected power_total_kw from Fix #1
  const carbon_orbit_total_kg = cumulativeOrbitalCarbonKg; // Total carbon mass in kg
  
  let carbon_orbit_intensity: number; // Intensity in g CO2 / kWh (same units as carbon_ground)
  if (cumulativeOrbitEnergyTwh > 0 && carbon_orbit_total_kg > 0) {
    // Convert total carbon (kg) to intensity (g/kWh)
    // carbon_intensity (g/kWh) = (carbon_total_kg × 1000 g/kg) / (energy_TWh × 1e9 kWh/TWh)
    carbon_orbit_intensity = (carbon_orbit_total_kg * 1000) / (cumulativeOrbitEnergyTwh * 1e9);
  } else {
    // No orbit yet → force it to look worse than ground
    carbon_orbit_intensity = carbon_ground * 5;
  }
  
  // For backward compatibility, keep carbon_orbit as intensity (g/kWh) for charts
  const carbon_orbit = carbon_orbit_intensity; // Now in g/kWh, same units as carbon_ground

  // Mix intensity (both in g CO2 / kWh for proper mixing)
  const carbon_mix_raw =
    groundComputeShare * carbon_ground +
    orbitComputeShare * carbon_orbit_intensity; // Use intensity in g/kWh (same units as carbon_ground)

  const carbon_mix_display = sane(carbon_mix_raw, 1e6);

  // Annual absolute tons for the card
  // CRITICAL FIX: annual_carbon_orbit should be actual carbon emitted this year, not calculated from demand share
  // Per audit: annual_carbon_orbit was 4 million times too high because it was using carbon_orbit (intensity) × demand
  // Instead, use the actual carbon emitted: totalOrbitalCarbonKgThisYear
  // FIX: Convert properly - baseDemandTWh is in TWh, carbon_ground is in g/kWh
  // annual_carbon (kg) = baseDemandTWh * 1e9 kWh/TWh * carbon_ground g/kWh / 1000 g/kg
  // = baseDemandTWh * carbon_ground * 1e6 kg
  const annual_carbon_ground_all_ground = baseDemandTWh * carbon_ground * 1e6; // kg CO2
  const annual_carbon_ground = groundComputeShare * annual_carbon_ground_all_ground;
  const annual_carbon_orbit = totalOrbitalCarbonKgThisYear; // CRITICAL: Use actual carbon emitted, not intensity × demand
  const annual_carbon_mix = annual_carbon_ground + annual_carbon_orbit;

  // Carbon delta vs all-ground
  const carbon_delta = carbon_orbit - carbon_ground;
  const carbon_crossover_triggered = carbon_delta < 0;

  // Legacy cost crossover (for compatibility)
  const cost_orbit = cost_per_compute_orbit;
  const cost_ground = cost_per_compute_ground;
  const cost_delta = cost_orbit - cost_ground;
  const cost_crossover_triggered = cost_delta < 0;
  
  // QUICK ASSERTIONS - surface edge-case bugs
  if (cost_per_compute_orbit < 0) console.warn(`[Cost] Year ${year}: Negative orbit cost/compute: ${cost_per_compute_orbit}`);
  if (!Number.isFinite(cost_per_compute_orbit)) console.warn(`[Cost] Year ${year}: Orbit cost/compute not finite: ${cost_per_compute_orbit}`);
  // Note: orbit_carbon_intensity is defined later in the carbon section
  if (!Number.isFinite(physicsOutput.temp_core_C)) console.warn(`[Thermal] Year ${year}: temp_core_C not finite: ${physicsOutput.temp_core_C}`);
  
  // Solar uptime (simplified model - should be calculated from actual solar availability)
  // Ground solar: 18-28% uptime (varies by location, weather, night)
  const ground_full_power_uptime_percent = 20 + Math.sin(year * 0.1) * 5; // 18-28% with variation
  // Solar + storage: 35-55% uptime (storage smooths but never catches up)
  const solar_plus_storage_uptime_percent = 40 + Math.sin(year * 0.1) * 10; // 35-55% with variation
  // Space-based solar: 92-99% uptime (nearly flat, no night/weather)
  const space_solar_uptime_percent = S_B_new > 0 ? 95 + Math.random() * 4 : 0; // 92-99% when Class B exists
  
  // Backhaul metrics (from thermal state)
  // backhaul_capacity_tbps already defined from physics state above
  // backhaul_used_tbps_from_physics already calculated above
  
  // Maintenance used from physics (already calculated above)
  
  // RULE 6: POWER UTILIZATION MUST REFLECT LIMITERS
  // power_utilization_percent = max(radiator, backhaul, maintenance) clamped 0-100
  // CRITICAL FIX: radiator_utilization is already in percentage (0-100+), don't multiply by 100 again
  // Per audit A1: The formula was being multiplied by 100 twice, causing 100× error
  const radiator_utilization_percent = physicsOutput.radiator_utilization; // Already in %
  const backhaul_utilization_percent = backhaul_capacity_tbps > 0 
    ? Math.min(100, Math.max(0, (backhaul_used_tbps_from_physics / backhaul_capacity_tbps) * 100))
    : 0;
  // maintenance_utilization_percent and final_survival_fraction already calculated above for maintenance penalty
  const power_utilization_percent = Math.min(100, Math.max(0, Math.max(
    radiator_utilization_percent,
    backhaul_utilization_percent,
    maintenance_utilization_percent
  )));
  
  const debugEntry: DebugStateEntry = {
    year,
    launchMassCeiling: effectiveComputeResult.ceilings.launchMass,
    launchCostCeiling: effectiveComputeResult.ceilings.launchCost,
    heatCeiling: effectiveComputeResult.ceilings.heat,
    backhaulCeiling: effectiveComputeResult.ceilings.backhaul,
    autonomyCeiling: effectiveComputeResult.ceilings.autonomy,
    satellitesAdded: final_newA + final_newB, // RULE 1: Zero if survival = 0
    satellitesTotal: 0, // CRITICAL FIX: Will be set from classA_satellites_alive + classB_satellites_alive after class breakdown
    satellitesFailed: effectiveComputeResult.constraints.maintenance.failuresThisYear,
    satellitesRecovered: effectiveComputeResult.constraints.maintenance.recoverable,
    satellitesRetired: retiredA + retiredB,
    // TRUE UTILIZATION METRICS (from physics, not legacy calculations)
    utilization_heat: Math.min(1.0, Math.max(0, radiator_utilization_percent / 100)),
    utilization_backhaul: Math.min(1.0, Math.max(0, backhaul_utilization_percent / 100)),
    utilization_autonomy: Math.min(1.0, Math.max(0, maintenance_utilization_percent / 100)),
    utilization_overall: Math.min(1.0, Math.max(0, power_utilization_percent / 100)),
    // FIX #3: Aggregation - simple summation
    // fleet_power = sats * bus_power
    power_total_kw: satellitesTotal * physicsPowerPerSatelliteKw,
    compute_raw_flops: physicsOutput.compute_raw_flops, // RULE 1: Already multiplied by survival in physics
    compute_effective_flops: physicsOutput.compute_exportable_flops, // RULE 4: = exportable
    dominantConstraint: effectiveComputeResult.dominantConstraint,
    strategyActive: strategy,
    strategyHistory: [strategy], // Simplified - could track history
    // FIX #3: Aggregation - simple summation of per-satellite values
    // fleet_radiator_area = sats * radiator_area_per_sat
    radiatorArea: satellitesTotal * (finalRadiatorAreaPerA_modified + finalRadiatorAreaPerB_modified) / 2,
    // fleet_heat_gen = sats * heat_gen_per_sat
    heatGen: satellitesTotal * ((heatGenA + heatGenB) / 2),
    // fleet_heat_reject = sats * heat_reject_per_sat
    heatReject: satellitesTotal * ((heatRejectA + heatRejectB) / 2),
    launchBudget: launchBudgetM,
    costPerSatellite: (costA + costB) / 2,
    // CRITICAL FIX: Use bus_total_mass_kg from physics, not average of A/B masses
    // CRITICAL FIX: Use weighted average mass (Class A and Class B have different masses)
    // Per audit: massPerSatellite (1.58 kg) was desynchronized from bus_total_mass_kg (13.58 kg)
    // Class A: ~700 kg battery, Class B: ~536 kg battery (both have ~3,860 kg radiator)
    massPerSatellite: avgMassPerSatelliteKg, // Weighted average of Class A and Class B masses
    autonomyLevel,
    failureRate: effectiveComputeResult.constraints.maintenance.failureRate,
    repairCapacity,
    shellOccupancy: {
      LOW: S_A_lowLEO_new,
      MID: S_A_midLEO_new,
      HIGH: 0, // Not tracked separately - needs orbit allocation update
      SSO: S_A_sunSync_new + S_B_sunSync_new,
    },
    // --- Class Breakdown ---
    // CRITICAL FIX: Use final survival-adjusted counts for class breakdown
    classA_satellites_alive: final_S_A_new,
    classB_satellites_alive: final_S_B_new,
    classA_compute_raw: classA_compute_raw,
    classB_compute_raw: classB_compute_raw,
    classA_power_kw: classA_power_kw,
    classB_power_kw: classB_power_kw,
    
    // NOTE: satellitesTotal will be set AFTER debug entry creation (see below)
    // --- Backhaul Reality ---
    backhaul_bandwidth_total: backhaul_capacity_tbps * 1000, // Convert TBps to Gbps
    backhaul_bandwidth_used: backhaul_used_tbps_from_physics * 1000,
    backhaul_bw_per_PFLOP: 10, // Gbps per PFLOP
    // REMOVED: utilization_backhaul_raw (fake utilization field)
    // --- Autonomy & Maintenance Reality ---
    maintenance_debt: maintenance_debt,
    failures_unrecovered: failures_unrecovered_this_year, // This year's unrecoverable failures
    recovery_success_rate: satellitesFailed > 0 
      ? satellitesRecovered / satellitesFailed 
      : 1.0, // What % of failures get fixed
    survival_fraction: final_survival_fraction,
    // --- Thermal Reality ---
    electrical_efficiency: physicsState.electrical_efficiency,
    radiator_kw_per_m2: physicsState.radiator_kw_per_m2,
    // REMOVED: utilization_heat_raw (fake utilization field)
    // --- Launch Economics ---
    payload_per_launch_tons: payload_per_launch_tons,
    launches_per_year: launches_per_year,
    cost_per_kg_to_leo: cost_per_kg_to_leo,
    // --- Retirement Physics ---
    retirements_by_lifetime: retirements_by_lifetime,
    retirements_by_failure: retirements_by_failure,
    // --- Strategy Effects ---
    strategy_growth_target: strategy_growth_target,
    strategy_launch_budget_multiplier: strategy_launch_budget_multiplier,
    strategy_RnD_autonomy_bias: strategy_RnD_autonomy_bias,
    strategy_radiator_mass_bias: strategy_radiator_mass_bias,
    // --- Carbon & Cost Crossover ---
    // Note: carbon_* and cost_* fields are set in the CARBON and ECONOMICS sections below
    cost_orbit: cost_orbit,
    cost_ground: cost_ground,
    cost_delta: cost_delta,
    cost_crossover_triggered: cost_crossover_triggered,
    // --- Physics Engine Outputs ---
    temp_core_C: physicsOutput.temp_core_C,
    temp_radiator_C: physicsOutput.temp_radiator_C, // CRITICAL FIX: Use calculated radiator temperature from Stefan-Boltzmann
    thermal_mass_J_per_C: physicsState.thermal_mass_J_per_C,
    heatGen_kw: physicsOutput.heatGen_kw,
    heatReject_kw: physicsOutput.heatReject_kw,
    net_heat_flow_kw: physicsOutput.net_heat_flow_kw,
    active_cooling_kw: 0, // Not in physics engine
    thermal_drift_C_per_hr: physicsOutput.thermal_drift_C_per_year / 8760,
    eclipse_fraction: physicsState.eclipse_fraction,
    shadowing_loss: physicsState.shadowing_loss,
    // --- Utilization Metrics (RULE 6: power utilization reflects limiters) ---
    power_utilization_percent: power_utilization_percent,
    radiator_utilization_percent: radiator_utilization_percent,
    backhaul_utilization_percent: backhaul_utilization_percent,
    manufacturing_utilization_percent: 100, // Not in physics engine
    maintenance_utilization_percent: maintenance_utilization_percent,
    // --- Sustained Compute ---
    sustained_compute_flops: physicsOutput.sustained_compute_flops,
    compute_exportable_flops: physicsOutput.compute_exportable_flops,
    // --- Maintenance Debt ---
    global_efficiency: physicsOutput.survival_fraction,
    // --- ECONOMICS (unified debug output) ---
    cost_per_compute_ground: cost_per_compute_ground,
    cost_per_compute_orbit: cost_per_compute_orbit,
    cost_per_compute_mix: cost_per_compute_mix, // DISPLAY: clamped value for charts
    raw_cost_per_compute_mix: raw_cost_per_compute_mix, // RAW: unclamped for internal calculations
    cumulativeOrbitalCostUSD: cumulativeOrbitalCostUSD,
    cumulativeExportedPFLOPs: cumulativeExportedPFLOPs,
    exportedPFLOPsThisYear: fleetTotalComputePFLOPsDerated,
    // Store orbit cost scale calibration for persistence across years
    [orbitCostScaleKey]: orbitCostScale,
    [orbitCostScaleInitializedKey]: orbitCostScaleInitialized,
    launchMassThisYearKg: launchMassThisYearKg,
    launchCostThisYearUSD: launchCostThisYearUSD,
    totalOrbitalCostThisYearUSD: totalOrbitalCostThisYearUSD,
    totalRadiatorMassKg: totalRadiatorMassKg, // For year-over-year comparison
    annual_opex_ground_all_ground: annual_opex_ground_all_ground, // All-ground baseline for "Ground: $XM" label
    annual_opex_ground: annual_opex_ground,
    annual_opex_orbit: annual_opex_orbit,
    annual_opex_mix: annual_opex_mix, // DISPLAY: clamped value for charts
    raw_annual_opex_mix: raw_annual_opex_mix, // RAW: unclamped for internal calculations
    // --- LATENCY (unified debug output) ---
    latency_ground_ms: latency_ground_ms,
    latency_orbit_ms: latency_orbit_ms,
    latency_mix_ms: latency_mix_ms,
    // --- COMPUTE (unified debug output) ---
    // compute_raw_flops, compute_effective_flops, compute_exportable_flops, sustained_compute_flops already exist
    // classA_compute_flops, classB_compute_flops already exist (as classA_compute_raw, classB_compute_raw)
    // --- POWER (unified debug output) ---
    // power_total_kw, power_utilization_percent already exist
    // --- THERMAL (unified debug output) ---
    // temp_core_C, temp_radiator_C, net_heat_flow_kw, radiator_utilization_percent, active_cooling_kw already exist
    // --- BACKHAUL (unified debug output) ---
    backhaul_capacity_tbps: physicsState.backhaul_capacity_tbps,
    backhaul_used_tbps: backhaul_used_tbps_from_physics,
    // backhaul_utilization_percent already exists
    // --- MAINTENANCE (unified debug output) ---
    // maintenance_capacity_pods, maintenance_utilization_percent, failures_unrecovered, survival_fraction already exist
    maintenance_used_pods: maintenance_used_pods,
    // --- CARBON (unified debug output) ---
    carbon_ground: carbon_ground,
    carbon_orbit: carbon_orbit,
    carbon_delta: carbon_delta,
    carbon_crossover_triggered: carbon_crossover_triggered,
    carbon_mix: carbon_mix_display, // DISPLAY: clamped value for charts
    raw_carbon_mix: carbon_mix_raw, // RAW: unclamped for internal calculations
    orbit_carbon_intensity: carbon_orbit, // For diagnostics (alias)
    launchCarbonKgThisYear: launchCarbonKgThisYear,
    totalOrbitalCarbonKgThisYear: totalOrbitalCarbonKgThisYear,
    cumulativeOrbitalCarbonKg: cumulativeOrbitalCarbonKg,
    orbitEnergyServedTwhThisYear: orbitEnergyServedTwhThisYear,
    cumulativeOrbitEnergyTwh: cumulativeOrbitEnergyTwh,
    annual_carbon_ground_all_ground: annual_carbon_ground_all_ground, // Annual total (kg CO2)
    annual_carbon_ground: annual_carbon_ground,
    annual_carbon_orbit: annual_carbon_orbit,
    annual_carbon_mix: annual_carbon_mix, // Annual total (kg CO2)
    orbit_energy_share_twh: orbitEnergyServedTwhThisYear, // Actual TWh value, not just 1
    bus_total_mass_kg: avgMassPerSatelliteKg,
    bus_silicon_mass_kg: modifiedBusPhysicsA.siliconMassKg ?? 0,
    bus_radiator_mass_kg: modifiedBusPhysicsA.radiatorMassKg ?? 0,
    bus_solar_mass_kg: modifiedBusPhysicsA.solarArrayMassKg ?? 0,
    bus_structure_mass_kg: modifiedBusPhysicsA.structureMassKg ?? 0,
    bus_shielding_mass_kg: modifiedBusPhysicsA.shieldingMassKg ?? 0,
    bus_power_electronics_mass_kg: modifiedBusPhysicsA.powerElectronicsMassKg,
    bus_avionics_mass_kg: modifiedBusPhysicsA.avionicsMassKg,
    bus_battery_mass_kg: satellitesTotal_current > 0
      ? (S_A_new * modifiedBusPhysicsA.batteryMassKg + S_B_new * modifiedBusPhysicsB.batteryMassKg) / satellitesTotal_current
      : modifiedBusPhysicsA.batteryMassKg,
    bus_adcs_mass_kg: modifiedBusPhysicsA.adcsMassKg,
    bus_propulsion_mass_kg: modifiedBusPhysicsA.propulsionMassKg,
    bus_other_mass_kg: modifiedBusPhysicsA.otherMassKg,
    bus_power_kw: physicsPowerPerSatelliteKw, // Use hardcoded or physics-based power
    bus_compute_tflops_nominal: physicsComputeTflopsNominal, // Use hardcoded or physics-based compute
    bus_compute_tflops_derated: physicsComputeTflopsDerated, // Use hardcoded or physics-based compute
    bus_availability: scenarioMode === "ORBITAL_BULL"
      ? 0.95 // Hardcoded availability for ORBITAL_BULL
      : (modifiedBusPhysicsA?.availability ?? 0.9), // Use Class A availability as default
    // CRITICAL FIX: Use weighted average mass (Class A and Class B have different masses)
    fleet_total_mass_kg: satellitesTotal * avgMassPerSatelliteKg,
    fleet_total_compute_tflops_derated: fleetTotalComputeTflopsDerated,
    // 3) Make the "why" explicit in the debug/detail panel - Scenario Diagnostics
    scenario_mode: scenarioMode, // CRITICAL: Store actual scenario mode (BASELINE, ORBITAL_BULL, ORBITAL_BEAR)
    scenarioKind: scenarioKind, // For debugging (baseline, bull, bear)
    launch_cost_per_kg: cost_per_kg_to_leo,
    tech_progress_factor: techProgressFactor,
    computePerKwGrowth: computePerKwGrowth, // For frontier shape debugging
    powerGrowthPerYear: powerGrowthPerYear, // For frontier shape debugging
    failure_rate_effective: effectiveComputeResult.constraints.maintenance.failureRate,
    // maintenance_utilization_percent and backhaul_utilization_percent already set above
    // orbit_carbon_intensity already set above
    // orbit_cost_per_compute already set above
    // Patch 3: Make diagnostic panel reflect what's really happening
    orbit_compute_share: orbitComputeShare,
    ground_compute_share: groundComputeShare, // For debugging
    orbit_compute_share_physical: physicalOrbitShare, // Physical share before ramp cap
    orbit_share_ramp_cap: rampCap, // Ramp cap applied
    baseDemandPFLOPs: baseDemandPFLOPs, // For debugging
    totalDemandPFLOPs: totalDemandPFLOPs, // For debugging
    compute_exportable_PFLOPs: computeExportablePFLOPs, // Same as compute_exportable_flops, but explicitly named
    baseDemandTWh: baseDemandTWh, // Growing energy demand
    orbitEnergyServedTwh: orbitEnergyServedTwhThisYear, // For debugging (alias)
    // Store orbit cost scale calibration for persistence across years
    [orbitCostScaleKey]: orbitCostScale,
    [orbitCostScaleInitializedKey]: orbitCostScaleInitialized,
    // --- SOLAR (unified debug output) ---
    ground_full_power_uptime_percent: ground_full_power_uptime_percent,
    solar_plus_storage_uptime_percent: solar_plus_storage_uptime_percent,
    space_solar_uptime_percent: space_solar_uptime_percent,
    // --- CONGESTION METRICS ---
    congestion_shell_utilization: congestionMetrics.shellUtilization,
    congestion_conjunction_rate: congestionMetrics.conjunctionsPerYear,
    congestion_debris_count: congestionMetrics.accumulatedDebris,
    congestion_collision_risk: congestionMetrics.annualCollisionProbability,
    congestion_thermal_penalty: congestionMetrics.avgThermalPenalty,
    congestion_cost_annual: congestionMetrics.congestionCostAnnual,
    // --- MULTI-SHELL CAPACITY ---
    shell_utilization_by_altitude: shellUtilizationByAltitude,
    orbital_power_total_gw: totalOrbitalPowerGW,
    shell_power_breakdown: shellPowerBreakdown,
    // --- BATTERY METRICS ---
    battery_density_wh_per_kg: batterySpec.density_wh_per_kg,
    battery_cost_usd_per_kwh: batterySpec.cost_usd_per_kwh,
    battery_mass_per_sat_kg: batteryReqs.massKg,
    battery_cost_per_sat_usd: batteryReqs.costUsd,
    eclipse_tolerance_minutes: typicalEclipseMinutes,
  };
  
  // CRITICAL FIX: satellitesTotal MUST be aggregated from class counts
  // This aggregation happens AFTER all updates to class counts and survival adjustments
  // Set satellitesTotal explicitly from the class breakdown
  debugEntry.satellitesTotal = debugEntry.classA_satellites_alive + debugEntry.classB_satellites_alive;
  
  // CRITICAL ASSERTION: Verify the aggregation is correct
  if (Math.abs(debugEntry.satellitesTotal - (final_S_A_new + final_S_B_new)) > 0.1) {
    console.error(`[CRITICAL BUG] Year ${year}: satellitesTotal aggregation failed. satellitesTotal=${debugEntry.satellitesTotal}, expected=${final_S_A_new + final_S_B_new}, classA=${debugEntry.classA_satellites_alive}, classB=${debugEntry.classB_satellites_alive}`);
    throw new Error(`[CRITICAL BUG] Year ${year}: satellitesTotal aggregation mismatch. satellitesTotal=${debugEntry.satellitesTotal}, expected=${final_S_A_new + final_S_B_new}`);
  }
  
  
  addDebugStateEntry(debugEntry);
  validateState(year, scenarioMode);
  // Run cross-year validation after adding entry
  if (year % 5 === 0) { // Run every 5 years to avoid performance issues
    // validateStateAcrossYears expects uppercase ScenarioKey from debugState
    validateStateAcrossYears(scenarioMode);
  }
  
  // 10. Update deployment history
  const newDeployedByYear_A = new Map(deployedByYear_A);
  const newDeployedByYear_B = new Map(deployedByYear_B);
  newDeployedByYear_A.set(year, newA);
  newDeployedByYear_B.set(year, newB);
  
  // Create legacy thermal state for compatibility
  const updatedThermalState = initializeThermalState(0, 0, 0, 0, 0, 0, 5.0, 12.0, year);
  
  // 11. Update state with physics state for next year
  // CRITICAL: Use survival-adjusted counts (final_S_A_new, final_S_B_new) for next year's state
  const newState: YearDeploymentState = {
    year: year + 1,
    strategy,
    S_A: final_S_A_new, // RULE 1: Use survival-adjusted count
    S_B: final_S_B_new, // RULE 1: Use survival-adjusted count
    S_A_lowLEO: final_S_A_lowLEO_new, // RULE 1: Use survival-adjusted count
    S_A_midLEO: final_S_A_midLEO_new, // RULE 1: Use survival-adjusted count
    S_A_sunSync: final_S_A_sunSync_new, // RULE 1: Use survival-adjusted count
    deployedByYear_A: newDeployedByYear_A,
    deployedByYear_B: newDeployedByYear_B,
    totalComputePFLOPs: finalEffectiveCompute,
    totalPowerMW: (final_S_A_new * powerPerA + final_S_B_new * powerPerB) / 1000, // RULE 1: Use survival-adjusted counts
    cumulativeSatellitesLaunched, // CRITICAL: Track cumulative launches for survival calculation
    cumulativeFailures, // CRITICAL: Track cumulative failures for survival calculation
    failuresByYear, // Track failures by year for debris calculation
    physicsState: nextPhysicsState,
    thermalState: updatedThermalState, // Legacy
  };
  
  return {
    year,
    strategy,
    newA: final_newA, // RULE 1: Use survival-adjusted (0 if survival = 0)
    newB: final_newB, // RULE 1: Use survival-adjusted (0 if survival = 0)
    newA_lowLEO,
    newA_midLEO,
    newA_sunSync,
    S_A: final_S_A_new, // RULE 1: Use survival-adjusted count
    S_B: final_S_B_new, // RULE 1: Use survival-adjusted count
    S_A_lowLEO: final_S_A_lowLEO_new, // RULE 1: Use survival-adjusted count
    S_A_midLEO: final_S_A_midLEO_new, // RULE 1: Use survival-adjusted count
    S_A_sunSync: final_S_A_sunSync_new, // RULE 1: Use survival-adjusted count
    S_B_sunSync: final_S_B_sunSync_new, // RULE 1: Use survival-adjusted count
    totalComputePFLOPs: finalEffectiveCompute,
    totalPowerMW: (final_S_A_new * powerPerA + final_S_B_new * powerPerB) / 1000, // RULE 1: Use survival-adjusted counts
    effectiveComputePFLOPs: finalEffectiveCompute,
    heatUtilization: effectiveComputeResult.heatUtilization,
    survivalFraction: effectiveComputeResult.survivalFraction,
    computePerA,
    powerPerA,
    computePerB,
    powerPerB,
    constraints: effectiveComputeResult.constraints,
    physicsState: nextPhysicsState,
    thermalState: updatedThermalState, // Legacy - kept for compatibility
  };
}

/**
 * Get initial state (year 2025)
 */
export function getInitialDeploymentState(strategy: StrategyMode = "BALANCED"): YearDeploymentState {
  const initialThermalState = initializeThermalState(0, 0, 0, 0, 0, 0, 5.0, 12.0, START_YEAR);
  const initialPhysicsState = createPhysicsState(0, 0, 0, 0, 0);
  
  return {
    year: START_YEAR,
    strategy,
    S_A: 0,
    S_A_lowLEO: 0,
    S_A_midLEO: 0,
    S_A_sunSync: 0,
    S_B: 0,
    deployedByYear_A: new Map(),
    deployedByYear_B: new Map(),
    totalComputePFLOPs: 0,
    totalPowerMW: 0,
    physicsState: initialPhysicsState,
    thermalState: initialThermalState, // Legacy
  };
}

/**
 * Run multi-year deployment simulation
 * 
 * @param startYear Starting year
 * @param endYear Ending year
 * @param strategyByYear Map of year -> strategy (allows mid-run strategy changes)
 */
export function runMultiYearDeployment(
  startYear: number,
  endYear: number,
  strategyByYear: Map<number, StrategyMode>,
  scenarioMode: ScenarioMode = "BASELINE"
): YearDeploymentResult[] {
  let state = getInitialDeploymentState();
  const results: YearDeploymentResult[] = [];
  
  for (let year = startYear; year <= endYear; year++) {
    // Get strategy for this year (default to BALANCED if not specified)
    const strategy = strategyByYear.get(year) || "BALANCED";
    
    // Calculate deployment for this year
    const result = calculateYearDeployment(state, strategy, scenarioMode);
    results.push(result);
    
    // Update state for next year (get thermalState from result)
    state = {
      year: year + 1,
      strategy,
      S_A: result.S_A,
      S_A_lowLEO: result.S_A_lowLEO,
      S_A_midLEO: result.S_A_midLEO,
      S_A_sunSync: result.S_A_sunSync,
      S_B: result.S_B,
      deployedByYear_A: new Map(state.deployedByYear_A),
      deployedByYear_B: new Map(state.deployedByYear_B),
      totalComputePFLOPs: result.totalComputePFLOPs,
      totalPowerMW: result.totalPowerMW,
      physicsState: result.physicsState,
      thermalState: result.thermalState, // Legacy
    };
    
    // Update deployment history
    state.deployedByYear_A.set(year, result.newA);
    state.deployedByYear_B.set(year, result.newB);
  }
  
  return results;
}

