// frontend/app/lib/orbitSim/selectors/frontier.ts

import type { DebugStateEntry } from "../debugState";

export type FrontierClass = "ground-limited" | "power-limited" | "network-limited";

export interface FrontierPoint {
  year: number;
  powerMw: number;
  computePFlops: number;
  frontierClass: FrontierClass;
  classACompute?: number;
  classBCompute?: number;
}

/**
 * Build Power → Compute Frontier data
 * Determines which constraint is binding for each year
 */
export function buildPowerComputeFrontier(years: DebugStateEntry[]): FrontierPoint[] {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  
  return sorted.map(y => {
    // Power in MW (convert from kW)
    const powerMw = (y.power_total_kw ?? 0) / 1000;
    
    // FIX: Use compute_raw_flops and convert to PFLOPS (divide by 1e15)
    // compute_raw_flops is in FLOPS, so divide by 1e15 to get PFLOPS
    // Do NOT use compute_effective_flops or compute_exportable_flops - they may already be in wrong units
    const computePFlops = (y.compute_raw_flops ?? 0) / 1e15;
    
    // Determine which constraint is binding
    // If backhaul utilization is high (>80%), it's network-limited
    // If power utilization is high but backhaul is low, it's power-limited
    // Otherwise, it's ground-limited (ground compute is cheaper)
    const backhaulUtil = y.utilization_backhaul ?? 0;
    const powerUtil = y.utilization_overall ?? 0;
    
    let frontierClass: FrontierClass;
    if (backhaulUtil > 0.8) {
      frontierClass = "network-limited";
    } else if (powerUtil > 0.7) {
      frontierClass = "power-limited";
    } else {
      frontierClass = "ground-limited";
    }
    
    // Class A/B compute breakdown (for coloring)
    const classACompute = (y.classA_compute_raw ?? 0) / 1e15; // PFLOPs
    const classBCompute = (y.classB_compute_raw ?? 0) / 1e15; // PFLOPs
    
    return {
      year: y.year,
      powerMw,
      computePFlops,
      frontierClass,
      classACompute,
      classBCompute,
    };
  });
}

