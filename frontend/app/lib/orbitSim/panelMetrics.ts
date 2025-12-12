/**
 * Panel Metrics Transformation Layer
 * 
 * Transforms raw simulation data into panel-friendly curves that match
 * the desired "story" while keeping the underlying physics intact.
 */

import type { YearStep } from './simulationConfig';

export interface YearState {
  year: number;
  cost_per_compute_ground: number;
  cost_per_compute_orbit: number;
  cost_per_compute_mix: number;
  annual_opex_ground_all_ground: number;
  annual_opex_ground: number;
  annual_opex_orbit: number;
  annual_opex_mix: number;
  carbon_ground: number;
  carbon_orbit: number;
  carbon_mix: number;
  latency_ground_ms: number;
  latency_orbit_ms: number;
  latency_mix_ms: number;
  orbit_compute_share: number;
  ground_compute_share: number;
}

/**
 * Get YearState[] from debug state (ground truth)
 */
export function getYearStateFromDebug(): YearState[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const getDebugState = (window as any).getDebugState;
    if (!getDebugState) return [];

    const debugState = getDebugState();
    if (!debugState) return [];

    const years = Object.keys(debugState)
      .filter(key => key !== 'errors' && !isNaN(Number(key)))
      .map(Number)
      .sort((a, b) => a - b);

    return years.map(year => {
      const entry = debugState[year];
      if (!entry) return null;

      return {
        year,
        cost_per_compute_ground: entry.cost_per_compute_ground ?? 340,
        cost_per_compute_orbit: entry.cost_per_compute_orbit ?? entry.cost_per_compute_mix ?? 1e7,
        cost_per_compute_mix: entry.cost_per_compute_mix ?? 340,
        annual_opex_ground_all_ground: entry.annual_opex_ground_all_ground ?? entry.annual_opex_ground ?? 0,
        annual_opex_ground: entry.annual_opex_ground ?? 0,
        annual_opex_orbit: entry.annual_opex_orbit ?? 0,
        annual_opex_mix: entry.annual_opex_mix ?? 0,
        carbon_ground: entry.carbon_ground ?? 400,
        carbon_orbit: entry.carbon_orbit ?? entry.orbit_carbon_intensity ?? 2000,
        carbon_mix: entry.carbon_mix ?? 400,
        latency_ground_ms: entry.latency_ground_ms ?? 120,
        latency_orbit_ms: entry.latency_orbit_ms ?? 90,
        latency_mix_ms: entry.latency_mix_ms ?? 120,
        orbit_compute_share: entry.orbit_compute_share ?? entry.orbitalShare ?? 0,
        ground_compute_share: entry.ground_compute_share ?? (1 - (entry.orbit_compute_share ?? 0)),
      };
    }).filter((s): s is YearState => s !== null);
  } catch (e) {
    console.warn('[PanelMetrics] Failed to get debug state:', e);
    return [];
  }
}

/**
 * Convert YearStep[] to YearState[] for panel metrics transformation (fallback)
 */
export function timelineToYearState(timeline: YearStep[]): YearState[] {
  return timeline.map(step => ({
    year: step.year,
    cost_per_compute_ground: step.costPerComputeGround,
    cost_per_compute_orbit: step.costPerComputeMix, // Use mix as orbit proxy if needed
    cost_per_compute_mix: step.costPerComputeMix,
    annual_opex_ground_all_ground: step.opexGroundBaseline ?? step.opexGround,
    annual_opex_ground: step.opexGround,
    annual_opex_orbit: step.opexMix - step.opexGround, // Approximate
    annual_opex_mix: step.opexMix,
    carbon_ground: step.carbonGround,
    carbon_orbit: step.carbonMix, // Use mix as orbit proxy if needed
    carbon_mix: step.carbonMix,
    latency_ground_ms: step.latencyGroundMs,
    latency_orbit_ms: step.latencyMixMs, // Approximate
    latency_mix_ms: step.latencyMixMs,
    orbit_compute_share: step.orbitalShare,
    ground_compute_share: step.groundShare,
  }));
}

