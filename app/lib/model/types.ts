import { IntegratedPhysicsParams, WorkloadType, WorkloadProfile, TokenPricing, SLAConfig, GpuHourPricing } from './orbitalPhysics';

// Re-export for convenience
export { type WorkloadType, type WorkloadProfile, type TokenPricing, type SLAConfig, type GpuHourPricing };

// --- Interconnect Types ---
export interface InterconnectConfig {
  intraSatellite: {
    type: 'nvlink' | 'pcie';
    bandwidthGbps: number;
    latencyUs: number;
    costPerGpu: number;
  };
  interSatellite: {
    type: 'optical-isl';
    bandwidthGbps: number;
    latencyUs: number;
    terminalsPerSat: number;
    costPerTerminal: number;
    maxRangeKm: number;
  };
  satToGround: {
    type: 'optical' | 'rf';
    bandwidthGbps: number;
    latencyMs: number;
    groundStationCostPerGbps: number;
  };
}

export type GroundScenario = 'unconstrained' | 'moderate' | 'constrained' | 'severe';

export interface GroundScenarioConfig {
  name: string;
  description: string;
  constraintCap: number | null;
  gridGrowthRate: number;
  coolingGrowthRate: number;
  waterGrowthRate: number;
  landGrowthRate: number;
}

// FIX 4: Constraint Scenario Labeling
export interface ConstraintScenario {
  name: 'base' | 'stressed' | 'smr_mitigation';
  description: string;
  maxMultiplier: number;
  gridCap: number;
  coolingCap: number;
  waterCap: number;
  landCap: number;
}

export interface ConfidenceInterval {
  low: number;
  mid: number;
  high: number;
}

export interface SensitivityAnalysis {
  baseCase: {
    crossoverYear: number;
    orbitalPriceAtCrossover: number;
    groundPriceAtCrossover: number;
  };
  sensitivities: {
    parameter: string;
    baseValue: number;
    testValues: number[];
    crossoverYears: (number | null)[];
    impact: 'high' | 'medium' | 'low';
  }[];
}

export interface UnitDocumentation {
  metric: string;
  unit: string;
  level: string;
  notes: string;
}

export interface MarketProjection {
  provider: string;
  currentPrice: number;
  currentYear: number;
  projectedDecline: number;
  projectedPrices: { year: number; price: number }[];
  orbitalBeatsYear: number | null;
}

export interface ValidationChecks {
  costAccountingValid: boolean;
  costAccountingError: number;
  trajectoryMonotonic: boolean;
  parametersInRange: boolean;
  crossoverConsistent: boolean;
  allChecks: {
    name: string;
    passed: boolean;
    value?: any;
    expected?: any;
  }[];
}

export interface GroundScenarioLabel {
  name: string;
  description: string;
  constraintMultiplier2040: number;
  assumptions: string[];
}

export interface RegulatoryAndLiabilityCosts {
  deorbitCostPerSatellite: number;
  debrisLiabilityReserve: number;
  trafficManagementFees: number;
  insurancePct: number;
  spectrumLicensing: number;
}

export interface ScenarioImpact {
  baselineCrossover: number | null;
  currentCrossover: number | null;
  activeToggles: string[];
  crossoverDelta: number;
}

export interface ModelAnalysis {
  crossover: {
    year: number | null;
    orbitalPrice: number;
    groundPrice: number;
    marketPosition: string;
  };
  sensitivity: SensitivityAnalysis;
  scenarios: {
    name: string;
    description: string;
    crossoverYear: number | null;
    keyAssumptions: string[];
  }[];
  confidence: {
    crossoverYear: {
      p10: number | null;
      p50: number | null;
      p90: number | null;
    };
    priceAtCrossover: {
      low: number;
      mid: number;
      high: number;
    };
    probabilityByYear?: Array<{ year: number; probability: number }>; // Probability orbital cheaper by year X (from Monte Carlo)
  };
  marketComparison: MarketProjection[];
  regulatoryImpact: number;
  scenarioImpact?: ScenarioImpact;
}

export interface FinalModelOutput {
  metadata: {
    version: string;
    generatedAt: string;
    units: UnitDocumentation[];
  };
  parameters: YearParams;
  trajectory: YearlyBreakdown[];
  analysis: ModelAnalysis;
  validation: ValidationChecks;
  groundScenario: GroundScenarioLabel;
}

