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

  // Thermal model (Stefan-Boltzmann)
  const sigma = 5.670374e-8;
  const T = 27 + 273.15; // 300K / 27C
  const sinkTempK = 250;
  const emissivity = 0.9;
  const viewFactor = 0.85;
  const net_Wm2 = emissivity * sigma * (Math.pow(T, 4) - Math.pow(sinkTempK, 4)) * viewFactor;
  const kwPerM2 = net_Wm2 / 1000;

  const HEAT_FRACTION = 0.85; // 85% of power becomes heat
  const MAX_BODY_MOUNTED_M2 = 20;
  const MAX_DEPLOYABLE_M2 = 100;

  return entries.map(entry => {
    const totalPowerKw = entry.power_total_kw ?? 0;
    const totalSats = entry.satellitesTotal ?? 1;
    const powerPerSatKw = totalSats > 0 ? totalPowerKw / totalSats : 0;
    
    const totalRadiatorAreaM2 = entry.radiatorArea ?? 0;
    const radiatorAreaPerSatM2 = totalSats > 0 ? totalRadiatorAreaM2 / totalSats : 0;
    
    // Calculate max power from radiator area using single truth source
    const maxPowerFromRadiatorKw = (radiatorAreaPerSatM2 * kwPerM2) / HEAT_FRACTION;
    
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
    // Base optimistic cost (Energy + Hardware)
    const baseEnergy = entry.physics_orbit_energy_cost ?? 0;
    const baseHardware = entry.physics_orbit_hardware_cost ?? 0;
    const optimisticCostPerPflop = baseEnergy + baseHardware;
    
    // Adders from physics waterfall
    const radiationShieldingCost = optimisticCostPerPflop * ((entry.physics_orbit_radiation_multiplier ?? 1) - 1);
    const thermalSystemCost = optimisticCostPerPflop * ((entry.physics_orbit_thermal_cap_factor ?? 1) - 1);
    const replacementRateCost = entry.physics_orbit_congestion_cost ?? 0; // Use congestion as a proxy for "space reality"
    const eccOverheadCost = 0; // Already in multipliers
    const redundancyCost = 0; // Already in multipliers
    
    const realisticCostPerPflop = entry.physics_cost_per_pflop_year_orbit ?? 
      (optimisticCostPerPflop + radiationShieldingCost + thermalSystemCost + replacementRateCost);
    
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

