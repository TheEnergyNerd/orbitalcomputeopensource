/**
 * GROUND EQUIVALENT SYSTEM (FUTURE-PROJECTED)
 * Only three drivers: Learning Rate, Energy Price Drift, Carbon Penalty
 * Ground must: Improve, Flatten, Asymptote - NEVER oscillate
 */

export interface GroundSystemConfig {
  learning_rate: number; // 12% per doubling
  energy_price_drift: number; // ±2% per year
  carbon_penalty_escalation: number; // Monotonic escalation
  base_ground_cost_per_compute: number; // Base cost in $/PFLOP
  base_energy_price: number; // $/MWh
  base_carbon_intensity: number; // kg CO2/MWh
}

export const DEFAULT_GROUND_CONFIG: GroundSystemConfig = {
  learning_rate: 0.12, // 12% per doubling
  energy_price_drift: 0.02, // ±2% per year
  carbon_penalty_escalation: 0.05, // 5% per year
  base_ground_cost_per_compute: 340, // $/PFLOP
  base_energy_price: 50, // $/MWh
  base_carbon_intensity: 0.3, // kg CO2/MWh
};

/**
 * Calculate ground cost over time
 * Ground_Cost(t) = Base_Ground_Cost × (1 - Learning_Rate)^years
 * 
 * Learning rate applies per doubling of compute capacity
 */
export function calculateGroundCost(
  baseCost: number,
  years: number,
  learningRate: number = DEFAULT_GROUND_CONFIG.learning_rate
): number {
  // Learning rate applies per doubling
  // If compute doubles every 2 years, that's 0.5 doublings per year
  const doublingsPerYear = 0.5; // Conservative estimate
  const totalDoublings = doublingsPerYear * years;
  
  // Cost decreases by learning rate per doubling
  return baseCost * Math.pow(1 - learningRate, totalDoublings);
}

/**
 * Calculate ground energy price over time
 * Energy_Price(t) = Base_Price × (1 + drift)^years
 */
export function calculateGroundEnergyPrice(
  basePrice: number,
  years: number,
  drift: number = DEFAULT_GROUND_CONFIG.energy_price_drift
): number {
  return basePrice * Math.pow(1 + drift, years);
}

/**
 * Calculate ground carbon intensity over time
 * Carbon must escalate monotonically (never decrease)
 */
export function calculateGroundCarbonIntensity(
  baseIntensity: number,
  years: number,
  escalation: number = DEFAULT_GROUND_CONFIG.carbon_penalty_escalation
): number {
  // Carbon intensity increases (penalty escalates)
  return baseIntensity * Math.pow(1 + escalation, years);
}

/**
 * Calculate total ground cost (compute + energy + carbon)
 */
export function calculateTotalGroundCost(
  compute_PFLOPs: number,
  year: number,
  config: GroundSystemConfig = DEFAULT_GROUND_CONFIG
): number {
  const computeCost = calculateGroundCost(
    config.base_ground_cost_per_compute,
    year,
    config.learning_rate
  ) * compute_PFLOPs;
  
  // Energy cost (simplified - assumes energy scales with compute)
  const energyPrice = calculateGroundEnergyPrice(
    config.base_energy_price,
    year,
    config.energy_price_drift
  );
  const energyCost = compute_PFLOPs * energyPrice * 0.001; // Simplified scaling
  
  // Carbon cost (penalty escalates)
  const carbonIntensity = calculateGroundCarbonIntensity(
    config.base_carbon_intensity,
    year,
    config.carbon_penalty_escalation
  );
  const carbonCost = compute_PFLOPs * carbonIntensity * 0.1; // Simplified carbon penalty
  
  return computeCost + energyCost + carbonCost;
}

