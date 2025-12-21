/**
 * Clean Ground Economics Model
 * 
 * Design Principles:
 * 1. Single source of truth - One demand calculation, one price calculation
 * 2. Explicit state - No hidden state, everything passed as parameters
 * 3. Testable - Pure functions that can be unit tested
 * 4. Simple feedback - Clear cause → effect relationships
 * 
 * Key insight: Smooth the INPUTS (prices), not the OUTPUTS (demand)
 * This prevents feedback oscillation at the source.
 */

export interface DemandResult {
  year: number;
  baselineDemandGW: number;      // Exogenous growth (no price response)
  groundDemandGW: number;        // After price elasticity + orbital substitution
  orbitalDemandGW: number;       // Shifted to orbital
  orbitalShareFrac: number;      // 0-1 fraction
}

/**
 * Calculate demand for a single year
 * 
 * Key insight: Use SMOOTHED inputs, not smoothed outputs
 * This prevents feedback oscillation at the source
 */
export function calculateDemand(
  year: number,
  smoothedGroundPrice: number,    // Exponential moving average of ground price
  smoothedOrbitalPrice: number,   // Exponential moving average of orbital price
  prevOrbitalShare: number,       // Previous year's orbital share (for gradual transition)
): DemandResult {
  // 1. Baseline demand: 10% CAGR with taper after 2040
  const yearsFrom2025 = year - 2025;
  const growthRate = yearsFrom2025 <= 15 ? 0.10 : 0.05;  // 10% until 2040, then 5%
  const baselineDemandGW = 120 * Math.pow(1.10, Math.min(yearsFrom2025, 15)) 
                              * Math.pow(1.05, Math.max(0, yearsFrom2025 - 15));
  
  // 2. Price elasticity on SMOOTHED price (prevents oscillation)
  const referencePrice = 4.00;  // $/GPU-hr
  const elasticity = -0.2;      // 20% demand drop per 2x price
  const priceRatio = smoothedGroundPrice / referencePrice;
  const priceFactor = Math.pow(priceRatio, elasticity);
  
  // 3. Orbital substitution (gradual, max 10% shift per year)
  const priceAdvantage = smoothedGroundPrice / Math.max(smoothedOrbitalPrice, 0.01);
  let targetOrbitalShare = 0;
  if (priceAdvantage > 1.0) {
    // Logistic curve: 50% at 2x price advantage
    targetOrbitalShare = 1 / (1 + Math.exp(-2 * (priceAdvantage - 1.5)));
  }
  
  // Gradual transition (max 10% per year)
  const maxShareChange = 0.10;
  const shareChange = Math.max(-maxShareChange, Math.min(maxShareChange, targetOrbitalShare - prevOrbitalShare));
  const orbitalShareFrac = prevOrbitalShare + shareChange;
  
  // 4. Final demands
  const totalEffectiveDemand = baselineDemandGW * priceFactor;
  const groundDemandGW = totalEffectiveDemand * (1 - orbitalShareFrac);
  const orbitalDemandGW = totalEffectiveDemand * orbitalShareFrac;
  
  return {
    year,
    baselineDemandGW,
    groundDemandGW,
    orbitalDemandGW,
    orbitalShareFrac,
  };
}

export interface SupplyResult {
  year: number;
  capacityGW: number;           // Installed capacity
  backlogGW: number;            // Demand - capacity (if positive)
  avgWaitYears: number;         // backlog / buildRate
  scarcityMultiplier: number;   // Price multiplier (1.0 = no scarcity)
  buildRateGWyr: number;        // Build rate for this year
}

/**
 * Calculate supply state for a single year
 */
