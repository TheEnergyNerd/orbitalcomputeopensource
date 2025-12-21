/**
 * Space Congestion Model
 * Models orbital shell capacity, debris accumulation, conjunction rates, and thermal interference
 */

export interface CongestionConfig {
  // Shell capacity (satellites per shell before congestion penalty)
  shellCapacity: {
    LEO_550km: number;
    LEO_340km: number;
    LEO_1100km: number;
    MEO: number;
    GEO: number;
  };
  
  // Conjunction avoidance
  conjunctionRatePerSatPerYear: number;        // Maneuvers needed
  fuelPerManeuver_kg: number;                  // Propellant cost
  maneuverDowntime_hours: number;              // Compute offline during maneuver
  
  // Debris/Kessler
  debrisGenerationPerFailure: number;         // Trackable fragments per dead sat
  debrisDecayRate_LEO: number;                // 10% of debris deorbits per year (low LEO)
  collisionProbabilityPerDebris: number;       // Per sat per debris item per year
  
  // Thermal interference (training clusters)
  thermalInterferenceRadius_km: number;       // Sats within this range affect each other
  thermalPenaltyPerNeighbor: number;           // 2% efficiency loss per nearby sat
  
  // Spectrum congestion
  opticalInterferenceAngle_deg: number;       // Beam exclusion zone
  rfSpectrumCapacity_Gbps: number;            // Total downlink capacity to ground
}

// Scale factor to reduce deployment to 150 GW target (150k satellites at 1 MW each)
const DEPLOYMENT_SCALE = 0.64;

export const CONGESTION_MODEL: CongestionConfig = {
  shellCapacity: {
    LEO_550km: Math.round(80_000 * DEPLOYMENT_SCALE),    // Scaled to 150 GW target (51,200)
    LEO_340km: Math.round(30_000 * DEPLOYMENT_SCALE),    // Scaled to 150 GW target (19,200)
    LEO_1100km: Math.round(50_000 * DEPLOYMENT_SCALE),   // Scaled to 150 GW target (32,000)
    MEO: Math.round(60_000 * DEPLOYMENT_SCALE),          // Scaled to 150 GW target (38,400) - MEO_8000 + MEO_20000 combined
    GEO: 500,             // Very limited slots (unchanged)
  },
  
  conjunctionRatePerSatPerYear: 2.5,        // Maneuvers needed
  fuelPerManeuver_kg: 0.1,                  // Propellant cost
  maneuverDowntime_hours: 0.5,              // Compute offline during maneuver
  
  debrisGenerationPerFailure: 10,           // Trackable fragments per dead sat
  debrisDecayRate_LEO: 0.1,                 // 10% of debris deorbits per year (low LEO)
  collisionProbabilityPerDebris: 0.000001,  // Per sat per debris item per year
  
  thermalInterferenceRadius_km: 5,          // Sats within this range affect each other
  thermalPenaltyPerNeighbor: 0.02,          // 2% efficiency loss per nearby sat
  
  opticalInterferenceAngle_deg: 2,          // Beam exclusion zone
  rfSpectrumCapacity_Gbps: 100_000,         // Total downlink capacity to ground
};

export interface CongestionMetrics {
  shellUtilization: number;              // % of shell capacity used
  conjunctionsPerYear: number;          // Maneuvers fleet-wide
  accumulatedDebris: number;            // Trackable debris objects
  annualCollisionProbability: number;   // P(at least one collision)
  avgThermalPenalty: number;            // Efficiency loss from clustering
  congestionCostAnnual: number;         // $ cost of congestion
}

/**
 * Get shell congestion factor (1.0 = no penalty, <1.0 = penalty above capacity)
 */
export function getShellCongestion(shellName: string, satCount: number): number {
  const capacityMap: Record<string, number> = {
    'VLEO': CONGESTION_MODEL.shellCapacity.LEO_340km,
    'MID-LEO': CONGESTION_MODEL.shellCapacity.LEO_550km,
    'SSO': CONGESTION_MODEL.shellCapacity.LEO_1100km,
    'MEO': CONGESTION_MODEL.shellCapacity.MEO,
    'GEO': CONGESTION_MODEL.shellCapacity.GEO,
  };
  
  const capacity = capacityMap[shellName] || CONGESTION_MODEL.shellCapacity.LEO_550km;
  if (satCount <= capacity) return 1.0; // No penalty
  
  // Exponential penalty above capacity
  const overload = satCount / capacity;
  return 1.0 / Math.pow(overload, 0.5); // Square root penalty
}

/**
 * Calculate conjunction/maneuver costs
 */
export function getConjunctionCosts(
  fleetSize: number,
  debrisCount: number,
  costPerKgToLeo: number,
  computeValuePerHour: number
): {
  maneuversPerYear: number;
  fuelCost: number;
  downtimeCost: number;
} {
  const baseRate = CONGESTION_MODEL.conjunctionRatePerSatPerYear;
  const debrisMultiplier = 1 + (debrisCount / 100_000); // More debris = more maneuvers
  
  const maneuversPerYear = fleetSize * baseRate * debrisMultiplier;
  const fuelCost = maneuversPerYear * CONGESTION_MODEL.fuelPerManeuver_kg * costPerKgToLeo;
  const downtimeCost = maneuversPerYear * CONGESTION_MODEL.maneuverDowntime_hours * computeValuePerHour;
  
  return { maneuversPerYear, fuelCost, downtimeCost };
}