export interface YearlyBreakdown {
  year: number;
  mode: 'STATIC' | 'DYNAMIC';
  
  // SANITY PANEL: Debug block per year for auditability
  sanityPanel?: {
    ground: {
      effectiveGflopsPerW: number;
      energyCostPerPflopYear: number;
      siteCapexAmort: number;
      delayPenalty: number; // timeToEnergizePenalty
      capacityPremium: number; // capacityDeliveryPremium
      constraintMultiplier: number;
      total: number;
    };
    orbit: {
      effectiveSpecificPower: number; // W/kg
      massMultiplier: number;
      requiredAreaM2: number; // Thermal radiator area required
      areaAvailableM2: number; // Thermal radiator area available
      thermalCapFactor: number;
      total: number;
    };
    allInvariantsPassed: boolean;
  };
  
  ground: {
    electricityPricePerMwh: number;
    pue: number;
    capacityFactor: number;
    gflopsPerWatt: number;
    computeDefinition?: {
      chipName: string;
      precision: 'FP32' | 'FP16' | 'FP8' | 'INT8';
      peakGflopsPerWatt: number;
      utilizationFactor: number;
      effectiveGflopsPerWatt: number;
      notes?: string;
    };
    computeEfficiencyProvenance?: { // Debug: GFLOPS/W breakdown
      peakGflopsPerWatt: number;
      utilizationFactor: number;
      systemOverheadFactor: number;
      effectiveGflopsPerWatt: number;
    };
    energyCostPerPflopYear: number; // Raw electricity cost (NO constraint multiplier)
    siteCostPerPflopYear: number; // Site costs = siteCapexAmort + timeToEnergizePenalty + capacityDeliveryPremium
    siteCapexAmortPerPflopYear?: number; // Pure amortized capex: buildings + power delivery + cooling plant (NOT affected by constraint)
    capacityDeliveryPremium?: number; // Scarcity price for getting firm MW at right place/time (constraint multiplier applied, independent component)
    timeToEnergizePenalty?: number; // Queue delay converts to effective WACC / lost revenue / option value (independent component)
    hardwareCapexPerPflopYear: number;
    constraintMultiplier: number; // Applied to site/capacity/delivery, NOT energy
    constraintBreakdown: {
      grid: number;
      cooling: number;
      water: number;
      land: number;
      energyMultiplier: number; // Always 1.0 - energy NOT affected by constraint
      siteMultiplier: number; // Constraint multiplier for site/capacity costs
      capacityDeliveryMultiplier?: number; // Explicit multiplier for capacity/delivery premium
    };
    supplyMetrics?: {
      demandGw: number;
      capacityGw: number;
      pipelineGw: number;
      maxBuildRateGwYear: number;
      avgWaitYears: number;
      utilizationPct: number;
    };
    constraintComponents?: {
      queuePressure: number;
      utilizationPressure: number;
      scarcityPremium: number;
    };
    // Debug fields for WACC-based penalties
    backlogGw?: number;
    avgWaitYears?: number;
    capexAtRiskPerMW?: number;
    carryCostPerMW?: number;
    lostMarginPerMW?: number;
    timeToEnergizePenaltyPerPflopYear?: number;
    pueMultiplier?: number;
    buildoutDebug?: {
      demandNewGW: number;
      buildableGW: number;
      buildRateGWyr: number;
      capacityGW: number;
      pipelineGW: number;
      scarcityIndex: number;
      buildoutCapex_$PerkW: number;
      annualizedBuildoutPremium_$PerkWyr: number;
      timeToPowerYears: number;
      valueOfTime_$PerYear: number;
      delayPenalty_$PerYear: number;
      buildoutPremiumPerPflopYear: number;
      delayPenaltyPerPflopYear: number;
      // Additional mobilization debug fields
      demandGW?: number;
      demandGrowthRate?: number;
      backlogGW?: number; // From mobilization state
      avgWaitYears?: number; // From mobilization state (alias for timeToPowerYears)
    };
    constraints?: {
      method: 'adders';
      capacityDeliveryPremium: number;
      delayPenalty: number;
      appliedMultipliers: {
        constraintMultiplierUsed: boolean;
        energyMultiplierUsed: boolean;
        siteMultiplierUsed: boolean;
      };
      debug?: {
        doubleCountCheck: {
          mode: 'adders' | 'multipliers';
          multiplierApplied: boolean;
          addersApplied: boolean;
          invariantOk: boolean;
          notes: string;
        };
      };
    };
    replacementOpsInputs?: import('./replacement_ops_config').ReplacementOpsConfig;
    replacementOpsOutputs?: import('./replacement_ops_config').ReplacementOpsOutputs;
    replacementOpsSensitivity?: import('./replacement_ops_config').ReplacementOpsSensitivity;
    totalCostPerPflopYear: number;

    gpuHourPricing: {
      basic: GpuHourPricing;
      standard: GpuHourPricing;
      premium: GpuHourPricing;
    };
    tokenPricing: {
      llama70B: TokenPricing;
      llama405B: TokenPricing;
    };
    
    // SMR Toggle fields
    smrEnabled?: boolean;
    smrRampFactor?: number;
    effectiveElectricityCost?: number;
    constraintRelief?: {
      grid: number;
      cooling: number;
      water: number;
      land: number;
    };
  };
  
