/**
 * TOTAL COST CROSSOVER CHECK (CORE PRODUCT OUTPUT)
 * Always display: Orbital_Total_Cost(t) vs Ground_Total_Cost(t)
 * Crossover_Year = min t where Orbital_Total_Cost(t) < Ground_Total_Cost(t)
 */

export interface CostComparison {
  year: number;
  orbital_cost: number;
  ground_cost: number;
  cost_delta: number; // orbital - ground (negative means orbital is cheaper)
  orbital_cheaper: boolean;
}

export interface CrossoverResult {
  crossover_year: number | null; // null if no crossover found
  crossover_found: boolean;
  comparisons: CostComparison[];
  message: string;
}

/**
 * Calculate cost crossover point
 */
export function calculateCostCrossover(
  orbitalCosts: Array<{ year: number; cost: number }>,
  groundCosts: Array<{ year: number; cost: number }>,
  maxYear: number = 2050
): CrossoverResult {
  const comparisons: CostComparison[] = [];
  let crossover_year: number | null = null;
  
  // Find common years
  const years = new Set([
    ...orbitalCosts.map(c => c.year),
    ...groundCosts.map(c => c.year),
  ]);
  
  const sortedYears = Array.from(years).sort((a, b) => a - b);
  
  for (const year of sortedYears) {
    if (year > maxYear) break;
    
    const orbital = orbitalCosts.find(c => c.year === year);
    const ground = groundCosts.find(c => c.year === year);
    
    if (!orbital || !ground) continue;
    
    const cost_delta = orbital.cost - ground.cost;
    const orbital_cheaper = cost_delta < 0;
    
    comparisons.push({
      year,
      orbital_cost: orbital.cost,
      ground_cost: ground.cost,
      cost_delta,
      orbital_cheaper,
    });
    
    // Find first year where orbital becomes cheaper
    if (!crossover_year && orbital_cheaper) {
      crossover_year = year;
    }
  }
  
  const message = crossover_year
    ? `Orbital compute becomes cheaper than ground in ${crossover_year}.`
    : `Orbital compute does not become cheaper than ground by ${maxYear}.`;
  
  return {
    crossover_year,
    crossover_found: crossover_year !== null,
    comparisons,
    message,
  };
}

/**
 * Interpolate costs for missing years
 */
export function interpolateCosts(
  costs: Array<{ year: number; cost: number }>,
  targetYear: number
): number {
  if (costs.length === 0) return 0;
  
  // Find surrounding years
  let lower = costs[0];
  let upper = costs[costs.length - 1];
  
  for (let i = 0; i < costs.length - 1; i++) {
    if (targetYear >= costs[i].year && targetYear <= costs[i + 1].year) {
      lower = costs[i];
      upper = costs[i + 1];
      break;
    }
  }
  
  // If before first, use first
  if (targetYear < lower.year) return lower.cost;
  
  // If after last, use last
  if (targetYear > upper.year) return upper.cost;
  
  // Interpolate
  const t = (targetYear - lower.year) / (upper.year - lower.year);
  return lower.cost + (upper.cost - lower.cost) * t;
}

