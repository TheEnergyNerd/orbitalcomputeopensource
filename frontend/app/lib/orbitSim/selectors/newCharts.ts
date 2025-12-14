/**
 * Selectors for new charts: Thermal Constraint Envelope, Radiation Degradation, Cost Reality Waterfall
 */

import { getDebugStateEntries, scenarioModeToKey } from "../debugState";
import type { DebugStateEntry } from "../debugState";

export interface ThermalConstraintPoint {
  year: number;
  powerKw: number;
  radiatorAreaM2: number;
  maxPowerFromRadiatorKw: number;
  isFeasible: boolean;
  zone: "body_mounted" | "deployable" | "bleeding_edge" | "not_feasible";
}

export interface RadiationDegradationPoint {
  year: number;
  yearsInOrbit: number;
  effectiveComputePercent: number;
  leoEffectiveCompute: number;
  meoEffectiveCompute: number;
  geoEffectiveCompute: number;
  eccOverhead: number;
  degradationRate: number;
}

export interface CostRealityPoint {
  year: number;
  optimisticCostPerPflop: number;
  radiationShieldingCost: number;
  thermalSystemCost: number;
  replacementRateCost: number;
  eccOverheadCost: number;
  redundancyCost: number;
  realisticCostPerPflop: number;
}

/**
 * Build thermal constraint envelope series
 * Shows power vs radiator area with feasibility zones
 */
export function buildThermalConstraintSeries(
  scenarioMode?: string
): ThermalConstraintPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  // Thermal model constants
  const RADIATOR_EFFICIENCY_KW_PER_M2 = 0.2; // 200 W/m² = 0.2 kW/m²
  const HEAT_FRACTION = 0.85; // 85% of power becomes heat
  const MAX_BODY_MOUNTED_M2 = 20;
  const MAX_DEPLOYABLE_M2 = 100;

  return entries.map(entry => {
    const totalPowerKw = entry.power_total_kw ?? 0;
    const totalSats = entry.satellitesTotal ?? 1;
    const powerPerSatKw = totalSats > 0 ? totalPowerKw / totalSats : 0;
    
    const totalRadiatorAreaM2 = entry.radiatorArea ?? 0;
    const radiatorAreaPerSatM2 = totalSats > 0 ? totalRadiatorAreaM2 / totalSats : 0;
    
    // Calculate max power from radiator area
    const maxPowerFromRadiatorKw = (radiatorAreaPerSatM2 * RADIATOR_EFFICIENCY_KW_PER_M2) / HEAT_FRACTION;
    
    // Determine feasibility zone
    let zone: "body_mounted" | "deployable" | "bleeding_edge" | "not_feasible";
    if (radiatorAreaPerSatM2 <= MAX_BODY_MOUNTED_M2) {
      zone = "body_mounted";
    } else if (radiatorAreaPerSatM2 <= MAX_DEPLOYABLE_M2) {
      zone = "deployable";
    } else if (radiatorAreaPerSatM2 <= 500) {
      zone = "bleeding_edge";
    } else {
      zone = "not_feasible";
    }
    
    const isFeasible = powerPerSatKw <= maxPowerFromRadiatorKw;
    
    return {
      year: entry.year,
      powerKw: powerPerSatKw,
      radiatorAreaM2: radiatorAreaPerSatM2,
      maxPowerFromRadiatorKw,
      isFeasible,
      zone,
    };
  });
}

/**
 * Build radiation degradation series
 * Shows effective compute over time with ECC overhead and degradation
 */
export function buildRadiationDegradationSeries(
  scenarioMode?: string
): RadiationDegradationPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  // Radiation model constants
  const ECC_OVERHEAD = 0.15; // 15% compute spent on ECC
  const LEO_DEGRADATION_PER_YEAR = 0.05; // 5% per year
  const MEO_DEGRADATION_PER_YEAR = 0.08; // 8% per year (worse radiation)
  const GEO_DEGRADATION_PER_YEAR = 0.06; // 6% per year

  const calculateEffectiveCompute = (yearsInOrbit: number, degradationPerYear: number) => {
    const eccAdjusted = 1 - ECC_OVERHEAD; // 85% after ECC
    const degradationFactor = Math.max(0, 1 - degradationPerYear * yearsInOrbit);
    return eccAdjusted * degradationFactor * 100; // Convert to percentage
  };

  return entries.map(entry => {
    const yearsInOrbit = Math.max(0, entry.year - 2025); // Years since deployment start
    
    const leoEffective = calculateEffectiveCompute(yearsInOrbit, LEO_DEGRADATION_PER_YEAR);
    const meoEffective = calculateEffectiveCompute(yearsInOrbit, MEO_DEGRADATION_PER_YEAR);
    const geoEffective = calculateEffectiveCompute(yearsInOrbit, GEO_DEGRADATION_PER_YEAR);
    
    // Use LEO as the default (most common)
    const effectiveComputePercent = leoEffective;
    
    return {
      year: entry.year,
      yearsInOrbit,
      effectiveComputePercent,
      leoEffectiveCompute: leoEffective,
      meoEffectiveCompute: meoEffective,
      geoEffectiveCompute: geoEffective,
      eccOverhead: ECC_OVERHEAD * 100,
      degradationRate: LEO_DEGRADATION_PER_YEAR * 100,
    };
  });
}

/**
 * Build cost reality waterfall series
 * Shows how realistic constraints add costs
 */
export function buildCostRealityWaterfallSeries(
  scenarioMode?: string
): CostRealityPoint[] {
  const scenarioKey = scenarioModeToKey(scenarioMode);
  const entries = getDebugStateEntries(scenarioKey)
    .sort((a, b) => a.year - b.year);

  return entries.map(entry => {
    // Base optimistic cost (before reality check constraints)
    const orbitCostPerCompute = entry.orbit_cost_per_compute ?? 0;
    const optimisticCostPerPflop = orbitCostPerCompute * 0.7; // Assume 30% reduction from optimistic
    
    // Cost adders (as percentages of optimistic cost)
    const radiationShieldingCost = optimisticCostPerPflop * 0.15; // 15% adder
    const thermalSystemCost = optimisticCostPerPflop * 0.10; // 10% adder
    const replacementRateCost = optimisticCostPerPflop * 0.20; // 20% adder (faster replacement)
    const eccOverheadCost = optimisticCostPerPflop * 0.15; // 15% adder (ECC compute overhead)
    const redundancyCost = optimisticCostPerPflop * 0.10; // 10% adder (redundancy)
    
    const realisticCostPerPflop = optimisticCostPerPflop + 
      radiationShieldingCost + 
      thermalSystemCost + 
      replacementRateCost + 
      eccOverheadCost + 
      redundancyCost;
    
    return {
      year: entry.year,
      optimisticCostPerPflop,
      radiationShieldingCost,
      thermalSystemCost,
      replacementRateCost,
      eccOverheadCost,
      redundancyCost,
      realisticCostPerPflop,
    };
  });
}

