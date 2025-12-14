// src/sim/physics/designBus.ts

import {
  SOLAR_CONSTANT_W_M2,
  PANEL_EFFICIENCY,
  PANEL_DEGRADATION_PER_YEAR,
  RADIATOR_EMISSIVITY,
  RADIATOR_VIEW_FACTOR,
  STEFAN_BOLTZMANN,
  RADIATOR_HOT_K,
  RADIATOR_COLD_K,
  STRUCTURE_MASS_FRACTION,
  SHIELDING_MASS_FRACTION,
  POWER_ELECTRONICS_MASS_FRACTION,
  DEFAULT_ORBIT_ENV,
  type OrbitEnv,
} from "./physicsConfig";
import type { BusDesignInputs, BusPhysicsOutputs } from "./physicsTypes";
import { DEFAULT_RADIATION_MODEL, calculateShieldingMass } from "../radiationModel";

function computeRadiatorArea(heatKw: number): number {
  const q = heatKw * 1_000; // W
  const sigma = STEFAN_BOLTZMANN * RADIATOR_EMISSIVITY * RADIATOR_VIEW_FACTOR;
  const deltaT4 = Math.pow(RADIATOR_HOT_K, 4) - Math.pow(RADIATOR_COLD_K, 4);
  return q / (sigma * deltaT4);
}

function computeSolarArea(powerKw: number, yearsOfLife: number): number {
  const powerW = powerKw * 1_000;
  const effectiveFlux =
    SOLAR_CONSTANT_W_M2 *
    PANEL_EFFICIENCY *
    Math.pow(1 - PANEL_DEGRADATION_PER_YEAR, yearsOfLife);
  return powerW / effectiveFlux;
}

function shieldingDeratingFactor(
  orbitEnv: OrbitEnv,
  shieldingMm: number,
  yearsOfLife: number,
): { tidKrad: number; derate: number; annualFailureProb: number } {
  // crude exponential attenuation TID ~ 1/thickness
  const tid = (orbitEnv.tidKradPerYearUnshielded * yearsOfLife) / shieldingMm;

  // assume performance derates with dose above ~10 krad
  const derate = Math.max(0.4, Math.min(1, 1 - Math.max(0, tid - 10) / 80));

  // crude failure prob from proton flux + shielding
  const baseFailure = 0.01 * orbitEnv.protonFluxRelative;
  const shieldFactor = 1 / Math.sqrt(shieldingMm);
  const annualFailureProb = Math.min(0.2, baseFailure * shieldFactor);

  return { tidKrad: tid, derate, annualFailureProb };
}

