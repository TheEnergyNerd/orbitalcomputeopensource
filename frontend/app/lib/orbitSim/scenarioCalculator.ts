/**
 * Scenario Metrics Calculator
 * Centralized calculation function used by both Simple and Advanced modes
 */

import type { ScenarioInputs, ScenarioMetrics } from './scenarioTypes';
import { getRocket, getPodType } from './orbitConfigs';
import type { GlobalCongestionFrame } from '../sim/orbit/congestion';
import { applyCongestionToGlobalMetrics } from '../sim/link/globeToMacro';
import { calculateComputeFromPower } from './computeEfficiency';

const BUDGET_CAP = 3_000_000_000; // $3B budget cap

export function calculateScenarioMetrics(
  inputs: ScenarioInputs,
  congestionFrame?: GlobalCongestionFrame | null
): ScenarioMetrics {
  const rocket = getRocket(inputs.rocketId);
  const pod = getPodType(inputs.podTypeId);
  
  // Validate pod exists
  if (!pod) {
    throw new Error(`Pod type ${inputs.podTypeId} not found`);
  }

  // NEW: Compute derived from power (power-first model)
  const currentYear = new Date().getFullYear();
  const powerPerPodKW = pod.powerPerPodKw || 100; // Default to 100kW minimum
  const computePerPodPFLOPs = calculateComputeFromPower(powerPerPodKW * 1000, currentYear);
  const computePerPodTFLOPs = computePerPodPFLOPs * 1e3; // Convert PFLOPs to TFLOPs
  const computePerPodTflopYr = computePerPodTFLOPs; // TFLOPs per year (simplified)

  // 1) Compute orbit capacity
  const totalOrbitCompute = inputs.podsDeployed * computePerPodTflopYr;
  const demand = inputs.baselineComputeDemandTflopYr;

  const orbitShare = Math.min(1, totalOrbitCompute / demand);
  const groundShare = 1 - orbitShare;

  // 2) Launches and capacity (apply upgrade multiplier if provided)
  const launchMultiplier = inputs.upgrades?.launch || 1;
  const launchesRequired = Math.ceil(inputs.podsDeployed / rocket.podsPerLaunch);
  const launchCapacity = rocket.maxLaunchesPerYear * launchMultiplier;
  const launchStress = launchCapacity === 0 ? 0 : launchesRequired / launchCapacity;

  // 3) Capex/budget usage
  const capexPods = inputs.podsDeployed * pod.podCapex;
  const capexLaunches = launchesRequired * rocket.launchCost;
  const capexTotal = capexPods + capexLaunches;
  const budgetUsage = Math.min(1, capexTotal / BUDGET_CAP);
  
  // Amortize capex over 10 years for annual cost
  const annualCapex = capexTotal / 10;

  // 4) OPEX - Compare ground-only baseline vs orbit-mix
  const hoursPerYear = 24 * 365;
  const groundEnergyPrice = inputs.groundEnergyPrice; // $/MWh
  
  // ORBITAL OPEX: NO GRID ELECTRICITY
  // Only: laser comm + stationkeeping + replacement amortization + ground ops
  // Per satellite: ~$15k/year operational + $286k/year amortized = ~$301k/year per satellite
  // For 60 satellites per launch: ~$18M/year operational + $17.2M/year amortized = ~$35M/year per launch
  const orbitalOpexPerSatellite = 15000; // $15k operational per satellite/year
  const orbitalAmortizationPerSatellite = 286000; // $286k amortized per satellite/year (7-year lifetime)
  const orbitalOpexTotalPerSatellite = orbitalOpexPerSatellite + orbitalAmortizationPerSatellite; // ~$301k/year
  
  // Ground-only baseline (100% ground, no orbit)
  // Power: kW = TFLOP-yr * kW/TFLOP-yr
  const groundPowerKwPerTflop = 0.8;
  const groundBaselinePowerKw = demand * groundPowerKwPerTflop;
  // Energy: MWh = kW * hours/year / 1000 (convert kWh to MWh)
  const groundBaselineEnergyMWh = groundBaselinePowerKw * hoursPerYear / 1000;

  // Mix case: split demand between ground and orbit
  const groundMixPowerKw = demand * groundShare * groundPowerKwPerTflop;
  const groundMixEnergyMWh = groundMixPowerKw * hoursPerYear / 1000;

  // OPEX calculations
  // Apply upgrade OPEX multiplier if provided
  const opexMultiplier = inputs.upgrades?.opexMultiplier || 1;
  const groundBaselineOpex = groundBaselineEnergyMWh * groundEnergyPrice * opexMultiplier;
  
  // Calculate orbit compute for OPEX calculation (use totalOrbitCompute, not demand share)
  const orbitComputeForOpex = totalOrbitCompute; // Use actual deployed compute
  
  // Orbital OPEX: based on number of satellites, not energy consumption
  // Estimate satellites needed: assume each satellite provides computePerPodTflopYr
  const satellitesNeeded = Math.ceil(orbitComputeForOpex / computePerPodTflopYr);
  const orbitOpexTotal = satellitesNeeded * orbitalOpexTotalPerSatellite * opexMultiplier;
  
  // Mix OPEX: ground energy + orbital operational
  const mixOpex = (groundMixEnergyMWh * groundEnergyPrice * opexMultiplier) + orbitOpexTotal;

  // 5) Cost per compute - $/TFLOP-yr for whole system
  // Ground-only baseline: just OPEX (no capex, as ground infrastructure is assumed already built)
  // This should be: (energy MWh * $/MWh) / TFLOP-yr = $/TFLOP-yr
  // Formula: groundBaselineOpex ($/yr) / demand (TFLOP-yr) = $/TFLOP-yr
  const groundCostPerTFLOP = demand > 0 ? groundBaselineOpex / demand : 0;
  
  // CRITICAL FIX: Ensure we're not accidentally dividing by 1000
  // If groundBaselineOpex is in thousands, we need to multiply by 1000
  // But based on the calculation, groundBaselineOpex should already be in full dollars
  // Let's verify: groundBaselineEnergyMWh * groundEnergyPrice should give us $/yr directly
  
  // Ensure we have valid values
  if (!isFinite(groundCostPerTFLOP) || groundCostPerTFLOP <= 0) {
    console.error('[scenarioCalculator] Invalid groundCostPerTFLOP:', {
      groundCostPerTFLOP,
      groundBaselineOpex,
      demand,
      groundBaselineEnergyMWh,
      groundEnergyPrice,
    });
  }
  
  // Orbit-mix: magnitude-corrected cost per TFLOP
  // Formula: MixCostPerTFLOP = (GroundShare * GroundCostPerTFLOP) + (OrbitShare * OrbitCostPerTFLOP)
  // Where:
  // - GroundCostPerTFLOP = ground portion OPEX / ground compute
  // - OrbitCostPerTFLOP = (orbit portion OPEX + amortized capex) / orbit compute
  // Then weight by share: MixCostPerTFLOP = GroundShare * GroundCostPerTFLOP + OrbitShare * OrbitCostPerTFLOP
  
  const groundCompute = demand * groundShare;
  const orbitCompute = demand * orbitShare;
  
  // Ground cost per TFLOP (just OPEX, no capex)
  // When groundShare is 0, we still need a valid cost per TFLOP for ground portion
  // Use the baseline ground cost per TFLOP
  const groundCostPerTFLOPPortion = groundCostPerTFLOP; // Always use baseline for ground portion
  
  // Orbit cost per TFLOP (OPEX + amortized capex)
  // Orbital OPEX is per-satellite, not energy-based
  const orbitCostPerTFLOPPortion = orbitCompute > 0
    ? (orbitOpexTotal + annualCapex) / orbitCompute
    : groundCostPerTFLOP; // Fallback to ground if no orbit compute
  
  // Weighted average: MixCostPerTFLOP = (GroundShare * GroundCostPerTFLOP) + (OrbitShare * OrbitCostPerTFLOP)
  // This properly scales with magnitude - each portion's cost per TFLOP is weighted by its share
  const orbitMixCostPerCompute = (groundShare * groundCostPerTFLOPPortion) + (orbitShare * orbitCostPerTFLOPPortion);
  
  // Use the weighted average
  const finalOrbitMixCostPerCompute = orbitMixCostPerCompute;

  // 6) Latency - weighted average based on compute share
  // Use the same groundCompute and orbitCompute calculated above
  const groundLatency = 120; // ms baseline
  let orbitLatencyBase = 90; // ms for orbit (30ms better than ground)
  
  // Apply congestion multipliers if available
  if (congestionFrame) {
    const multipliers = applyCongestionToGlobalMetrics(congestionFrame);
    orbitLatencyBase *= multipliers.latencyMultiplier;
  }
  
  // Weighted average: (groundCompute * groundLatency + orbitCompute * orbitLatency) / totalCompute
  const totalCompute = demand; // Total compute demand
  const orbitLatency = totalCompute > 0
    ? (groundCompute * groundLatency + orbitCompute * orbitLatencyBase) / totalCompute
    : groundLatency;

  // 7) Carbon (tCO2 per year)
  const carbonIntensityGround = 0.5; // tCO2 per MWh (grid)
  
  // ORBITAL CARBON: Operational ≈ 0 (solar-powered)
  // Only launch carbon amortized over lifetime
  const launchCarbonPerLaunch = 500; // tons CO2 per Starship launch
  const satellitesPerLaunch = rocket.podsPerLaunch || 60;
  const launchCarbonPerSatellite = launchCarbonPerLaunch / satellitesPerLaunch; // ~8.33 tons per satellite
  const podLifetimeYears = 7;
  const orbitalCarbonPerSatellitePerYear = launchCarbonPerSatellite / podLifetimeYears; // ~1.19 tons/year amortized
  
  // Ground-only baseline carbon
  const groundBaselineCarbon = (groundBaselineEnergyMWh) * carbonIntensityGround;
  
  // Mix carbon: ground mix + orbital launch carbon (amortized)
  // Apply upgrade carbon multiplier if provided
  const carbonMultiplier = inputs.upgrades?.carbonMultiplier || 1;
  const groundMixCarbon = (groundMixEnergyMWh * carbonIntensityGround) * carbonMultiplier;
  
  // Orbital carbon: only launch carbon amortized (operational ≈ 0)
  // Use orbitComputeForOpex which is already calculated
  const orbitCarbonTotal = satellitesNeeded * orbitalCarbonPerSatellitePerYear * carbonMultiplier;
  
  const mixCarbon = groundMixCarbon + orbitCarbonTotal;
  
  // For metrics, use baseline vs mix
  const groundCarbon = groundBaselineCarbon;
  const orbitCarbon = mixCarbon;

  // 8) Deltas (will be recalculated with corrected values below)
  const latencyDeltaMs = orbitLatency - groundLatency;
  const latencyDeltaPct = ((orbitLatency / groundLatency) - 1) * 100;
  const carbonDeltaPct = ((orbitCarbon / groundCarbon) - 1) * 100;

  // 9) OrbitScore: higher better (using corrected OPEX values)
  const opexScore = Math.max(0, (groundBaselineOpex - mixOpex) / groundBaselineOpex) * 1000;
  const latencyScore = Math.max(0, (groundLatency - orbitLatency) / groundLatency) * 500;
  const carbonScore = Math.max(0, (groundCarbon - orbitCarbon) / groundCarbon) * 800;

  // Apply upgrade launch risk bonus if provided
  const launchRiskBonus = inputs.upgrades?.launchRiskBonus || 0;
  const effectiveFailureRate = rocket.failureRate + launchRiskBonus;
  const launchRiskPenalty = launchesRequired * effectiveFailureRate * 200;
  const budgetPenalty = Math.max(0, budgetUsage - 1) * 2000;
  const stressPenalty = Math.max(0, launchStress - 1) * 2000;

  const breakpointBonus = orbitShare >= 0.1 ? 2000 : 0;

  const orbitScore = Math.max(0,
    opexScore +
    latencyScore +
    carbonScore +
    breakpointBonus -
    launchRiskPenalty -
    budgetPenalty -
    stressPenalty
  );

  // Recalculate deltas with corrected values
  const costPerComputeDeltaPct = ((finalOrbitMixCostPerCompute / groundCostPerTFLOP) - 1) * 100;
  const opexDeltaPct = ((mixOpex / groundBaselineOpex) - 1) * 100;

  // Debug: Only log in development and only once per unique input (client-side only)
  if (process.env.NODE_ENV === 'development' && typeof window !== "undefined") {
    // Throttle logging to avoid spam
    const logKey = `${inputs.podsDeployed}-${inputs.baselineComputeDemandTflopYr}-${inputs.groundEnergyPrice}`;
    const lastLog = (window as any).__lastCalcLog;
    if (!lastLog || lastLog !== logKey) {
      (window as any).__lastCalcLog = logKey;
      console.log('[scenarioCalculator] Calculation:', {
        podsDeployed: inputs.podsDeployed,
        groundCostPerTFLOP: groundCostPerTFLOP.toFixed(2),
        orbitCostPerCompute: finalOrbitMixCostPerCompute.toFixed(2),
      });
    }
  }

  return {
    groundCostPerCompute: groundCostPerTFLOP,
    orbitCostPerCompute: finalOrbitMixCostPerCompute,
    groundOpexPerYear: groundBaselineOpex,
    orbitOpexPerYear: mixOpex,
    groundLatencyMs: groundLatency,
    orbitLatencyMs: orbitLatency,
    groundCarbonTpy: groundCarbon,
    orbitCarbonTpy: orbitCarbon,
    launchesRequiredPerYear: launchesRequired,
    launchCapacityPerYear: launchCapacity,
    launchStress,
    capexTotal,
    budgetUsage,
    costPerComputeDeltaPct,
    opexDeltaPct,
    latencyDeltaMs,
    latencyDeltaPct,
    carbonDeltaPct,
    orbitScore,
    orbitShare,
    groundShare,
    totalOrbitCompute,
  };
}

