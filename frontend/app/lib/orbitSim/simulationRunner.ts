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

  // Logistic orbital share model - smooth growth, no hard cap
  let orbitalShare = 0; // fraction of world compute that *could* be orbital, 0–1
  const ORBITAL_SHARE_MAX = 0.9;
  const ORBITAL_SHARE_GAIN = 0.12; // how aggressive factory is

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

    // 5) Cost / Compute curves (explicit easing functions)
    const baseGroundCost = baseConfig.groundCostPerTwh;
    const baseOrbitCost = baseConfig.baseOrbitalCostPerTwh;

    // Ground: ~15% cheaper over horizon, mild curve
    const groundCostDrop = 0.15;
    const costPerComputeGround =
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

    const costPerComputeMix =
      wGround * costPerComputeGround +
      wOrbit * orbitalCostPerTwh;

    // 6) Latency curves (explicit easing functions)
    const baseGroundLatency = baseConfig.groundLatencyMs;
    const baseOrbitLatency = baseConfig.baseOrbitalLatencyMs;

    const groundLatencyDrop = 0.10; // 10% lower across horizon
    const latencyGroundMs =
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

    const latencyMixMs =
      wGroundLat * latencyGroundMs +
      wOrbitLat * orbitalLatencyMs;

    // 7) Annual OPEX curves (explicit easing functions)
    const opexGround = totalDemandTwh * costPerComputeGround;

    // Space: use the same orbitalCostPerTwh but apply an extra learning curve
    const opexLearningFactor = 1 - 0.5 * easeOutCubic(progress); // 50% cheaper opex by end

    const orbitalOpexPerTwh = orbitalCostPerTwh * opexLearningFactor;

    const opexMix =
      (totalDemandTwh * (1 - share)) * costPerComputeGround +
      (totalDemandTwh * share) * orbitalOpexPerTwh;

    const opexSavings = opexGround - opexMix;

    // 8) Carbon curves (explicit easing functions)
    // Force mix to be cleaner than ground, no U-shape
    const baseGroundCarbonPerTwh = baseConfig.groundCarbonPerTwh;

    // Let grid decarb a bit over time
    const groundDecarb = 0.25; // 25% cleaner over horizon
    const groundCarbonPerTwh =
      baseGroundCarbonPerTwh * (1 - groundDecarb * easeOutCubic(progress));

    // Baseline: all-ground world (this is the "red" trajectory if we never used orbit)
    const baselineAllGroundCarbon = totalDemandTwh * groundCarbonPerTwh;

    // Max possible reduction vs all-ground if we somehow did 100% orbit.
    // e.g. 80% lower emissions in the limit.
    const maxCarbonReduction = 0.8;

    // Make benefit grow smoothly with share: small at low share, big near 1.
    const benefit = maxCarbonReduction * easeOutCubic(share); // 0 → maxCarbonReduction

    // Actual mix carbon is baseline scaled down by (1 - benefit)
    const carbonMix = baselineAllGroundCarbon * (1 - benefit);

    // Ground curve is just the baseline (for the same demand)
    const carbonGround = baselineAllGroundCarbon;

    // Savings vs all-ground, always ≥ 0 with this model
    const carbonSavings = carbonGround - carbonMix;

    // For backward compatibility: baseline values
    const opexGroundBaseline = totalDemandTwh * costPerComputeGround;
    const carbonGroundBaseline = baselineAllGroundCarbon; // same as carbonGround

    // Sanity log for final year
    if (index === yearPlans.length - 1) {
      console.log("FINAL YEAR CHECK", {
        year,
        progress,
        share,
        totalDemandTwh,
        netGroundComputeTwh,
        orbitalComputeTwh,
        costPerComputeGround,
        costPerComputeMix,
        latencyGroundMs,
        latencyMixMs,
        opexGround,
        opexMix,
        carbonGround,
        carbonMix,
      });
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
