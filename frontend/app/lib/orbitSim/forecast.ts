import type { SimulationConfig, YearPlan } from './simulationConfig';
import { runSimulationFromPlans } from './simulationRunner';
import type { RouterPolicy, RouterWeights } from '../ai/routerTypes';
import type { ConstellationParams } from '../ai/constellationTypes';

export interface ForecastBandPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface ForecastBands {
  costPerCompute: ForecastBandPoint[];
  latency: ForecastBandPoint[];
  carbon: ForecastBandPoint[];
}

export interface SimInput {
  config: SimulationConfig;
  yearPlans: YearPlan[];
  routerPolicy?: RouterPolicy;
  routerWeights?: RouterWeights;
  constellation?: ConstellationParams;
  factoryOutputMultiplier?: number;
  launchCadence?: number;
}

export interface ForecastParams {
  baseScenario: SimInput;
  numScenarios: number;   // e.g. 64
}

function mutateScenario(base: SimInput, seed: number): SimInput {
  // Shallow copy + small random tweaks
  const r = (delta: number) => 1 + (Math.random() * 2 - 1) * delta;
  
  const next: SimInput = {
    ...base,
    config: { ...base.config },
    yearPlans: base.yearPlans.map(p => ({ ...p })),
  };

  // Mutate config
  if (next.config.routerWeights) {
    next.config.routerWeights = {
      cost: (next.config.routerWeights.cost || 1) * r(0.2),
      latency: (next.config.routerWeights.latency || 1) * r(0.2),
      carbon: (next.config.routerWeights.carbon || 1) * r(0.2),
    };
  }

  // Mutate launch cadence (via podsPerDeploymentBase)
  next.config.podsPerDeploymentBase *= r(0.15);

  // Mutate factory output (if we had a multiplier, apply it)
  if (next.factoryOutputMultiplier) {
    next.factoryOutputMultiplier *= r(0.2);
  }

  // Mutate year plans intensity
  next.yearPlans.forEach(plan => {
    plan.deploymentIntensity = Math.max(0.1, Math.min(1.0, plan.deploymentIntensity * r(0.15)));
  });

  return next;
}

export function generateForecastBands(
  params: ForecastParams,
): ForecastBands {
  const { baseScenario, numScenarios } = params;

  // Collect per-year arrays of values
  const costByYear: Record<number, number[]> = {};
  const latByYear: Record<number, number[]> = {};
  const carbonByYear: Record<number, number[]> = {};

  for (let i = 0; i < numScenarios; i++) {
    const mutated = mutateScenario(baseScenario, i);
    
    // Merge router and constellation into config
    if (mutated.routerPolicy) {
      mutated.config.routerPolicy = mutated.routerPolicy;
    }
    if (mutated.routerWeights) {
      mutated.config.routerWeights = mutated.routerWeights;
    }
    if (mutated.constellation) {
      mutated.config.constellation = mutated.constellation;
    }

    const sim = runSimulationFromPlans(mutated.config, mutated.yearPlans);

    for (const year of sim.timeline) {
      if (!costByYear[year.year]) {
        costByYear[year.year] = [];
        latByYear[year.year] = [];
        carbonByYear[year.year] = [];
      }
      costByYear[year.year].push(year.costPerComputeMix);
      latByYear[year.year].push(year.latencyMixMs);
      carbonByYear[year.year].push(year.carbonMix);
    }
  }

  const toBand = (dict: Record<number, number[]>): ForecastBandPoint[] =>
    Object.entries(dict).map(([yearStr, arr]) => {
      const year = Number(yearStr);
      const sorted = arr.slice().sort((a, b) => a - b);
      const p = (q: number) => {
        const idx = Math.floor(q * (sorted.length - 1));
        return sorted[idx] ?? 0;
      };
      return {
        year,
        p10: p(0.1),
        p50: p(0.5),
        p90: p(0.9),
      };
    }).sort((a, b) => a.year - b.year);

  return {
    costPerCompute: toBand(costByYear),
    latency: toBand(latByYear),
    carbon: toBand(carbonByYear),
  };
}