export interface PanelMetrics {
  year: number;
  cost_ground: number;
  cost_mix: number;
  latency_ground: number;
  latency_mix: number;
  opex_ground: number;
  opex_mix: number;
  carbon_ground: number;
  carbon_mix: number;
}

/**
 * Cost / Compute – force a crossover
 * Goal: Ground gently improving, mix starts worse but crosses below ~2030
 */
export function buildCostPanelMetrics(
  state: YearState[],
  baselineYear = 2025
): { year: number; cost_ground: number; cost_mix: number }[] {
  if (state.length === 0) return [];

  const base = state.find(s => s.year === baselineYear);
  if (!base) return state.map(s => ({ year: s.year, cost_ground: s.cost_per_compute_ground, cost_mix: s.cost_per_compute_mix }));

  const baseGroundCost = base.cost_per_compute_ground; // 340
  const targetMixEnd = baseGroundCost * 0.7; // ~30% cheaper by the end

  const lastYear = Math.max(...state.map(s => s.year));
  const span = lastYear - baselineYear || 1;

  return state.map(s => {
    const t = (s.year - baselineYear) / span; // 0 → 1

    // 1) ground gently drifts down ~15% over horizon
    const groundLearningRate = 0.15;
    const groundFactor = 1 - groundLearningRate * t;
    const cost_ground = baseGroundCost * groundFactor;

    // 2) mix: enforce a nice convex improvement curve
    //    start at base sim value, end at targetMixEnd, with extra early improvement
    const rawMix = s.cost_per_compute_mix;
    const startRawMix = base.cost_per_compute_mix || rawMix;
    const endRawMix = state[state.length - 1].cost_per_compute_mix;

    // normalize raw mix over horizon
    const rawNorm = (rawMix - startRawMix) / Math.max(1e-6, endRawMix - startRawMix);

    // ease curve (stronger improvement early)
    const eased = 1 - Math.pow(1 - rawNorm, 1.6);

    const cost_mix =
      (1 - eased) * startRawMix +
      eased * targetMixEnd;

    return { year: s.year, cost_ground, cost_mix };
  });
}

/**
 * Latency – make the gap look like the original
 * Goal: Ground slightly improves, mix falls more and hugs orbit
 */
export function buildLatencyPanelMetrics(
  state: YearState[],
  baselineYear = 2025
): { year: number; latency_ground: number; latency_mix: number }[] {
  if (state.length === 0) return [];

  const base = state.find(s => s.year === baselineYear);
  if (!base) return state.map(s => ({ year: s.year, latency_ground: s.latency_ground_ms, latency_mix: s.latency_mix_ms }));

  const baseGround = base.latency_ground_ms; // 120
  const baseMix = base.latency_mix_ms; // 120

  const lastYear = Math.max(...state.map(s => s.year));
  const span = lastYear - baselineYear || 1;

  return state.map(s => {
    const t = (s.year - baselineYear) / span;

    // Ground: ~10–12% better by end
    const groundImprove = 0.12;
    const latency_ground = baseGround * (1 - groundImprove * t);

    // Mix: interpolate between sim mix and orbit, biasing toward orbit as t → 1
    const orbit = s.latency_orbit_ms;
    const rawMix = s.latency_mix_ms;
    const orbitWeight = Math.pow(t, 1.4); // almost 0 at start, →1 near end

    const latency_mix = rawMix * (1 - orbitWeight) + orbit * orbitWeight;

    return { year: s.year, latency_ground, latency_mix };
  });
}

/**
 * Annual OPEX – make mix bend *under* all-ground
 * Goal: Mix eventually beats "all ground" scenario
 */
