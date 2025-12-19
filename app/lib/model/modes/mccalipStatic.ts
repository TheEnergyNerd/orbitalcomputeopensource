import { YearParams } from '../types';

/**
 * MCCALIP STATIC BASELINE (2025 Standard)
 * Used to prove invariance and provide a control case for orbital economics.
 * Freezes all time-varying parameters (launch cost, Moore's Law, etc.).
 */
export function getMcCalipStaticParams(year: number): YearParams {
  return {
    year,
    isMcCalipMode: true,
    spaceTrafficEnabled: false,
    workloadType: 'inference',
    useRadHardChips: false,
    groundScenario: 'unconstrained',  // Use unconstrained scenario (low growth, 1.5x cap)
    smrMitigationEnabled: false,
    
    // Frozen Trajectories (2025 baseline values)
    launchCostKg: 1500,
    specificPowerWKg: 36.5,
    groundEffectiveGflopsPerW_2025: 30,  // Ground effective GFLOPS/W (2025 baseline)
    orbitEffectiveGflopsPerW_2025: 25, // Orbital effective GFLOPS/W (2025 baseline)
    
    // Frozen Constraints
    orbitalAltitude: 1000,
    pueGround: 1.3,
    pueOrbital: 1.05,
    capacityFactorGround: 0.85,
    capacityFactorOrbital: 0.98,
    
    // Constants
    targetGW: 1,
    satellitePowerKW: 100,
    satelliteCostPerW: 22,
    sunFraction: 0.98,
    cellDegradation: 0.02,  // Realistic degradation (was 0)
    gpuFailureRate: 0.10,   // Realistic failure rate for rad-tolerant (was 0)
    nreCost: 100,
    
    // Multipliers
    eccOverhead: 0.05,      // Realistic ECC overhead (was 0.15)
    radiatorAreaM2: 75,
    radiatorTempC: 97,
    
    // Toggles - IMPORTANT: Keep constraints enabled for fair comparison
    // McCalip mode should freeze parameters but NOT artificially favor orbital
    groundConstraintsEnabled: true,  // FIXED: Enable constraints for fair comparison
    powerGridMultiplier: 1.0,
    coolingMultiplier: 1.0,
    waterScarcityEnabled: false,
    landScarcityEnabled: false,
    radiationOverheadEnabled: false,
    
    // Deployable Radiators (Disabled for static)
    deployableRadiatorsEnabled: false,
    bodyMountedAreaM2: 25,
    deployableArea2025M2: 50,
    deployableArea2040M2: 50,
    deployableMassPerM2Kg: 2.5,
    deployableCostPerM2Usd: 500,
    deploymentFailureRate: 0.02,
    
    // Scenario toggles (all disabled for static baseline)
    elonScenarioEnabled: false,
    globalLatencyRequirementEnabled: false,
    spaceManufacturingEnabled: false,
    aiWinterEnabled: false,
    smrToggleEnabled: false,
    fusionToggleEnabled: false
  };
}
