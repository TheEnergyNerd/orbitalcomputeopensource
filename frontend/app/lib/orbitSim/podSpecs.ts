/**
 * Pod Specs - Centralized calculation for orbital pod specifications
 */

export interface PodSpecInputs {
  techLevel: number;        // 0..1 from factoryMultipliers and deployment choices
  orbitShellAltitudeKm: number;
  factoryState?: import('./factoryModel').FactoryState; // Optional factory state for upgrades
}

export interface PodSpec {
  computeTFLOPs: number;
  powerKW: number;
  annualOpexUSD: number;
  carbonTonsPerYear: number;
}

/**
 * NEW POWER-FIRST POD SPEC
 * Compute is derived from power, not the other way around
 */
import { BASE_POD, assertPodPower } from "./orbitalPodSpec";
import { calculateComputeFromPower } from "./computeEfficiency";

/**
 * Compute pod specifications based on power (power-first model)
 */
export function computePodSpec(input: PodSpecInputs): PodSpec {
  const { techLevel, factoryState } = input;
  const currentYear = new Date().getFullYear();

  // Power is the primary driver - minimum 100kW enforced
  // Power can scale with tech level, but never below 100kW
  const basePowerKW = BASE_POD.base_power_kw; // 100kW minimum
  const powerKW = Math.max(basePowerKW, basePowerKW * (1 + techLevel * 0.5)); // Scale up with tech
  
  // Validate power >= 100kW
  const pod = { base_power_kw: powerKW } as any;
  assertPodPower(pod);

  // Compute is DERIVED from power using efficiency curves
  const computeTFLOPs = calculateComputeFromPower(powerKW * 1000, currentYear) * 1e3; // Convert PFLOPs to TFLOPs

  // ORBITAL OPEX (NO GRID ELECTRICITY)
  // Only: laser comm + stationkeeping + replacement amortization + ground ops
  const efficiencyBonus = factoryState?.stages.find(s => s.id === 'chips')?.efficiencyBonus || 0;
  
  // Laser comm OPEX: ~$5k-10k per satellite per year
  const laserCommOpex = 7500; // $7.5k per satellite
  
  // Stationkeeping propellant: ~$2k-5k per satellite per year
  const stationkeepingOpex = 3500; // $3.5k per satellite
  
  // Replacement amortization: assume 7-year lifetime, $2M pod cost
  const podCost = BASE_POD.cost_usd; // $2M
  const podLifetimeYears = 7;
  const replacementAmortization = podCost / podLifetimeYears; // ~$286k/year amortized
  
  // Ground ops per satellite: ~$1k-3k per satellite per year
  const groundOpsOpex = 2000; // $2k per satellite
  
  // Total orbital OPEX (no grid electricity)
  const annualOpexUSD = (laserCommOpex + stationkeepingOpex + groundOpsOpex + replacementAmortization) * (1 - efficiencyBonus);

  // ORBITAL CARBON (Operational ≈ 0, only launch carbon amortized)
  // Launch carbon: ~500 tons CO2 per Starship launch, amortized over lifetime
  const launchCarbonPerLaunch = 500; // tons CO2
  const satellitesPerLaunch = 60; // Starship capacity
  const launchCarbonPerSatellite = launchCarbonPerLaunch / satellitesPerLaunch; // ~8.33 tons per satellite
  const carbonTonsPerYear = launchCarbonPerSatellite / podLifetimeYears; // Amortized: ~1.19 tons/year
  
  // Operational carbon ≈ 0 (solar-powered, no grid)
  // No green bonus needed - orbital is already carbon-free operationally

  return {
    computeTFLOPs,
    powerKW,
    annualOpexUSD,
    carbonTonsPerYear,
  };
}

/**
 * Calculate tech level from factory multipliers
 */
export function calculateTechLevel(
  siliconYieldLevel: number,
  chipsDensityLevel: number,
  racksModLevel: number
): number {
  // Composite tech level from breakthroughs
  return Math.max(0, Math.min(1,
    0.2
    + 0.15 * siliconYieldLevel
    + 0.15 * chipsDensityLevel
    + 0.15 * racksModLevel
  ));
}

