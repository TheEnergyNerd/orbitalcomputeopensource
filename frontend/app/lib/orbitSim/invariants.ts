/**
 * Runtime Invariant Checker
 * Verifies simulation state coherence after every step
 */

import type { SimulationState, SimulationYear, Location } from './simulationState';

const EPS = 1e-6;
const EPS_AGGREGATE = 1e-3;

export function checkInvariants(state: SimulationState): void {
  const locs: Location[] = ["edge", "core", "orbit"];
  const jobTypes = ["realtime", "interactive", "batch", "cold"] as const;

  state.years.forEach((year, idx) => {
    // A. Routing sums to 1 for each job class
    jobTypes.forEach(jobType => {
      const shares = year.routing.jobShares[jobType];
      const sum = locs.reduce((acc, loc) => acc + (shares[loc] || 0), 0);
      if (Math.abs(sum - 1) > EPS) {
        throw new Error(
          `[Invariant A] Routing sum != 1 in year[${idx}] job=${jobType} got=${sum.toFixed(6)}`
        );
      }
    });

    // B. Cost mix matches location costs + compute shares
    const orbitShare = year.aggregates.orbitShareOfCompute;
    const groundShare = 1 - orbitShare; // edge+core simplified
    
    // For now, assume ground = average of edge and core
    const groundCost = (year.costPerCompute.edge + year.costPerCompute.core) / 2;
    const costMixCalc = groundShare * groundCost + orbitShare * year.costPerCompute.orbit;
    
    if (Math.abs(costMixCalc - year.aggregates.costPerComputeMix) > EPS_AGGREGATE) {
      throw new Error(
        `[Invariant B] Cost mix inconsistent in year[${idx}]: ` +
        `calculated=${costMixCalc.toFixed(2)} stored=${year.aggregates.costPerComputeMix.toFixed(2)}`
      );
    }

    // C. Latency mix matches location latencies + compute shares
    const groundLatency = (year.latencyMs.edge + year.latencyMs.core) / 2;
    const latMixCalc = groundShare * groundLatency + orbitShare * year.latencyMs.orbit;
    
    if (Math.abs(latMixCalc - year.aggregates.latencyMixMs) > EPS_AGGREGATE) {
      throw new Error(
        `[Invariant C] Latency mix inconsistent in year[${idx}]: ` +
        `calculated=${latMixCalc.toFixed(2)} stored=${year.aggregates.latencyMixMs.toFixed(2)}`
      );
    }

    // D. Carbon mix matches location carbon totals
    const carbMixCalc = year.carbonPerYear.edge + year.carbonPerYear.core + year.carbonPerYear.orbit;
    
    if (Math.abs(carbMixCalc - year.aggregates.carbonMix) > EPS_AGGREGATE) {
      throw new Error(
        `[Invariant D] Carbon mix inconsistent in year[${idx}]: ` +
        `calculated=${carbMixCalc.toFixed(2)} stored=${year.aggregates.carbonMix.toFixed(2)}`
      );
    }

    // E. Orbit share consistency
    // Total compute = sum of all location capacities
    const totalCompute = locs.reduce((sum, loc) => sum + year.capacity[loc], 0);
    if (totalCompute > 0) {
      const orbitShareCalc = year.capacity.orbit / totalCompute;
      if (Math.abs(orbitShareCalc - year.aggregates.orbitShareOfCompute) > EPS_AGGREGATE) {
        throw new Error(
          `[Invariant E] Orbit share inconsistent in year[${idx}]: ` +
          `calculated=${orbitShareCalc.toFixed(4)} stored=${year.aggregates.orbitShareOfCompute.toFixed(4)}`
        );
      }
    }
  });

  // F. Futures first point matches current simulation year
  if (state.futures && state.futures.points.length > 0 && state.years.length > 0) {
    const currentYear = state.years[state.currentIndex];
    const futuresFirstPoint = state.futures.points.find(p => p.year === currentYear.year);
    
    if (futuresFirstPoint) {
      if (Math.abs(futuresFirstPoint.costMix - currentYear.aggregates.costPerComputeMix) > EPS_AGGREGATE) {
        throw new Error(
          `[Invariant F] Futures centerline mismatch at current year ${currentYear.year}: ` +
          `sim=${currentYear.aggregates.costPerComputeMix.toFixed(2)} futures=${futuresFirstPoint.costMix.toFixed(2)}`
        );
      }
    }
  }
}

/**
 * Check if routing load exceeds capacity (with tolerance)
 */
export function checkCapacityConstraints(
  year: SimulationYear,
  overloadTolerance: number = 0.1
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const jobTypes = ["realtime", "interactive", "batch", "cold"] as const;
  const locs: Location[] = ["edge", "core", "orbit"];
  
  // For each location, sum up all job traffic
  locs.forEach(loc => {
    const totalTraffic = jobTypes.reduce((sum, jobType) => {
      const share = year.routing.jobShares[jobType][loc] || 0;
      // Assume equal job volumes for now (could be weighted)
      return sum + share;
    }, 0);
    
    const capacity = year.capacity[loc];
    const maxLoad = capacity * (1 + overloadTolerance);
    
    if (totalTraffic > maxLoad) {
      violations.push(
        `Location ${loc}: traffic=${totalTraffic.toFixed(2)} exceeds capacity=${capacity.toFixed(2)} (tolerance=${overloadTolerance})`
      );
    }
  });
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