  orbit: {
    lcoePerMwh: number;
    pue: number;
    capacityFactor: number;
    capacityFactorProvenance?: { // Debug: CF breakdown to identify discontinuities
      cfBase: number;
      cfEclipse: number;
      cfDegradation: number;
      cfRadiationDowntime: number;
      cfUptime: number;
    };
    gflopsPerWatt: number;
    computeDefinition?: {
      chipName: string;
      precision: 'FP32' | 'FP16' | 'FP8' | 'INT8';
      peakGflopsPerWatt: number;
      utilizationFactor: number;
      effectiveGflopsPerWatt: number;
      notes?: string;
    };
    computeEfficiencyProvenance?: { // Debug: GFLOPS/W breakdown
      peakGflopsPerWatt: number;
      utilizationFactor: number;
      systemOverheadFactor: number;
      effectiveGflopsPerWatt: number;
    };
    launchCostPerKg: number;
    specificPowerWPerKg: number; // Deprecated: use specificPower_subsystem_WPerKg
    specificPower_subsystem_WPerKg?: number; // Subsystem-level (solar array only)
    specificPower_effective_WPerKg?: number; // Effective spacecraft-level
    specificPowerMultipliers?: {
      baseSystem?: number; // Deprecated: use baseSpecificPower
      baseSpecificPower: number; // Subsystem-level (solar array) specific power
      scalingPenalty: number; // Power system scaling penalty
      thermalMultiplier: number; // Thermal mass reduces W/kg (<= 1)
      structureMultiplier: number; // Structure mass reduces W/kg (<= 1)
      massMultiplier: number; // Overhead mass multiplier (>= 1): 1 + overheadMassFrac
      overheadMassFrac: number; // Total overhead mass fraction
      overheadBreakdown: {
        thermal: number;
        structure: number;
        battery: number;
        harness: number;
        avionics: number;
        pointing: number;
        compute: number;
        radiation: number;
        networking: number;
        interconnect: number;
        residual: number; // Unaccounted mass fraction: max(0, 1 - sum(listedFracs))
      };
      product: number; // thermalMultiplier * structureMultiplier * scalingPenalty / massMultiplier
      effective: number; // Effective specific power (must be <= baseSpecificPower)
    };
    energyCostPerPflopYear: number;
    hardwareCostPerPflopYear: number;
    launchCostPerPflopYear: number;
    radiationMultiplier: number;
    thermalCapFactor: number;
    congestionCostPerPflopYear: number;
    totalCostPerPflopYear: number;
    thermalCapped: boolean;
    computePowerKw: number;
    maxRejectableKw: number;
    collisionRisk: number;
    
    // Debug blocks for analysis
    effectiveComputeMultipliers?: {
      thermalCapFactor: number;
      radiationDerate: number;
      availability: number;
      utilization: number;
    };
    costShares?: {
      launch: number;
      power: number;
      compute: number;
      thermal: number;
      bus: number;
      ops: number;
      networking: number;
      groundSegment: number;
    };
    localSensitivity?: {
      dCost_dLaunch: number;
      dCost_dSpecificPower: number;
      dCost_dGflopsPerW: number;
      dCost_dFailureRate: number;
      dCost_dPue: number;
    };
    
    bodyMountedAreaM2: number;
    deployableAreaM2: number;
    totalRadiatorAreaM2: number;
    radiatorCostPerPflopYear: number;
    radiatorMassKg: number;
    
    optimisticCostPerPflop: number;
    radiationShieldingCost: number;
    thermalSystemCost: number;
    replacementRateCost: number;
    replacementAssumptions?: {
      annualFailureRate: number;
      repairabilityFraction: number;
      sparesMultiplier: number;
      replacementMassKg?: number;
      swapLaborCostPerKg?: number;
      logisticsCostPerKg?: number;
      replacementCapexModel: 'replace_mass_fraction' | 'replace_unit_fraction';
    };
    replacementCostBreakdown?: {
      annualReplacementRate: number;
      replacementCapexPerYear: number;
      swapLaborCostPerYear: number;
      logisticsCostPerYear: number;
    };
    replacementSensitivity?: {
      year: number;
      baseCost: number;
      perturbedCost: number;
      ratioObserved: number;
      ratioExpected: number;
    };
    eccOverheadCost: number;
    redundancyCost: number;
    realisticCostPerPflop: number;

    hybridBreakdown: {
      compute: number;
      thermal: number;
      radiation: number;
      power: number;
      bus: number;
      ops: number;
      congestion: number;
      networking: number;
      interconnect: number;
      launch: number;
    };

    gpuHourPricing: {
      basic: GpuHourPricing;
      standard: GpuHourPricing;
      premium: GpuHourPricing;
    };
    tokenPricing: {
      llama70B: TokenPricing;
      llama405B: TokenPricing;
    };

    radiationDegradation?: {
      annualFailureRate: number;
      effectiveComputePercent: number;
      eccOverheadPct: number;
      applied: boolean;
    };
    
    // Fusion Toggle fields
    powerSystemType?: 'solar' | 'fusion';
    scalingPenalty?: number;
    effectiveSpecificPower?: number;
    fusionDetails?: {
      capexPerKw: number;
      radiatorAreaM2: number;
      radiatorTempK: number;
      capacityFactor: number;
    };
    
    // Constellation sizing
    constellation?: {
      design: {
        numSatellites: number;
        computePerSatKw: number;
        massPerSatKg: number;
        radiatorAreaPerSatM2: number;
      };
      launch: {
        satsPerLaunch: number;
        launchesRequired: number;
        totalMassKg: number;
      };
      scaling: {
        constellationOverhead: number;
        scalingEfficiency: number;
      };
      warnings: string[];
    };
  };

