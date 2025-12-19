export interface CongestionResult {
  collisionRisk: number;
  congestionCostPerPflopYear: number;
}

// BLOCKER 1: Congestion toggle for publication runs
const SPACE_TRAFFIC_ENABLED = false; 

/**
 * FIXED: Congestion/collision gate and bound
 * risk = 1 - exp(-k * conjunctionRate)
 * 2025 baseline risk ~1e-4 to 1e-2
 */
export function calculateCongestion(
  satelliteCount: number,
  satelliteCost: number,
  year: number = 2025,
  totalLeoPopulation: number = 10000,
  spaceTrafficEnabled: boolean = false
): CongestionResult {
  // Use either the global publication toggle OR the parameter passed from UI
  const isEnabled = SPACE_TRAFFIC_ENABLED || spaceTrafficEnabled;

  // CRITICAL FIX: Realistic per-satellite collision risk (annual probability)
  // Base risk per satellite per year (from NASA ORDEM model and insurance data)
  // Typical LEO insurance is 1-3% of hull value per year
  const baseRiskPerSatPerYear = 0.01; // 1% per year per satellite (conservative baseline)
  
  // Risk grows with debris density (Kessler effect) and constellation size
  const debrisGrowthRate = 1.02; // 2% more debris per year (conservative)
  const yearsFromBase = Math.max(0, year - 2025);
  const debrisMultiplier = Math.pow(debrisGrowthRate, yearsFromBase);
  
  // Constellation density effect: more satellites in same orbital shell increases collision risk
  // Use a saturating function: risk increases with density but caps at realistic maximum
  const densityFactor = Math.min(2.0, 1 + Math.log10(1 + satelliteCount / 1000)); // Caps at 2x for very large constellations
  
  // Per-satellite annual collision probability
  // Cap at 3% (0.03) as per insurance industry standards for LEO
  const annualCollisionProbability = Math.min(0.03, baseRiskPerSatPerYear * debrisMultiplier * densityFactor);
  
  if (!isEnabled) {
    return {
      collisionRisk: annualCollisionProbability, // Still calculate for display
      congestionCostPerPflopYear: 0 // But do NOT add to costs
    };
  }

  // Economic impact = insurance + maneuver costs + expected loss
  const insuranceCostMultiplier = 1 + annualCollisionProbability * 10; // ~1.01 to 1.05
  const insuranceCostPerSat = satelliteCost * (insuranceCostMultiplier - 1) * 0.1; // 10% of multiplier as cost
  const maneuverCostPerSat = 500; // propellant + ops
  const expectedLossPerSat = annualCollisionProbability * satelliteCost;
  
  const totalCongestionCost = satelliteCount * (insuranceCostPerSat + maneuverCostPerSat + expectedLossPerSat);
  
  return {
    collisionRisk: annualCollisionProbability,
    congestionCostPerPflopYear: totalCongestionCost
  };
}