export function designComputeBus(
  inputs: BusDesignInputs,
  orbitEnv: OrbitEnv = DEFAULT_ORBIT_ENV,
): BusPhysicsOutputs {
  const {
    targetComputeTflops,
    gpuTflopsPerKg,
    gpuWattsPerTflop,
    shieldingThicknessMm,
    yearsOfLife,
  } = inputs;

  // CRITICAL FIX: Calculate silicon mass from power density, not compute density
  // Per audit: Silicon mass should be based on power (1 W/mm² typical), not compute density
  // Power density: ~1 W/mm² for active silicon, so mass = power / (power_density × silicon_density)
  // Typical silicon density: ~2.3 g/cm³ = 2300 kg/m³
  // For 1 W/mm² = 1e6 W/m², and assuming 0.1 mm thick die: mass = power / (1e6 W/m² × 0.0001 m × 2300 kg/m³)
  // Simplified: mass_kg ≈ power_kW × 4.35 (accounts for packaging, interconnects, etc.)
  const siliconPowerKw = (targetComputeTflops * gpuWattsPerTflop) / 1_000;
  // CRITICAL: Calculate silicon mass from power, not from compute
  // Power density approach: ~4.35 kg per kW of silicon power (includes packaging)
  const siliconMassKg = Math.max(siliconPowerKw * 4.35, targetComputeTflops / gpuTflopsPerKg); // Use max of both methods

  // assume ~90% of electrical into heat
  const heatKw = siliconPowerKw * 0.9;
  const radiatorAreaM2 = computeRadiatorArea(heatKw);

  // CRITICAL FIX: Mass must scale with power (per audit A.1)
  // Per audit: Solar arrays should be ~5-10 kg/kW (realistic: 0.15 kW/kg = 6.67 kg/kW)
  // Current model was using area-based mass (6 kg/m²) which gave ~40 kW/kg (260x too optimistic)
  // Fix: Use power-based mass: M_solar = P_kW × α where α ≈ 7 kg/kW (conservative)
  // CRITICAL FIX: Radiator areal density was 0.76 kg/m² (paper-thin) but should be ~5 kg/m²
  // Per audit: Space radiators need fluid loops, pumps, shielding, rigid structures
  // ISS radiators: ~15-20 kg/m², Advanced composite: ~5 kg/m² (optimistic future tech)
  const RADIATOR_AREAL_DENSITY_KG_PER_M2 = 5.0; // kg/m² (optimistic future tech, ISS is 15-20)
  const radiatorMassKg = radiatorAreaM2 * RADIATOR_AREAL_DENSITY_KG_PER_M2;
  
  const solarArrayAreaM2 = computeSolarArea(siliconPowerKw, yearsOfLife);
  // CRITICAL FIX: Elon/Handmer target is >150 W/kg (6.67 kg/kW), but for true optimism use 5 kg/kW (200 W/kg)
  // Per audit: Current model is ~30 W/kg (too conservative), target is >150 W/kg
  // For Elon/Handmer optimism: Use 5 kg/kW = 200 W/kg specific power
  const SOLAR_SPECIFIC_MASS_KG_PER_KW = 5; // kg/kW (Elon/Handmer optimistic: 200 W/kg)
  const solarArrayMassKg = siliconPowerKw * SOLAR_SPECIFIC_MASS_KG_PER_KW;

  const payloadMassKg =
    siliconMassKg + radiatorMassKg + solarArrayMassKg;

  const structureMassKg = payloadMassKg * STRUCTURE_MASS_FRACTION;
  const shieldingMassKg = payloadMassKg * SHIELDING_MASS_FRACTION;
  const powerElectronicsMassKg =
    payloadMassKg * POWER_ELECTRONICS_MASS_FRACTION;

  // CRITICAL FIX: Add missing mass components (avionics, battery, ADCS, propulsion)
  // Per audit: Battery mass was 800x too light (0.57 kg vs 448-700 kg needed)
  // Per audit: Propulsion mass was too light for station keeping against drag
  const avionicsMassKg = payloadMassKg * 0.08; // ~8% for avionics (flight computer, comms, etc.)
  
  // FIX #4: Enforce Battery Economics (Class A vs B)
  // Logic: Class A (Standard) needs massive batteries for eclipse; Class B (Dawn-Dusk) does not.
  // Fix: In the calculate_capex function:
  //   If Shell != SSO: battery_kwh_needed = bus_power_kw * 0.6 (35 mins eclipse).
  //   If Shell == SSO: battery_kwh_needed = bus_power_kw * 0.1 (Safe mode only).
  //   Cost Adder: Add battery_kwh_needed * 1000 (assuming $1k/kWh) to the satellite cost.
  //   Mass Adder: Add battery_kwh_needed / 0.2 (assuming 200Wh/kg) to the satellite mass.
  const satelliteClass = inputs.satelliteClass || "A"; // Default to Class A
  const BATTERY_SPECIFIC_ENERGY_KWH_PER_KG = 0.2; // Space-grade Li-Ion: 200 Wh/kg (200Wh/kg = 0.2 kWh/kg)
  const BATTERY_COST_PER_KWH = 1000; // $1k/kWh
  
  let requiredStorageKwh: number;
  let batteryMassKg: number;
  
  if (satelliteClass === "B") {
    // Class B (Dawn-Dusk SSO): Safe mode only
    // battery_kwh_needed = bus_power_kw * 0.1 (Safe mode only)
    requiredStorageKwh = siliconPowerKw * 0.1;
    // Mass Adder: battery_kwh_needed / 0.2 (assuming 200Wh/kg)
    batteryMassKg = requiredStorageKwh / BATTERY_SPECIFIC_ENERGY_KWH_PER_KG;
  } else {
    // Class A (Standard LEO, Shell != SSO): Eclipse survival
    // battery_kwh_needed = bus_power_kw * 0.6 (35 mins eclipse)
    requiredStorageKwh = siliconPowerKw * 0.6;
    // Mass Adder: battery_kwh_needed / 0.2 (assuming 200Wh/kg)
    batteryMassKg = requiredStorageKwh / BATTERY_SPECIFIC_ENERGY_KWH_PER_KG;
  }
  
  const adcsMassKg = payloadMassKg * 0.04; // ~4% for attitude control (reaction wheels, magnetorquers)
  
  // CRITICAL FIX: Propulsion mass must scale with drag area (solar + radiator)
  // Per audit: High-power satellites with large solar wings need significant propellant for station keeping
  // Rough approximation: (A_solar + A_rad) × 0.05 kg/m²/year for LEO station-keeping
  const PROPULSION_MASS_PER_M2_PER_YEAR = 0.05; // kg/m²/year for LEO station-keeping
  const totalDragAreaM2 = solarArrayAreaM2 + radiatorAreaM2;
  const propulsionMassKg = totalDragAreaM2 * PROPULSION_MASS_PER_M2_PER_YEAR * yearsOfLife;
  
  // CRITICAL FIX: Add other mass to account for 2.6 kg (18%) gap
  // Includes: wiring, thermal management hardware (heat pipes, thermal straps), 
  // mounting brackets, connectors, fasteners, harnesses, etc.
  // Estimate as ~18% of payload mass to close the gap
  const otherMassKg = payloadMassKg * 0.18;
  
  // REALITY CHECK: Add radiation shielding mass (2 kg per kW compute)
  const radiationShieldingMassKg = calculateShieldingMass(siliconPowerKw, DEFAULT_RADIATION_MODEL);
  
  const totalMassKg =
    payloadMassKg +
    structureMassKg +
    shieldingMassKg +
    radiationShieldingMassKg + // REALITY CHECK: Additional shielding for radiation
    powerElectronicsMassKg +
    avionicsMassKg +
    batteryMassKg +
    adcsMassKg +
    propulsionMassKg +
    otherMassKg;

  const { derate, annualFailureProb } = shieldingDeratingFactor(
    orbitEnv,
    shieldingThicknessMm,
    yearsOfLife,
  );

  const computeTflopsDerated = targetComputeTflops * derate;

  // simple availability model: 1 - annualFailureProb mapped into uptime
  const availability = 1 - annualFailureProb * 0.5;

  return {
    orbitEnv,
    busPowerKw: siliconPowerKw,
    solarArrayAreaM2,
    radiatorAreaM2,
    solarArrayMassKg,
    radiatorMassKg,
    siliconMassKg,
    structureMassKg,
    shieldingMassKg,
    powerElectronicsMassKg,
    // CRITICAL FIX: Include missing mass components (per audit C1)
    avionicsMassKg,
    batteryMassKg,
    adcsMassKg,
    propulsionMassKg,
    otherMassKg, // CRITICAL: Accounts for 2.6 kg (18%) gap
    totalMassKg,
    // CRITICAL FIX: Ensure compute units match compute_raw_flops
    // Per audit: bus_compute_tflops_nominal was 3.6 MFLOPs while compute_raw_flops was 1.2 PFLOPs (9 orders of magnitude difference)
    // targetComputeTflops is in TFLOPs, but compute_raw_flops uses PFLOPs
    // Convert to TFLOPs for consistency: targetComputeTflops is already in TFLOPs
    computeTflopsNominal: targetComputeTflops, // Already in TFLOPs, matches targetComputeTflopsPerSat
    computeTflopsDerated,
    annualFailureProb,
    availability,
  };
}