  edgeInference?: EdgeInferenceYearData;
  
  market?: {
    totalDemandGW: number;
    orbitalShareFrac: number; // Fraction (0..1), standardized - use this everywhere
    orbitalCapacityGW: number;
    orbitalRevenue: number;
    groundShareFrac: number; // Fraction (0..1), standardized - use this everywhere
    groundCapacityGW: number;
    debug?: {
      shareConvention: 'frac';
      orbitalFeasible: boolean;
      groundFeasible: boolean;
      orbitalShareFrac: number;
      groundShareFrac: number;
      orbitalCapacityGW: number;
      groundCapacityGW: number;
      orbitalRevenue: number;
      groundRevenue: number;
      demandComputeGW?: number;
      groundServedComputeGW?: number;
      orbitServedComputeGW?: number;
      groundFeasibleComputeGW?: number;
      orbitFeasibleComputeGW?: number;
      backlogGW?: number;
      buildRateGWyr?: number;
      avgWaitYears?: number;
      infeasibilityReasons?: string[];
    };
  };
  
  crossover: boolean;
  crossoverDetails?: {
    gpuHourCrossover: boolean;
    tokenCrossover: boolean;
    marketPosition: string;
  };

  costAccountingValid?: boolean;
  costAccountingErrorPct?: number;

  metadata?: {
    units: UnitDocumentation[];
    groundUnits?: UnitDocumentation[];
    orbitUnits?: UnitDocumentation[];
    computeEfficiency: {
      gflopsPerWatt: number;
      computeDefinition?: {
        chipName: string;
        precision: 'FP32' | 'FP16' | 'FP8' | 'INT8';
        peakGflopsPerWatt: number;
        utilizationFactor: number;
        effectiveGflopsPerWatt: number;
        deliveredGflopsPerWatt?: number; // Delivered efficiency (after all derates)
        notes?: string;
      };
      efficiencyLevel: string;
      validation: { 
        valid: boolean; 
        warning?: string;
        invalid?: boolean; // Escalate flag: if true, run is invalid (mismatch > 5%)
        expectedDelivered?: number;
        delivered?: number;
        ratio?: number;
        factorsUsed?: {
          thermalCapFactor: number;
          radiationDerate: number;
          availability: number;
          utilization: number;
          systemOverheadFactor: number;
        };
      };
    };
    chartInputs?: {
      powerBuildout?: {
        demandGw: number;
        supplyGw: number;
        maxBuildRateGwYear: number;
        pipelineGw: number;
        backlogGw: number;
        avgWaitYears: number;
      };
    };
    computeEfficiencyLevels?: {
      peakGflopsPerWatt: number;
      systemEffectiveGflopsPerWatt: number;
      deliveredGflopsPerWatt: number;
    };
  };
  staticLcoe?: number;
}