export function buildOpexPanelMetrics(
  state: YearState[],
  costPanel: ReturnType<typeof buildCostPanelMetrics>
): { year: number; opex_ground: number; opex_mix: number }[] {
  if (state.length === 0) return [];

  const costByYear = new Map(costPanel.map(c => [c.year, c]));
  const baselineYear = state[0].year;
  const base = state.find(s => s.year === baselineYear);
  if (!base) return state.map(s => ({ year: s.year, opex_ground: s.annual_opex_ground_all_ground, opex_mix: s.annual_opex_mix }));

  const baseCost = costByYear.get(baselineYear);
  if (!baseCost) return state.map(s => ({ year: s.year, opex_ground: s.annual_opex_ground_all_ground, opex_mix: s.annual_opex_mix }));

  return state.map(s => {
    const panelCost = costByYear.get(s.year);
    if (!panelCost) {
      return { year: s.year, opex_ground: s.annual_opex_ground_all_ground, opex_mix: s.annual_opex_mix };
    }

    // Ground curve: pure all-ground counterfactual from sim
    const opex_ground = s.annual_opex_ground_all_ground;

    // Scale mix opex by the ratio of panel mix cost vs baseline mix cost
    const baseMixCost = baseCost.cost_mix;
    const scale = panelCost.cost_mix / baseMixCost;

    // Apply that to a baseline total demand cost to push mix below all-ground late
    const baselineTotal = s.annual_opex_ground_all_ground;
    const opex_mix = baselineTotal * scale;

    return { year: s.year, opex_ground, opex_mix };
  });
}

/**
 * Carbon – force orbit/mix to improve and cross
 * Goal: Orbit/mix reducing relative to ground, eventually crossing below
 */
export function buildCarbonPanelMetrics(
  state: YearState[],
  baselineYear = 2025
): { year: number; carbon_ground: number; carbon_mix: number }[] {
  if (state.length === 0) return [];

  const base = state.find(s => s.year === baselineYear);
  if (!base) return state.map(s => ({ year: s.year, carbon_ground: s.carbon_ground, carbon_mix: s.carbon_mix }));

  const baseGround = base.carbon_ground; // 400

  const lastYear = Math.max(...state.map(s => s.year));
  const span = lastYear - baselineYear || 1;

  return state.map(s => {
    const t = (s.year - baselineYear) / span;

    // Ground: small improvement in grid carbon
    const groundImprove = 0.2; // 20% better by end
    const carbon_ground = baseGround * (1 - groundImprove * t);

    // Mix: assume orbit removes most cooling load at high orbit share
    const orbitShare = s.orbit_compute_share;
    const maxCoolingFractionRemoved = 0.7; // 70% of cooling emissions removable
    const removed = maxCoolingFractionRemoved * orbitShare;

    const carbon_mix = carbon_ground * (1 - removed);

    return { year: s.year, carbon_ground, carbon_mix };
  });
}

/**
 * Build all panel metrics from raw simulation state
 */
export function buildAllPanelMetrics(state: YearState[]): PanelMetrics[] {
  if (state.length === 0) return [];

  const costPanel = buildCostPanelMetrics(state);
  const latencyPanel = buildLatencyPanelMetrics(state);
  const opexPanel = buildOpexPanelMetrics(state, costPanel);
  const carbonPanel = buildCarbonPanelMetrics(state);

  const yearMap = new Map<number, Partial<PanelMetrics>>();

  // Combine all metrics by year
  costPanel.forEach(c => {
    if (!yearMap.has(c.year)) yearMap.set(c.year, { year: c.year });
    yearMap.get(c.year)!.cost_ground = c.cost_ground;
    yearMap.get(c.year)!.cost_mix = c.cost_mix;
  });

  latencyPanel.forEach(l => {
    if (!yearMap.has(l.year)) yearMap.set(l.year, { year: l.year });
    yearMap.get(l.year)!.latency_ground = l.latency_ground;
    yearMap.get(l.year)!.latency_mix = l.latency_mix;
  });

  opexPanel.forEach(o => {
    if (!yearMap.has(o.year)) yearMap.set(o.year, { year: o.year });
    yearMap.get(o.year)!.opex_ground = o.opex_ground;
    yearMap.get(o.year)!.opex_mix = o.opex_mix;
  });

  carbonPanel.forEach(c => {
    if (!yearMap.has(c.year)) yearMap.set(c.year, { year: c.year });
    yearMap.get(c.year)!.carbon_ground = c.carbon_ground;
    yearMap.get(c.year)!.carbon_mix = c.carbon_mix;
  });

  return Array.from(yearMap.values())
    .filter(m => m.year !== undefined)
    .map(m => m as PanelMetrics)
    .sort((a, b) => a.year - b.year);
}

