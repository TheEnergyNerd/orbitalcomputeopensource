import { YearParams } from '../types';

/**
 * STATIC BASELINE (2025 Standard)
 * Used to prove invariance and provide a control case for orbital economics.
 * Freezes all time-varying parameters (launch cost, Moore's Law, etc.).
 */
export function getStaticParams(year: number): YearParams {
  return {
    year,
    isStaticMode: true,
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
    
    // Frozen Economics
    electricityPricePerMwh: 50,
    siteCapexPerKw: 2000,
    hardwareCapexPerKw: 3000,
    wacc: 0.10,
    projectLifetimeYears: 10,
    
    // Frozen Technology
    gflopsPerWattGround2025: 30,
    gflopsPerWattOrbital2025: 25,
    
    // No time-varying parameters
    targetGW: 100,
    satellitePowerKW: 100,
    satelliteCostPerW: 10,
    sunFraction: 0.95,
    cellDegradation: 0.005,
    gpuFailureRate: 0.05,
    nreCost: 1000000,
    eccOverhead: 0.1,
    
    // No constraints
    groundConstraintCap: 1.5,
    orbitalConstraintCap: 1.0,
    
    // No learning curves
    launchLearningEnabled: false,
    mooresLawEnabled: false,
  };
}