export interface EdgeInferenceParams {
  enabled: boolean;
  inferenceChipW: number;
  inferenceChipCostUsd: number;
  inferenceChipTopsInt8: number;
  sensorPayloadW: number;
  sensorPayloadCostUsd: number;
  sensorPayloadMassKg: number;
  inferencesPerSecond: number;
  outputBandwidthKbps: number;
  edgeChipRadiationTolerance: number;
  edgeChipFailureRate: number;
  satelliteLifetimeYears: number;
  satelliteBusCostUsd: number;
  groundDownlinkCostPerGB: number;
  groundProcessingCostPerInference: number;
  latencyPenaltyMultiplier: number;
  baseDemandBillionInferences2025: number;
  demandGrowthRate: number;
  applications: {
    earthObservation: number;
    maritime: number;
    defense: number;
    infrastructure: number;
  };
}

export interface EdgeInferenceYearData {
  year: number;
  mode: 'EDGE_INFERENCE';
  satelliteCostUsd: number;
  chipCost: number;
  sensorCost: number;
  launchCost: number;
  inferencesPerSatPerYear: number;
  costPerBillionInferences: number;
  groundCostPerBillionInferences: number;
  satellitesNeeded: number;
  fleetCapexUsd: number;
  crossover: boolean;
  savingsVsGround: number;
  revenuePerYear?: number;
  annualCost?: number;
  profitMargin?: number;
  breakdown: {
    busCost: number;
    inferenceChipCost: number;
    sensorCost: number;
    radiatorCost: number;
    launchCost: number;
  };
}

