/**
 * Simulation Runner
 * Core logic for year-by-year simulation where each deployment = 1 year
 * Uses explicit easing functions for smooth, predictable KPI curves
 */

import type { SimulationConfig, YearStep, YearPlan } from './simulationConfig';
// DEPRECATED: Factory manufacturing removed - using launch-driven power model
// import { deriveFactoryParameters } from './factoryHelpers';
import { STARSHIP_EQUIV, calculateAnnualOrbitalPower } from './launchPowerModel';
import { calculateComputeFromPower } from './computeEfficiency';
import { mixPodProfile, mixRocketProfile, podMixFromStrategy, rocketMixFromStrategy } from './factoryTypes';
import { evalRouterPolicy, type JobDemand } from '../ai/routerEval';
import { defaultPolicy } from '../ai/routerTypes';
import { evalConstellation } from '../ai/constellationEval';
import { mix } from '../util/math';
import { runMultiYearDeployment } from './yearSteppedDeployment';
import type { StrategyMode } from './satelliteClasses';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Standard easing functions
function easeOutCubic(t: number): number {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  t = clamp01(t);
  return t * t * t;
}

function easeInOutQuad(t: number): number {
  t = clamp01(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Main simulation loop: each deployment = 1 year
 * Returns a timeline of YearStep objects
 * DEPRECATED: Use runSimulationFromPlans instead
 */
export function runSimulation(config: SimulationConfig): { timeline: YearStep[] } {
  // For backward compatibility, create default plans
  const yearPlans: YearPlan[] = Array.from({ length: config.totalDeployments }, () => ({
    deploymentIntensity: 1.0,
    computeStrategy: "balanced",
    launchStrategy: "medium",
  }));
  return runSimulationFromPlans(config, yearPlans);
}

/**
 * Run simulation from year plans
 * Each plan represents a user's decision for that year
 * Uses explicit easing functions for smooth, predictable curves
 */
export function runSimulationFromPlans(
  baseConfig: SimulationConfig,
  yearPlans: YearPlan[]
): { timeline: YearStep[] } {
  // DEPRECATED: Factory manufacturing removed - using launch-driven power model instead
  // NEW: Launch-driven power accumulation (Starship-equivalent)
  // Simplified: assume launches per year based on deployment intensity
  const launchesPerYearBase = 100; // Base launch cadence
  const podsPerDeploymentBase = STARSHIP_EQUIV.satellites_per_launch; // 60 satellites per launch
  const racksPerPodBase = 5; // Legacy compatibility
  const chipsPerRackBase = 10; // Legacy compatibility
  const factoryReliabilityFactor = 0.95; // Simplified reliability
  
  // Dummy stageThroughputs for compatibility (not used in new model)
  const stageThroughputs: any[] = [];

  const timeline: YearStep[] = [];
  const totalYears = Math.max(yearPlans.length - 1, 1);

  // CRITICAL: Run physics-based deployment simulation to populate debug state
  // Map computeStrategy to StrategyMode
  const strategyMap = new Map<number, StrategyMode>();
  yearPlans.forEach((plan, index) => {
    const year = baseConfig.startYear + index;
    // Map computeStrategy string to StrategyMode
    const strategyMode: StrategyMode = 
      plan.computeStrategy === "bulk_heavy" ? "COST" :
      plan.computeStrategy === "edge_heavy" ? "LATENCY" :
      plan.computeStrategy === "green_heavy" ? "CARBON" :
      "BALANCED";
    strategyMap.set(year, strategyMode);
  });

  // CRITICAL FIX: Run ALL scenarios to populate debug state for each
  // This ensures we have data for BASELINE, ORBITAL_BEAR, and ORBITAL_BULL
  const startYear = baseConfig.startYear;
  const endYear = baseConfig.startYear + yearPlans.length - 1;
  const scenariosToRun: Array<"BASELINE" | "ORBITAL_BEAR" | "ORBITAL_BULL"> = ["BASELINE", "ORBITAL_BEAR", "ORBITAL_BULL"];
  
  // Run each scenario and populate debug state
  scenariosToRun.forEach(scenarioMode => {
    runMultiYearDeployment(startYear, endYear, strategyMap, scenarioMode);
  });
  
  // Use the selected scenario for the timeline (for backward compatibility)
  const scenarioMode = baseConfig.scenarioMode ?? "BASELINE";
  const deploymentResults = runMultiYearDeployment(startYear, endYear, strategyMap, scenarioMode);

  // Logistic orbital share model - smooth growth, no hard cap
  let orbitalShare = 0; // fraction of world compute that *could* be orbital, 0–1
  const ORBITAL_SHARE_MAX = 0.9;
  const ORBITAL_SHARE_GAIN = 0.04; // Reduced from 0.12 to slow growth - should take 3-4 years to reach 50%

  // Cumulative orbital assets (for tracking)
  let podsTotal = 0;
  let racksTotal = 0;
  let chipsTotal = 0;

  yearPlans.forEach((plan, index) => {
    const year = baseConfig.startYear + index;
    const deploymentsCompleted = index + 1;
    const progress = clamp01(index / totalYears); // 0 at first year, ~1 at last

    // 1) Update orbital share with logistic growth (smooth, no hard cap)
    const intensity = plan.deploymentIntensity; // 0–1
    // logistic-style growth: Δshare ∝ (1 - share)
    const gain = ORBITAL_SHARE_GAIN * intensity;
    orbitalShare += gain * (1 - orbitalShare / ORBITAL_SHARE_MAX);
    if (orbitalShare > ORBITAL_SHARE_MAX) orbitalShare = ORBITAL_SHARE_MAX;
    if (orbitalShare < 0) orbitalShare = 0;

    let share = clamp01(orbitalShare);

    // 2) Strategy → mixed profiles for THIS year
    const podMix = podMixFromStrategy(plan.computeStrategy);
    const rocketMix = rocketMixFromStrategy(plan.launchStrategy);

    const podProfile = mixPodProfile(podMix);
    const rocketProfile = mixRocketProfile(rocketMix);

    // 3) Capacity added THIS year (for tracking)
    const podsThisYear =
      podsPerDeploymentBase *
      plan.deploymentIntensity *
      rocketProfile.podsPerDeploymentMultiplier;

    podsTotal += podsThisYear;
    racksTotal = podsTotal * racksPerPodBase;
    chipsTotal = racksTotal * chipsPerRackBase;

    // 4) Total demand grows exponentially with progress
    const demand0 = baseConfig.groundBaseTwh;
    const demandGrowthFactor = 3; // 4× demand over horizon
    const totalDemandTwh = demand0 * (1 + demandGrowthFactor * easeInCubic(progress));

    // 4.5) AI Router integration (if enabled)
    let routerShare = share;
    let routerMetrics: Partial<YearStep> = {};
    
    if (baseConfig.routerPolicy && baseConfig.routerWeights) {
      // Build synthetic job demand from total demand
      // Fixed ratios: realtime 30%, interactive 40%, batch 20%, cold 10%
      const jobDemand: JobDemand[] = [
        { jobTypeId: "realtime", jobsPerYear: totalDemandTwh * 0.3 },
        { jobTypeId: "interactive", jobsPerYear: totalDemandTwh * 0.4 },
        { jobTypeId: "batch", jobsPerYear: totalDemandTwh * 0.2 },
        { jobTypeId: "cold", jobsPerYear: totalDemandTwh * 0.1 },
      ];

      // Calculate congestion from traffic (for metrics)
      const congestionFrame = baseConfig.congestionFrame || null;
      const activeFailures = baseConfig.activeFailures || [];
      
      const routerResult = evalRouterPolicy(
        baseConfig.routerPolicy,
        baseConfig.routerWeights,
        jobDemand,
        congestionFrame,
        activeFailures
      );

      const orbitUnits = routerResult.computeUnitsPerDest.orbit;
      const groundUnits = routerResult.computeUnitsPerDest.groundEdge + 
                         routerResult.computeUnitsPerDest.groundCore;
      const totalUnits = orbitUnits + groundUnits || 1;
      routerShare = orbitUnits / totalUnits;

      routerMetrics = {
        routerTotalCost: routerResult.totalCost,
        routerTotalLatencyPenalty: routerResult.totalLatencyPenalty,
        routerTotalCarbon: routerResult.totalCarbon,
        routerReward: routerResult.reward,
        orbitShareFromRouter: routerShare,
      };

      // Blend router share with strategy share based on aiControlPercent
      const aiControl = baseConfig.aiControlPercent ?? 0.5;
      share = mix(share, routerShare, aiControl);
    }

    // Compute split based on orbital share (blended with router if enabled)
    const orbitalComputeTwh = totalDemandTwh * share;
    const netGroundComputeTwh = totalDemandTwh - orbitalComputeTwh;

    // CRITICAL FIX: Use debug state values if available (single source of truth)
    // Try to get all metrics from debug state (if simulation has run)
    // This ensures timeline uses the same ground truth as the physics engine
    let useDebugState = false;
    let costPerComputeGround: number = 340; // Default fallback
    let costPerComputeMix: number = 340; // Default fallback
    let latencyGroundMs: number = 120; // Default fallback
    let latencyMixMs: number = 120; // Default fallback
    let opexGround: number = 0; // Default fallback
    let opexMix: number = 0; // Default fallback
    
    if (typeof window !== 'undefined') {
      try {
        const { getDebugStateEntry } = require('./debugState');
        const debugEntry = getDebugStateEntry(year, scenarioMode);
        
        if (debugEntry && 
            debugEntry.cost_per_compute_ground !== undefined && 
            debugEntry.cost_per_compute_mix !== undefined &&
            debugEntry.latency_ground_ms !== undefined &&
            debugEntry.latency_mix_ms !== undefined &&
            debugEntry.annual_opex_ground !== undefined &&
            debugEntry.annual_opex_mix !== undefined) {
          // Use debug state values (single source of truth)
          costPerComputeGround = debugEntry.cost_per_compute_ground;
          costPerComputeMix = debugEntry.cost_per_compute_mix;
          latencyGroundMs = debugEntry.latency_ground_ms;
          latencyMixMs = debugEntry.latency_mix_ms;
          // A. FIX: Use all-ground baseline for ground OPEX display
          opexGround = debugEntry.annual_opex_ground_all_ground ?? debugEntry.annual_opex_ground;
          opexMix = debugEntry.annual_opex_mix;
          useDebugState = true;
        }
      } catch (e) {
        // Debug state not available yet, use fallback
      }
    }
    
    if (!useDebugState) {
      // Fallback: calculate from formulas (for early years or when debug state not available)
      // 5) Cost / Compute curves (explicit easing functions)
      const baseGroundCost = baseConfig.groundCostPerTwh;
      const baseOrbitCost = baseConfig.baseOrbitalCostPerTwh;

      // Ground: ~15% cheaper over horizon, mild curve
      const groundCostDrop = 0.15;
      costPerComputeGround =
        baseGroundCost * (1 - groundCostDrop * easeOutCubic(progress));

      // Orbit: starts 1.4× ground, ends at 0.4× ground, strongly curved
      const orbitCostStartFactor = 1.4;
      const orbitCostEndFactor = 0.4;
      const orbitCostFactor =
        orbitCostStartFactor +
        (orbitCostEndFactor - orbitCostStartFactor) * easeOutCubic(progress);

      const orbitalCostPerTwh =
        baseGroundCost * orbitCostFactor * podProfile.costMultiplier;

      // Mix cost uses nonlinear share
      const alphaCost = 1.5;
      const wOrbit = Math.pow(share, alphaCost);
      const wGround = 1 - wOrbit;

      costPerComputeMix =
        wGround * costPerComputeGround +
        wOrbit * orbitalCostPerTwh;

      // 6) Latency curves (explicit easing functions)
      const baseGroundLatency = baseConfig.groundLatencyMs;
      const baseOrbitLatency = baseConfig.baseOrbitalLatencyMs;

      const groundLatencyDrop = 0.10; // 10% lower across horizon
      latencyGroundMs =
        baseGroundLatency * (1 - groundLatencyDrop * easeOutCubic(progress));

      // Orbit: from 0.9× ground to 0.4× ground, curved
      const orbitLatStart = 0.9;
      const orbitLatEnd = 0.4;
      const orbitLatFactor =
        orbitLatStart + (orbitLatEnd - orbitLatStart) * easeOutCubic(progress);

      let baseOrbitalLatency = baseGroundLatency * orbitLatFactor * podProfile.latencyMultiplier;
      
      // Apply constellation latency if available
      if (baseConfig.constellation) {
        const constellationMetrics = evalConstellation(baseConfig.constellation);
        // Blend constellation latency with base orbital latency
        baseOrbitalLatency = mix(baseOrbitalLatency, constellationMetrics.latencyMs, 0.3);
      }

      const orbitalLatencyMs = baseOrbitalLatency;

      // Mix latency, nonlinear in share
      const alphaLat = 1.3;
      const wOrbitLat = Math.pow(share, alphaLat);
      const wGroundLat = 1 - wOrbitLat;

      latencyMixMs =
        wGroundLat * latencyGroundMs +
        wOrbitLat * orbitalLatencyMs;

      // 7) Annual OPEX curves (explicit easing functions)
      opexGround = totalDemandTwh * costPerComputeGround;

      // Space: use the same orbitalCostPerTwh but apply an extra learning curve
      const opexLearningFactor = 1 - 0.5 * easeOutCubic(progress); // 50% cheaper opex by end

      const orbitalOpexPerTwh = orbitalCostPerTwh * opexLearningFactor;

      opexMix =
        (totalDemandTwh * (1 - share)) * costPerComputeGround +
        (totalDemandTwh * share) * orbitalOpexPerTwh;
    }

    const opexSavings = opexGround - opexMix;

    // 8) Carbon curves (explicit easing functions)
    // CRITICAL FIX: Use debug state carbon values if available (single source of truth)
    // Use annual totals directly from debug (already converted from intensity)
    let carbonMix: number = 0; // Default fallback
    let carbonGround: number = 0; // Default fallback
    
    // Try to get carbon values from debug state (if simulation has run)
    // This ensures timeline uses the same ground truth as the physics engine
    let useDebugStateCarbon = false;
    
    if (typeof window !== 'undefined' && (window as any).getDebugState) {
      try {
        const { getDebugStateEntry } = require('./debugState');
        const debugEntry = getDebugStateEntry(year, scenarioMode);
        
        if (debugEntry && 
            debugEntry.annual_carbon_ground_all_ground !== undefined && 
            debugEntry.annual_carbon_mix !== undefined) {
          // Use annual totals directly from debug (already converted from intensity * baseDemandTWh)
          carbonGround = debugEntry.annual_carbon_ground_all_ground;
          carbonMix = debugEntry.annual_carbon_mix;
          useDebugStateCarbon = true;
        }
      } catch (e) {
        // Debug state not available yet, use fallback
      }
    }
    
    if (!useDebugStateCarbon) {
      // Fallback: calculate with proper crossover behavior
      // CRITICAL FIX: Orbital must start WORSE than ground, then cross over as it scales
      const baseGroundCarbonPerTwh = baseConfig.groundCarbonPerTwh;

      // Let grid decarb a bit over time
      const groundDecarb = 0.25; // 25% cleaner over horizon
      const carbonGroundPerTwh =
        baseGroundCarbonPerTwh * (1 - groundDecarb * easeOutCubic(progress));

      // Baseline: all-ground world (this is the "red" trajectory if we never used orbit)
      carbonGround = totalDemandTwh * carbonGroundPerTwh;
      
      // Orbital starts worse (5x ground carbon) when share is 0, then improves as it scales
      const orbitalCarbonIntensityStart = carbonGroundPerTwh * 5; // 5x worse initially
      const orbitalCarbonIntensityEnd = carbonGroundPerTwh * 0.2; // 80% better at scale
      
      // Orbital carbon intensity improves as share increases (learning curve)
      const orbitalCarbonPerTwh_fallback = orbitalCarbonIntensityStart + 
        (orbitalCarbonIntensityEnd - orbitalCarbonIntensityStart) * easeOutCubic(share);
      
      // Mix carbon: weighted average
      const orbitalCarbonTotal = totalDemandTwh * share * orbitalCarbonPerTwh_fallback;
      const groundCarbonInMix = totalDemandTwh * (1 - share) * carbonGroundPerTwh;
      carbonMix = orbitalCarbonTotal + groundCarbonInMix;
    }

    // Savings vs all-ground (can be negative if orbital starts worse)
    const carbonSavings = carbonGround - carbonMix;

    // For backward compatibility: baseline values
    // Use the same values as the ground lines (they're already the all-ground baselines)
    const opexGroundBaseline = opexGround; // Already set from annual_opex_ground_all_ground
    const carbonGroundBaseline = carbonGround; // Already set from annual_carbon_ground_all_ground

    // Removed verbose logging

    // Get scenario diagnostics from debug state if available
    let scenarioDiagnostics: Partial<YearStep> = {};
    if (typeof window !== 'undefined' && (window as any).getDebugState) {
      try {
        const { getDebugStateEntry } = require('./debugState');
        const debugEntry = getDebugStateEntry(year, scenarioMode);
        if (debugEntry) {
          scenarioDiagnostics = {
            scenario_mode: debugEntry.scenario_mode,
            launch_cost_per_kg: debugEntry.launch_cost_per_kg,
            tech_progress_factor: debugEntry.tech_progress_factor,
            failure_rate_effective: debugEntry.failure_rate_effective,
            orbit_carbon_intensity: debugEntry.orbit_carbon_intensity,
            orbit_cost_per_compute: debugEntry.orbit_cost_per_compute,
            orbit_compute_share: debugEntry.orbit_compute_share, // Patch 3
            orbit_energy_share_twh: debugEntry.orbit_energy_share_twh, // Patch 3
          };
        }
      } catch (e) {
        // Debug state not available
      }
    }
    
    timeline.push({
      year,
      deploymentsCompleted,
      rawGroundDemandTwh: totalDemandTwh, // for compatibility
      efficientGroundDemandTwh: totalDemandTwh,
      offloadedToOrbitTwh: orbitalComputeTwh, // for compatibility
      netGroundComputeTwh,
      orbitalComputeTwh,
      groundShare: 1 - share,
      orbitalShare: share,
      podsTotal,
      racksTotal,
      chipsTotal,
      costPerComputeGround,
      costPerComputeMix,
      latencyGroundMs,
      latencyMixMs,
      opexGround,
      opexMix,
      opexSavings,
      opexGroundBaseline, // for backward compatibility
      carbonGround,
      carbonMix,
      carbonSavings,
      carbonGroundBaseline, // for backward compatibility
      stageThroughputs, // Same structure for all years (sparklines will show this)
      ...routerMetrics, // Spread router metrics if present
      // Scenario diagnostics (from debug state)
      ...scenarioDiagnostics,
    });
  });

  // Check invariants in dev mode
  if (process.env.NODE_ENV === 'development') {
    try {
      // Basic sanity checks on timeline
      timeline.forEach((step, idx) => {
        if (step.orbitalShare < 0 || step.orbitalShare > 1) {
          console.warn(`[Invariant] Year ${step.year}: orbitalShare out of bounds: ${step.orbitalShare}`);
        }
        if (step.costPerComputeMix < 0) {
          console.warn(`[Invariant] Year ${step.year}: costPerComputeMix negative: ${step.costPerComputeMix}`);
        }
        if (step.latencyMixMs < 0) {
          console.warn(`[Invariant] Year ${step.year}: latencyMixMs negative: ${step.latencyMixMs}`);
        }
      });
    } catch (error) {
      console.error('[Invariant Check] Failed:', error);
    }
  }

  return { timeline };
}
