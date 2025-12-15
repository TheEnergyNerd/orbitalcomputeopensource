// src/sim/physics/physicsConfig.ts

export const SOLAR_CONSTANT_W_M2 = 1350;           // rough LEO value

export const PANEL_EFFICIENCY = 0.32;              // optimistic future PV

export const PANEL_DEGRADATION_PER_YEAR = 0.004;   // 0.4%/yr

export const RADIATOR_EMISSIVITY = 0.85;

export const RADIATOR_VIEW_FACTOR = 0.9;

export const STEFAN_BOLTZMANN = 5.670374419e-8;    // W/m²K⁴

export const RADIATOR_HOT_K = 350;                 // ~77°C

export const RADIATOR_COLD_K = 3;                  // space

// mass fractions – tunable
export const STRUCTURE_MASS_FRACTION = 0.18;

export const SHIELDING_MASS_FRACTION = 0.12;

export const POWER_ELECTRONICS_MASS_FRACTION = 0.08;

// rad environment
export interface OrbitEnv {
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  tidKradPerYearUnshielded: number;  // total ionizing dose at 1mm Al
  protonFluxRelative: number;        // for SEU-ish scaling
}

export const DEFAULT_ORBIT_ENV: OrbitEnv = {
  name: 'LEO-sun-synch',
  altitudeKm: 550,
  inclinationDeg: 53,
  tidKradPerYearUnshielded: 10,
  protonFluxRelative: 1,
};

// Structural scaling parameters for large arrays
export interface StructuralScalingParams {
  thresholdPowerKW: number;        // Power level where penalty kicks in
  structuralPenaltyExponent: number; // Exponent for superlinear scaling (1.0 = linear, 1.2 = 20% penalty)
}

export const DEFAULT_STRUCTURAL_SCALING: StructuralScalingParams = {
  thresholdPowerKW: 50,
  structuralPenaltyExponent: 1.2,
};


