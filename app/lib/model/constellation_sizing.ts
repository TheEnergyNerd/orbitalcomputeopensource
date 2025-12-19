/**
 * Constellation Sizing Model
 * 
 * Automatically splits large compute requirements into multiple satellites
 * instead of building impractically large single satellites.
 */

export interface SatelliteConstraints {
  minComputeKw: number;      // Minimum viable satellite
  maxComputeKw: number;      // Maximum practical satellite
  optimalComputeKw: number;  // Sweet spot for efficiency
  maxMassKg: number;         // Largest practical satellite
  maxRadiatorAreaM2: number; // Deployable radiator limit
}

export const SATELLITE_CONSTRAINTS: SatelliteConstraints = {
  minComputeKw: 50,          // Below this, overhead dominates
  maxComputeKw: 200,         // Above this, thermal becomes hard
  optimalComputeKw: 100,     // Best $/kW
  maxMassKg: 10000,          // 10 tons max (Starship can do 100t to LEO)
  maxRadiatorAreaM2: 500,    // Practical deployable limit
};

export interface ConstellationDesign {
  // Per satellite
  computePerSatKw: number;
  massPerSatKg: number;
  radiatorAreaPerSatM2: number;
  
  // Constellation
  numSatellites: number;
  totalComputeKw: number;
  totalMassKg: number;
  
  // Economics
  launchesRequired: number;
  satsPerLaunch: number;
  constellationOverhead: number;  // Extra cost for coordination
  scalingEfficiency: number;  // 1.0 = no penalty, <1.0 = overhead
  
  // Warnings
  warnings: string[];
}

/**
 * Calculate satellite mass for a given compute power
 */
export function calculateSatelliteMass(
  computeKw: number,
  specificPowerWkg: number = 36.5,
  wasteHeatFraction: number = 0.25
): number {
  // Solar array mass
  const solarMassKg = (computeKw * 1000) / specificPowerWkg;
  
  // Radiator mass (waste heat rejection)
  const wasteHeatKw = computeKw * wasteHeatFraction;
  const radiatorAreaM2 = (wasteHeatKw * 1000) / 500; // 500 W/m² flux
  const radiatorMassKg = radiatorAreaM2 * 3; // ~3 kg/m²
  
  // Compute hardware mass (~5 kg/kW)
  const computeMassKg = computeKw * 5;
  
  // Battery mass (for eclipse, ~2 kg/kW)
  const batteryMassKg = computeKw * 2;
  
  // Bus/structure (20% of payload)
  const payloadMass = solarMassKg + radiatorMassKg + computeMassKg + batteryMassKg;
  const structureMassKg = payloadMass * 0.2;
  
  return payloadMass + structureMassKg;
}

/**
 * Design a constellation to meet compute requirements
 */
export function designConstellation(
  targetComputeKw: number,
  constraints: SatelliteConstraints = SATELLITE_CONSTRAINTS,
  launchCapacityKg: number = 100000,  // Starship: 100t to LEO
  specificPowerWkg: number = 36.5
): ConstellationDesign {
  
  // Determine optimal satellite size
  let computePerSatKw: number;
  
  if (targetComputeKw <= constraints.maxComputeKw) {
    // Small enough for single satellite
    computePerSatKw = Math.max(targetComputeKw, constraints.minComputeKw);
  } else {
    // Need constellation - use optimal size
    computePerSatKw = constraints.optimalComputeKw;
  }
  
  // Calculate number of satellites
  const numSatellites = Math.ceil(targetComputeKw / computePerSatKw);
  
  // Recalculate actual compute per sat (may be slightly less than optimal)
  const actualComputePerSat = targetComputeKw / numSatellites;
  
  // Calculate mass per satellite
  let massPerSatKg = calculateSatelliteMass(actualComputePerSat, specificPowerWkg);
  
  // Verify mass constraint - if too heavy, recursively reduce size
  if (massPerSatKg > constraints.maxMassKg) {
    // Need even smaller satellites
    const adjustedComputePerSat = actualComputePerSat * (constraints.maxMassKg / massPerSatKg);
    return designConstellation(targetComputeKw, {
      ...constraints,
      maxComputeKw: adjustedComputePerSat,
    }, launchCapacityKg, specificPowerWkg);
  }
  
  // Calculate radiator area per satellite
  const wasteHeatKw = actualComputePerSat * 0.25;  // 25% waste
  const radiatorAreaPerSatM2 = (wasteHeatKw * 1000) / 500;  // 500 W/m²
  
  // Total constellation
  const totalMassKg = numSatellites * massPerSatKg;
  
  // Launch planning
  const satsPerLaunch = Math.floor(launchCapacityKg / massPerSatKg);
  const launchesRequired = Math.ceil(numSatellites / satsPerLaunch);
  
  // Constellation overhead (networking, coordination, ground stations)
  // More satellites = more overhead, but diminishing
  // Formula: 1 + 0.05 * log10(numSatellites)
  const constellationOverhead = numSatellites === 1 
    ? 1.0 
    : 1 + 0.05 * Math.log10(numSatellites);
  
  // Scaling efficiency (inverse of overhead)
  const scalingEfficiency = 1 / constellationOverhead;
  
  // Generate warnings
  const warnings: string[] = [];
  
  if (massPerSatKg > 8000) {
    warnings.push(`Large satellite mass (${massPerSatKg.toFixed(0)} kg) - near practical limits`);
  }
  
  if (numSatellites > 100) {
    warnings.push(`Large constellation (${numSatellites} satellites) - significant coordination overhead`);
  }
  
  if (radiatorAreaPerSatM2 > 400) {
    warnings.push(`Large radiator area (${radiatorAreaPerSatM2.toFixed(0)} m²) - deployment complexity`);
  }
  
  if (numSatellites === 1 && massPerSatKg > constraints.maxMassKg * 0.8) {
    warnings.push(`Single satellite near mass limit - consider constellation`);
  }
  
  return {
    computePerSatKw: actualComputePerSat,
    massPerSatKg,
    radiatorAreaPerSatM2,
    numSatellites,
    totalComputeKw: targetComputeKw,
    totalMassKg,
    launchesRequired,
    satsPerLaunch,
    constellationOverhead,
    scalingEfficiency,
    warnings,
  };
}

/**
 * Check if constellation warning should be shown
 */
export function shouldShowMassWarning(constellation: ConstellationDesign): boolean {
  // If we properly split into constellation, no warning needed
  if (constellation.numSatellites > 1 && constellation.massPerSatKg < 10000) {
    return false;  // Constellation handles it
  }
  
  // Warning if single satellite is too big
  if (constellation.numSatellites === 1 && constellation.massPerSatKg > 10000) {
    return true;
  }
  
  return false;
}