export function calculateSupply(
  year: number,
  demandGW: number,
  prevCapacityGW: number,
  prevBacklogGW: number,
): SupplyResult {
  // 1. Build rate: starts at 5 GW/yr, grows 8% annually, caps at 50 GW/yr
  const yearsFrom2025 = year - 2025;
  const baseBuildRate = 5;  // GW/yr in 2025
  const buildRateGrowth = 0.08;
  const maxBuildRate = 50;
  const buildRateGWyr = Math.min(maxBuildRate, baseBuildRate * Math.pow(1 + buildRateGrowth, yearsFrom2025));
  
  // 2. Capacity grows by build rate (no retirements for simplicity)
  const capacityGW = prevCapacityGW + buildRateGWyr;
  
  // 3. Backlog = cumulative unmet demand
  const newDemand = Math.max(0, demandGW - prevCapacityGW);  // Only count demand above old capacity
  const backlogGW = Math.max(0, prevBacklogGW + newDemand - buildRateGWyr);
  
  // 4. Wait time = backlog / build rate
  const avgWaitYears = buildRateGWyr > 0 ? backlogGW / buildRateGWyr : 0;
  
  // 5. Scarcity multiplier: log-based, never saturates
  //    wait=1yr: 1.0x, wait=3yr: 1.5x, wait=10yr: 2.0x
  // More aggressive: wait=1yr: 1.3x, wait=3yr: 2.0x, wait=10yr: 2.3x
  const scarcityMultiplier = avgWaitYears > 0.5 
    ? 1 + Math.log10(Math.max(0.5, avgWaitYears)) * 1.5  // Steeper curve for visible S-curve
    : 1.0;
  
  return {
    year,
    capacityGW,
    backlogGW,
    avgWaitYears,
    scarcityMultiplier,
    buildRateGWyr,
  };
}

export interface PriceResult {
  year: number;
  basePricePerGpuHour: number;      // Before scarcity
  effectivePricePerGpuHour: number; // After scarcity multiplier
}

/**
 * Calculate ground price for a single year
 */
export function calculateGroundPrice(
  year: number,
  scarcityMultiplier: number,
): PriceResult {
  // Base price declines with Moore's Law (15% cost reduction per year)
  const yearsFrom2025 = year - 2025;
  const basePricePerGpuHour = 4.00 * Math.pow(0.85, yearsFrom2025);  // Starts at $4, declines 15%/yr
  
  // Effective price = base * scarcity
  const effectivePricePerGpuHour = basePricePerGpuHour * scarcityMultiplier;
  
  return {
    year,
    basePricePerGpuHour,
    effectivePricePerGpuHour,
  };
}

export interface YearState {
  demand: DemandResult;
  supply: SupplyResult;
  price: PriceResult;
  smoothedGroundPrice: number;
  smoothedOrbitalPrice: number;
}

/**
 * Compute trajectory using clean economics model
 * 
 * @param orbitalPriceByYear Map of year -> orbital price per GPU-hour
 * @param initialCapacityGW Initial capacity in 2025 (default 25 GW)
 * @param initialBacklogGW Initial backlog in 2025 (default 50 GW)
 * @param priceSmoothingAlpha Smoothing factor for prices (default 0.3)
 */
export function computeCleanEconomicsTrajectory(
  orbitalPriceByYear: Map<number, number>,
  initialCapacityGW: number = 25,
  initialBacklogGW: number = 50,
  priceSmoothingAlpha: number = 0.3
): YearState[] {
  const trajectory: YearState[] = [];
  
  // Initial state
  let prevCapacityGW = initialCapacityGW;
  let prevBacklogGW = initialBacklogGW;
  let prevOrbitalShare = 0;
  let smoothedGroundPrice = 4.00;
  let smoothedOrbitalPrice = 25.00;
  
  for (let year = 2025; year <= 2050; year++) {
    // 1. Calculate demand using SMOOTHED prices (prevents oscillation)
    const demand = calculateDemand(year, smoothedGroundPrice, smoothedOrbitalPrice, prevOrbitalShare);
    
    // 2. Calculate supply/scarcity based on demand
    const supply = calculateSupply(year, demand.groundDemandGW, prevCapacityGW, prevBacklogGW);
    
    // 3. Calculate price based on scarcity
    const price = calculateGroundPrice(year, supply.scarcityMultiplier);
    
    // 4. Update smoothed prices for NEXT iteration
    const orbitalPrice = orbitalPriceByYear.get(year) ?? 25.00;
    smoothedGroundPrice = priceSmoothingAlpha * price.effectivePricePerGpuHour + (1 - priceSmoothingAlpha) * smoothedGroundPrice;
    smoothedOrbitalPrice = priceSmoothingAlpha * orbitalPrice + (1 - priceSmoothingAlpha) * smoothedOrbitalPrice;
    
    // 5. Store state
    trajectory.push({
      demand,
      supply,
      price,
      smoothedGroundPrice,
      smoothedOrbitalPrice,
    });
    
    // 6. Update for next iteration
    prevCapacityGW = supply.capacityGW;
    prevBacklogGW = supply.backlogGW;
    prevOrbitalShare = demand.orbitalShareFrac;
  }
  
  return trajectory;
}