export interface YearParams {
  year: number;
  isStaticMode: boolean;
  spaceTrafficEnabled: boolean;
  edgeInference?: EdgeInferenceParams;
  launchCostKg: number;
  specificPowerWKg: number;
  groundEffectiveGflopsPerW_2025?: number; // Ground effective GFLOPS/W (2025 baseline, interpreted as GFLOPS/W)
  orbitEffectiveGflopsPerW_2025?: number; // Orbital effective GFLOPS/W (2025 baseline, interpreted as GFLOPS/W)
  // Legacy parameter names (for backward compatibility with UI)
  flopsPerWattGround?: number; // DEPRECATED: Use groundEffectiveGflopsPerW_2025 or gflopsPerWattGround2025. No conversion - already in GFLOPS/W.
  flopsPerWattOrbital?: number; // DEPRECATED: Use orbitEffectiveGflopsPerW_2025 or gflopsPerWattOrbital2025. No conversion - already in GFLOPS/W.
  gflopsPerWattGround2025?: number; // Standardized name: ground efficiency in GFLOPS/W (no conversion)
  gflopsPerWattOrbital2025?: number; // Standardized name: orbital efficiency in GFLOPS/W (no conversion)
  orbitalAltitude: number;
  pueGround: number;
  pueOrbital: number;
  capacityFactorGround: number;
  capacityFactorOrbital: number;
  targetGW: number;
  satellitePowerKW: number;
  satelliteCostPerW: number;
  sunFraction: number;
  cellDegradation: number;
  gpuFailureRate: number;
  nreCost: number;
  eccOverhead: number;
  radiatorAreaM2: number;
  radiatorTempC: number;
  orbitalPhysicsModel?: IntegratedPhysicsParams;
  groundConstraintsEnabled: boolean;
  useRegionalGroundModel?: boolean;  // Use regional supply model instead of constraint multiplier
  useQueueBasedConstraint?: boolean;  // Use queue-based demand-driven constraint model
  useBuildoutModel?: boolean;  // Use MW buildout constraint model (replaces constraint multiplier)
  // Buildout model parameters
  demandNewGWByYear?: number; // Incremental datacenter load (GW)
  buildableGWByYear?: number; // Incremental grid-deliverable capacity (GW)
  buildRateGWyr?: number; // Build rate (GW/year) - can be constrained by bottlenecks
  // Ramping mobilization model parameters
  mobilizationParams?: {
    demandAnchorsGW: {
      2025: number;
      2040: number;
      2060: number;
    };
    demandCurve?: 'piecewise_exponential'; // Curve type (defaults to piecewise_exponential)
    demandIsFacilityLoad: boolean; // If true, includes PUE; if false, multiply by PUE later
    buildoutAnchorsGWyr: {
      2025: number;
      2030: number;
      2040: number;
      2060: number;
    };
    buildoutSmoothingYears: number;
    pipelineLeadTimeYears: number;
    pipelineFillFrac: number;
  };
  buildoutCapexBase_$PerkW?: number; // Base buildout capex ($/kW)
  buildoutCapexScarcityCurve?: {
    k: number; // Scaling factor (buildoutK)
    exponent: number; // Exponent for convex premium (buildoutExponent)
    thresholdUtil: number; // Utilization threshold before premium kicks in
  };
  buildoutPanicExponent?: number; // Exponent for delay penalty panic regime (default 1.3)
  valueOfTimeMode?: 'wacc_on_capex' | 'lost_margin' | 'hybrid';
  buildoutProjectLifetimeYears?: number; // Project lifetime for amortization
  buildoutHybridWeights?: {
    waccWeight: number;
    marginWeight: number;
  };
  useCorrectedThermal?: boolean;     // Use corrected thermal physics (2.7x fix)
  useCorrectedSpecificPower?: boolean; // Use corrected system-level specific power
  powerGridMultiplier: number;
  coolingMultiplier: number;
  waterScarcityEnabled: boolean;
  landScarcityEnabled: boolean;
  radiationOverheadEnabled: boolean;
  deployableRadiatorsEnabled: boolean;
  bodyMountedAreaM2: number;
  deployableArea2025M2: number;
  deployableArea2040M2: number;
  deployableMassPerM2Kg: number;
  deployableCostPerM2Usd: number;
  deploymentFailureRate: number;
  useRadHardChips: boolean;
  groundScenario: GroundScenario;
  smrMitigationEnabled: boolean;
  workloadType: WorkloadType;
  efficiencyLevel?: 'chip' | 'system' | 'datacenter';

  // Scenario Toggles
  elonScenarioEnabled: boolean;
  globalLatencyRequirementEnabled: boolean;
  spaceManufacturingEnabled: boolean;
  aiWinterEnabled: boolean;
  smrToggleEnabled: boolean;
  fusionToggleEnabled: boolean;
  smrToggleParams?: SMRToggleParams;
  fusionToggleParams?: SpaceFusionParams;
  powerScalingParams?: PowerScalingParams;
}

export interface SMRToggleParams {
  enabled: boolean;
  smrDeploymentStartYear: number;
  smrRampUpYears: number;
  electricityCostWithSMR: number;
  gridConstraintRelief: number;
  coolingConstraintRelief: number;
  waterConstraintRelief: number;
  landConstraintRelief: number;
  smrCapexPremium: number;
}

export interface SpaceFusionParams {
  enabled: boolean;
  fusionAvailableYear: number;
  fusionMatureYear: number;
  fusionSpecificPower2035: number;
  fusionSpecificPower2045: number;
  fusionSpecificPower2050: number;
  fusionLearningRate: number;
  fusionCapexPerKw2035: number;
  fusionCapexPerKw2045: number;
  fusionCapexPerKw2050: number;
  fusionOpexPerKwhYear: number;
  fusionThermalEfficiency: number;
  fusionOperatingTempK: number;
  fusionWasteHeatFraction: number;
  fusionRadiatorTempK: number;
  fusionRadiatorMassPerM2: number;
}

export interface PowerScalingParams {
  referencePowerKw: number;
  referenceMassKg: number;
  solarScalingExponent: number;
  radiatorScalingExponent: number;
  structureScalingExponent: number;
  batteryScalingExponent: number;
  computeScalingExponent: number;
  solarMassFraction: number;
  radiatorMassFraction: number;
  structureMassFraction: number;
  batteryMassFraction: number;
  computeMassFraction: number;
}
