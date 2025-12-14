/**
 * Moore's Law Plateau Model
 * 
 * Implements physics-based plateau for compute density (TFLOPS/kg)
 * Uses logistic (S-curve) growth instead of unbounded exponential
 * 
 * Per Anno feedback: "Moores law of mass should have a plateau inherently?
 * Isn't there some physics limits to performance/mass?"
 */

/**
 * Get compute density (TFLOPS/kg) with physics-based plateau
 * Uses logistic curve: L / (1 + e^(-k(x-x0)))
 * 
 * @param year - Year to calculate for
 * @returns TFLOPS per kg
 */
export function getComputePerKg(year: number): number {
  const baseYear = 2025;
  const baseTFLOPsPerKg = 10; // 2025 starting point for space-hardened hardware
  
  // Logistic growth parameters
  const maxMultiplier = 50;    // Plateau at 50x improvement over baseline
  const growthRate = 0.25;     // Steepness of S-curve
  const midpointYear = 2035;   // Year of fastest growth (inflection point)
  
  // Logistic function: L / (1 + e^(-k(x-x0)))
  const yearsFromMidpoint = year - midpointYear;
  const logisticValue = maxMultiplier / (1 + Math.exp(-growthRate * yearsFromMidpoint));
  
  // Add 1 so we start at baseline, not zero
  const multiplier = 1 + logisticValue;
  
  return baseTFLOPsPerKg * multiplier;
}

/**
 * Get thermal efficiency (W/TFLOP) with plateau
 * Thermal efficiency improves slower than compute density and also plateaus
 * 
 * @param year - Year to calculate for
 * @returns Watts per TFLOP
 */
export function getThermalWastePerTFLOP(year: number): number {
  // Watts of heat per TFLOP of compute
  const baseYear = 2025;
  const baseWasteWattsPerTFLOP = 0.5; // 2 TFLOPS per watt = 0.5W per TFLOP
  
  // Thermal efficiency improves slower than compute density
  // And also plateaus (Carnot limit, material limits)
  const maxImprovement = 10; // Can't get better than 10x (0.05W per TFLOP)
  const growthRate = 0.15;   // Slower than compute density improvement
  const midpointYear = 2038; // Thermal lags compute
  
  const yearsFromMidpoint = year - midpointYear;
  const improvement = maxImprovement / (1 + Math.exp(-growthRate * yearsFromMidpoint));
  
  return baseWasteWattsPerTFLOP / (1 + improvement);
}

/**
 * Get compute density curve data for visualization
 */
export function getComputeDensityCurve(startYear: number = 2025, endYear: number = 2050): Array<{year: number, tflopsPerKg: number}> {
  const data = [];
  for (let year = startYear; year <= endYear; year++) {
    data.push({
      year,
      tflopsPerKg: getComputePerKg(year),
    });
  }
  return data;
}

/**
 * Get thermal efficiency curve data for visualization
 */
export function getThermalEfficiencyCurve(startYear: number = 2025, endYear: number = 2050): Array<{year: number, wattsPerTflop: number}> {
  const data = [];
  for (let year = startYear; year <= endYear; year++) {
    data.push({
      year,
      wattsPerTflop: getThermalWastePerTFLOP(year),
    });
  }
  return data;
}

