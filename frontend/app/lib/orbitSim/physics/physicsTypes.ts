// src/sim/physics/physicsTypes.ts

import type { OrbitEnv } from "./physicsConfig";

import type { StructuralScalingParams } from "./physicsConfig";

export interface BusDesignInputs {
  targetComputeTflops: number;   // nominal TFLOPs per sat before derating
  gpuTflopsPerKg: number;        // silicon performance density
  gpuWattsPerTflop: number;      // W / TFLOP
  shieldingThicknessMm: number;  // aluminium equivalent
  yearsOfLife: number;           // design life
  satelliteClass?: "A" | "B";    // Class A (Standard LEO) or Class B (Dawn-Dusk SSO)
  structuralScaling?: StructuralScalingParams; // Optional structural scaling parameters
}

export interface BusPhysicsOutputs {
  orbitEnv: OrbitEnv;

  // power
  busPowerKw: number;
  solarArrayAreaM2: number;
  radiatorAreaM2: number;
  solarArrayMassKg: number;
  radiatorMassKg: number;

  // silicon + other mass
  siliconMassKg: number;
  structureMassKg: number;
  shieldingMassKg: number;
  powerElectronicsMassKg: number;
  // CRITICAL FIX: Add missing mass components (per audit C1)
  avionicsMassKg: number;
  batteryMassKg: number;
  adcsMassKg: number;
  propulsionMassKg: number;
  // CRITICAL FIX: Add other mass to account for 2.6 kg (18%) gap
  // Includes: wiring, thermal management hardware, mounting brackets, connectors, etc.
  otherMassKg: number;

  totalMassKg: number;
  computeTflopsNominal: number;
  computeTflopsDerated: number;  // after radiation + redundancy

  // reliability-ish
  annualFailureProb: number;     // per-sat catastrophic fail
  availability: number;          // fraction of time usable
}

