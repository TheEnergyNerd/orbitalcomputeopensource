/**
 * Orbital and Ground DC configuration specs
 * Used for annualized capacity and cost calculations
 */

export interface OrbitalPodSpec {
  computeKw: number;        // nameplate compute per pod (e.g. 150 kW)
  solarKw: number;          // nameplate solar per pod (arrays)
  capacityFactor: number;   // 0..1 average utilization of solar (e.g. 0.85)
  effectivePue: number;     // e.g. 1.05 (vs 1.5 ground)
  lifetimeYears: number;    // pod lifetime, e.g. 7
  capexPerPod: number;      // $ build + launch
  opexPerYearPerPod: number; // $/yr in orbit ops
  co2PerYearPerPod: number; // tCO2/yr (mostly launch amortized)
}

export interface GroundDcSpec {
  computeKwPerRack: number;
  pue: number;              // 1.5 etc.
  energyPricePerMwh: number;
  coolingWaterLPerMwh: number;
  co2PerMwh: number;
}

export const DEFAULT_ORBITAL_POD_SPEC: OrbitalPodSpec = {
  computeKw: 150,           // 150 kW per pod
  solarKw: 200,             // 200 kW solar arrays per pod
  capacityFactor: 0.85,     // 85% average solar utilization
  effectivePue: 1.05,       // Very efficient in space
  lifetimeYears: 7,          // 7 year lifetime
  capexPerPod: 50_000_000,  // $50M per pod (build + launch)
  opexPerYearPerPod: 2_000_000, // $2M/year ops
  co2PerYearPerPod: 500,    // 500 tCO2/year (launch amortized)
};

export const DEFAULT_GROUND_DC_SPEC: GroundDcSpec = {
  computeKwPerRack: 50,     // 50 kW per rack
  pue: 1.5,                 // 1.5 PUE typical
  energyPricePerMwh: 50,    // $50/MWh
  coolingWaterLPerMwh: 2000, // 2000 L/MWh cooling
  co2PerMwh: 0.5,           // 0.5 tCO2/MWh
};

/**
 * Get orbital compute capacity in kW
 * Accounts for pod degradation and generational upgrades
 */
export function getOrbitalComputeKw(
  podsInOrbit: number, 
  spec: OrbitalPodSpec, 
  degradationFactor?: number
): number {
  const degFactor = degradationFactor ?? 1.0;
  return podsInOrbit * spec.computeKw * degFactor;
}

/**
 * Get orbital power in MW (solar capacity * capacity factor)
 */
export function getOrbitalPowerMw(podsInOrbit: number, spec: OrbitalPodSpec): number {
  return podsInOrbit * spec.solarKw * spec.capacityFactor / 1000;
}

/**
 * Get orbital energy consumption in MWh/year
 */
export function getOrbitalEnergyMwhPerYear(podsInOrbit: number, spec: OrbitalPodSpec): number {
  const powerMw = getOrbitalPowerMw(podsInOrbit, spec);
  return powerMw * 24 * 365;
}

/**
 * Get ground energy consumption in MWh/year
 */
export function getGroundEnergyMwhPerYear(groundComputeKw: number, spec: GroundDcSpec): number {
  return groundComputeKw * spec.pue * 24 * 365 / 1000;
}

/**
 * Get hybrid (ground + orbit) energy consumption in MWh/year
 */
export function getOrbitHybridEnergyMwhPerYear(
  totalComputeKw: number,
  orbitalComputeKw: number,
  orbitalSpec: OrbitalPodSpec,
  groundSpec: GroundDcSpec,
  degradationFactor?: number
): number {
  const groundKw = Math.max(0, totalComputeKw - orbitalComputeKw);
  
  const groundMwh = getGroundEnergyMwhPerYear(groundKw, groundSpec);
  const orbitalMwh = getOrbitalEnergyMwhPerYear(
    orbitalComputeKw / orbitalSpec.computeKw,
    orbitalSpec
  );
  
  return groundMwh + orbitalMwh;
}

/**
 * Get hybrid CO2 emissions in tons/year
 */
export function getOrbitHybridCo2TonsPerYear(
  totalComputeKw: number,
  podsInOrbit: number,
  orbitalSpec: OrbitalPodSpec,
  groundSpec: GroundDcSpec,
  degradationFactor?: number
): number {
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, degradationFactor);
  const groundKw = Math.max(0, totalComputeKw - orbitalComputeKw);
  
  const groundEnergy = getGroundEnergyMwhPerYear(groundKw, groundSpec);
  const groundCo2 = groundEnergy * groundSpec.co2PerMwh;
  
  const orbitalCo2 = podsInOrbit * orbitalSpec.co2PerYearPerPod;
  
  return groundCo2 + orbitalCo2;
}

/**
 * Get hybrid energy cost in $/year
 */
export function getOrbitHybridEnergyCostPerYear(
  totalComputeKw: number,
  podsInOrbit: number,
  orbitalSpec: OrbitalPodSpec,
  groundSpec: GroundDcSpec,
  degradationFactor?: number
): number {
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, degradationFactor);
  const groundKw = Math.max(0, totalComputeKw - orbitalComputeKw);
  
  const groundEnergy = getGroundEnergyMwhPerYear(groundKw, groundSpec);
  const groundCost = groundEnergy * groundSpec.energyPricePerMwh;
  
  const orbitalOpex = podsInOrbit * orbitalSpec.opexPerYearPerPod;
  
  return groundCost + orbitalOpex;
}

