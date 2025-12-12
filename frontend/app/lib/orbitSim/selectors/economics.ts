// src/sim/selectors/economics.ts

import type { DebugStateEntry } from "../debugState";

export interface EconomicsPoint {
  year: number;
  ground: number;
  mix: number;
  orbit?: number;
}

/**
 * Build cost per compute series from debug state
 * Uses ground-truth fields: cost_per_compute_ground, cost_per_compute_mix, cost_per_compute_orbit
 */
export function buildCostPerComputeSeries(years: DebugStateEntry[]): EconomicsPoint[] {
  return years
    .sort((a, b) => a.year - b.year)
    .map(y => ({
      year: y.year,
      ground: y.cost_per_compute_ground ?? 340, // flat ≈ $340
      mix: y.cost_per_compute_mix ?? 340, // real mixed cost curve
      orbit: y.cost_per_compute_orbit, // optional third line
    }));
}

/**
 * Build annual OPEX series from debug state
 * Uses ground-truth fields: annual_opex_ground_all_ground (baseline), annual_opex_mix, annual_opex_orbit
 */
export function buildAnnualOpexSeries(years: DebugStateEntry[]): EconomicsPoint[] {
  return years
    .sort((a, b) => a.year - b.year)
    .map(y => ({
      year: y.year,
      // baseline: what OPEX *would* be if everything stayed on the ground
      ground: y.annual_opex_ground_all_ground ?? y.annual_opex_ground ?? 0,
      // mixed strategy (ground + orbit) including launch + space OPEX
      mix: y.annual_opex_mix ?? 0,
      orbit: y.annual_opex_orbit,
    }));
}

/**
 * Build annual carbon series from debug state
 * Uses ground-truth fields: annual_carbon_ground_all_ground (baseline), annual_carbon_mix, annual_carbon_orbit
 */
export function buildAnnualCarbonSeries(years: DebugStateEntry[]): EconomicsPoint[] {
  return years
    .sort((a, b) => a.year - b.year)
    .map(y => ({
      year: y.year,
      // baseline all-ground emissions
      ground: y.annual_carbon_ground_all_ground ?? 0,
      // mixed scenario emissions
      mix: y.annual_carbon_mix ?? 0,
      orbit: y.annual_carbon_orbit,
    }));
}