/**
 * Calculate accumulated debris (Kessler model)
 */
export function getAccumulatedDebris(
  year: number,
  startYear: number,
  failuresByYear: Record<number, number>
): number {
  let debris = 1000; // Starting debris count (existing space junk)
  
  for (let y = startYear; y <= year; y++) {
    const failures = failuresByYear[y] || 0;
    const newDebris = failures * CONGESTION_MODEL.debrisGenerationPerFailure;
    const decayed = debris * CONGESTION_MODEL.debrisDecayRate_LEO;
    debris = debris + newDebris - decayed;
  }
  
  return Math.max(0, debris);
}

/**
 * Calculate collision risk
 * FIXED: bounded formula risk = 1 - exp(-k * conjunctions)
 */
export function getCollisionRisk(
  fleetSize: number,
  debrisCount: number
): {
  annualCollisionProbability: number;
  expectedCollisionsPerYear: number;
} {
  const k = 0.0001; // Scaling factor to prevent saturation in baseline
  const riskPerSat = debrisCount * CONGESTION_MODEL.collisionProbabilityPerDebris;
  const expectedCollisions = fleetSize * riskPerSat;
  
  // FIXED: risk = 1 - exp(-k * expectedCollisions)
  let annualCollisionProbability = 1 - Math.exp(-k * expectedCollisions);
  
  // HARD CLAMP: risk = min(risk, 0.3) unless traffic apocalypse enabled
  annualCollisionProbability = Math.min(annualCollisionProbability, 0.3);
  
  return {
    annualCollisionProbability,
    expectedCollisionsPerYear: expectedCollisions,
  };
}

/**
 * Calculate thermal penalty for dense clusters
 */
export function getThermalPenalty(
  clusterSats: Array<{ x: number; y: number; z: number }>,
  center: { x: number; y: number; z: number }
): number {
  const radius = CONGESTION_MODEL.thermalInterferenceRadius_km;
  const neighbors = clusterSats.filter(sat => {
    const dx = sat.x - center.x;
    const dy = sat.y - center.y;
    const dz = sat.z - center.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distance < radius;
  }).length;
  
  return Math.max(0, 1 - (neighbors * CONGESTION_MODEL.thermalPenaltyPerNeighbor));
}

/**
 * Calculate comprehensive congestion metrics
 */
export function calculateCongestionMetrics(
  year: number,
  startYear: number,
  fleetSize: number,
  shellName: string,
  failuresByYear: Record<number, number>,
  costPerKgToLeo: number,
  computeValuePerHour: number
): CongestionMetrics {
  const shellUtilization = getShellUtilization(shellName, fleetSize);
  const accumulatedDebris = getAccumulatedDebris(year, startYear, failuresByYear);
  const { maneuversPerYear, fuelCost, downtimeCost } = getConjunctionCosts(
    fleetSize,
    accumulatedDebris,
    costPerKgToLeo,
    computeValuePerHour
  );
  const { annualCollisionProbability } = getCollisionRisk(fleetSize, accumulatedDebris);
  
  // Congestion cost components
  const debrisTracking = fleetSize * 1000;  // $1k/sat/year for tracking services
  const insurancePremium = fleetSize * annualCollisionProbability * 1_000_000; // Risk-adjusted insurance
  let congestionCostAnnual = fuelCost + downtimeCost + debrisTracking + insurancePremium;
  
  // Note: Cap logic happens in yearSteppedDeployment to have access to total orbit cost
  
  // Thermal penalty (simplified - would need actual cluster positions)
  const avgThermalPenalty = 0.95; // Assume 5% average penalty for dense clusters
  
  return {
    shellUtilization,
    conjunctionsPerYear: maneuversPerYear,
    accumulatedDebris,
    annualCollisionProbability,
    avgThermalPenalty,
    congestionCostAnnual,
  };
}

/**
 * Get shell utilization percentage
 */
function getShellUtilization(shellName: string, satCount: number): number {
  // Map new shell IDs to congestion capacities
  const capacityMap: Record<string, number> = {
    'LEO_340': CONGESTION_MODEL.shellCapacity.LEO_340km,
    'LEO_550': CONGESTION_MODEL.shellCapacity.LEO_550km,
    'LEO_1100': CONGESTION_MODEL.shellCapacity.LEO_1100km,
    'MEO_8000': CONGESTION_MODEL.shellCapacity.MEO,
    'MEO_20000': CONGESTION_MODEL.shellCapacity.MEO,
    // Legacy mappings for compatibility
    'VLEO': CONGESTION_MODEL.shellCapacity.LEO_340km,
    'MID-LEO': CONGESTION_MODEL.shellCapacity.LEO_550km,
    'SSO': CONGESTION_MODEL.shellCapacity.LEO_1100km,
    'MEO': CONGESTION_MODEL.shellCapacity.MEO,
    'GEO': CONGESTION_MODEL.shellCapacity.GEO,
  };
  
  const capacity = capacityMap[shellName] || CONGESTION_MODEL.shellCapacity.LEO_550km;
  return Math.min(1, satCount / capacity);
}

