/**
 * Coupled Slider Logic for Physical Consistency
 * 
 * Ensures sliders maintain physical relationships:
 * - Power depends on compute and efficiency
 * - Mass depends on power and components
 * - Thermal depends on power
 * - Costs depend on mass and launch costs
 */

export type SliderType = 'independent' | 'derived' | 'constrained';

export interface SliderConfig {
  id: string;
  type: SliderType;
  derivedFrom?: string[];  // Which sliders this depends on
  formula?: (inputs: Record<string, number>, allParams: Record<string, any>) => number;
  constraints?: {
    min?: (inputs: Record<string, number>) => number;
    max?: (inputs: Record<string, number>) => number;
    validate?: (value: number, inputs: Record<string, number>) => { valid: boolean; warning?: string; error?: string };
  };
  unit?: string;
  label?: string;
}

export interface ValidationWarning {
  type: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  parameter?: string;
}

/**
 * Physical constants for calculations
 */
const PHYSICS_CONSTANTS = {
  STEFAN_BOLTZMANN: 5.67e-8,  // W/(m²·K⁴)
  T_SINK: 250,  // K (LEO sink temperature)
  RADIATOR_EMISSIVITY: 0.85,
  RADIATOR_MASS_PER_M2: 3.0,  // kg/m²
  COMPUTE_MASS_PER_KW: 0.5,  // kg/kW for compute hardware
  BATTERY_MASS_PER_KW: 2.0,  // kg/kW for batteries
  STRUCTURE_MASS_EXPONENT: 0.6,
  STRUCTURE_MASS_FACTOR: 10,
  BUS_MASS: 200,  // kg fixed bus mass
  WASTE_HEAT_FRACTION: 0.15,  // ~15% waste heat
  MAX_RADIATOR_AREA: 500,  // m² practical limit
  MAX_SATELLITE_MASS: 10000,  // kg (matches SATELLITE_CONSTRAINTS.maxMassKg - system will auto-split if exceeded)
  MAX_POWER_DENSITY_W_PER_KG: 100,  // W/kg (unrealistic above this in 2025)
};

/**
 * Slider configurations with coupling rules
 */
export const SLIDER_CONFIGS: SliderConfig[] = [
  // ===== INDEPENDENT SLIDERS (User can set these) =====
  {
    id: 'targetGW',
    type: 'independent',
    label: 'Target Capacity',
    unit: ' GW',
  },
  {
    id: 'flopsPerWattOrbital2025',
    type: 'independent',
    label: 'Orbital Efficiency 2025',
    unit: ' GFLOPS/W',
  },
  {
    id: 'flopsPerWattOrbital2040',
    type: 'independent',
    label: 'Orbital Efficiency 2040',
    unit: ' GFLOPS/W',
  },
  {
    id: 'specificPower2025',
    type: 'independent',
    label: 'Specific Power 2025',
    unit: ' W/kg',
  },
  {
    id: 'specificPower2040',
    type: 'independent',
    label: 'Specific Power 2040',
    unit: ' W/kg',
  },
  {
    id: 'launchCost2025',
    type: 'independent',
    label: 'Launch Cost 2025',
    unit: ' $/kg',
  },
  {
    id: 'computeDensityKW',
    type: 'independent',
    label: 'Compute Density',
    unit: ' kW',
  },
  {
    id: 'radiatorTempC',
    type: 'independent',
    label: 'Radiator Temperature',
    unit: ' °C',
  },
  {
    id: 'radiatorTempK',
    type: 'derived',
    label: 'Radiator Temperature',
    unit: ' K',
    derivedFrom: ['radiatorTempC'],
    formula: (inputs) => (inputs.radiatorTempC || 70) + 273.15,  // Default 70°C = 343K
  },

  // ===== DERIVED SLIDERS (Auto-calculated) =====
  
  // Power required = (target compute in PFLOPs * 1e6 GFLOPS/PFLOP) / (GFLOPS/W) / 1000 (kW conversion)
  {
    id: 'powerRequiredKw',
    type: 'derived',
    label: 'Power Required',
    unit: ' kW',
    derivedFrom: ['targetGW', 'flopsPerWattOrbital2025'],
    formula: (inputs) => {
      const targetPflops = (inputs.targetGW || 1) * 1000;  // 1 GW = 1000 PFLOPs (rough estimate)
      const gflopsPerWatt = inputs.flopsPerWattOrbital2025 || 1500;
      return (targetPflops * 1e6) / gflopsPerWatt / 1000;
    },
  },

  // Waste heat = power * waste heat fraction
  {
    id: 'wasteHeatKw',
    type: 'derived',
    label: 'Waste Heat',
    unit: ' kW',
    derivedFrom: ['powerRequiredKw'],
    formula: (inputs) => (inputs.powerRequiredKw || 0) * PHYSICS_CONSTANTS.WASTE_HEAT_FRACTION,
  },

  // Radiator area = waste heat / (emissivity * stefan-boltzmann * (T_rad^4 - T_sink^4))
  {
    id: 'radiatorAreaM2',
    type: 'derived',
    label: 'Radiator Area',
    unit: ' m²',
    derivedFrom: ['wasteHeatKw', 'radiatorTempK'],
    formula: (inputs) => {
      const wasteHeatKw = inputs.wasteHeatKw || 0;
      const radiatorTempK = inputs.radiatorTempK || 343;
      const flux = PHYSICS_CONSTANTS.RADIATOR_EMISSIVITY * PHYSICS_CONSTANTS.STEFAN_BOLTZMANN *
        (Math.pow(radiatorTempK, 4) - Math.pow(PHYSICS_CONSTANTS.T_SINK, 4));
      return flux > 0 ? (wasteHeatKw * 1000) / flux : 0;
    },
    constraints: {
      validate: (value) => {
        if (value > PHYSICS_CONSTANTS.MAX_RADIATOR_AREA) {
          return {
            valid: false,
            error: `Radiator area ${value.toFixed(1)}m² exceeds practical limit of ${PHYSICS_CONSTANTS.MAX_RADIATOR_AREA}m²`,
            warning: 'Reduce power or improve compute efficiency',
          };
        }
        return { valid: true };
      },
    },
  },

  // Radiator mass = area * mass per m²
  {
    id: 'radiatorMassKg',
    type: 'derived',
    label: 'Radiator Mass',
    unit: ' kg',
    derivedFrom: ['radiatorAreaM2'],
    formula: (inputs) => (inputs.radiatorAreaM2 || 0) * PHYSICS_CONSTANTS.RADIATOR_MASS_PER_M2,
  },

  // Solar mass = power / specific power
  {
    id: 'solarMassKg',
    type: 'derived',
    label: 'Solar Array Mass',
    unit: ' kg',
    derivedFrom: ['powerRequiredKw', 'specificPower2025'],
    formula: (inputs) => {
      const powerKw = inputs.powerRequiredKw || 0;
      const specificPower = inputs.specificPower2025 || 36.5;
      return (powerKw * 1000) / specificPower;
    },
  },

  // Total satellite mass = sum of components
  {
    id: 'totalSatelliteMassKg',
    type: 'derived',
    label: 'Total Satellite Mass',
    unit: ' kg',
    derivedFrom: ['solarMassKg', 'radiatorMassKg', 'powerRequiredKw'],
    formula: (inputs) => {
      const solar = inputs.solarMassKg || 0;
      const radiator = inputs.radiatorMassKg || 0;
      const powerKw = inputs.powerRequiredKw || 0;
      const compute = powerKw * PHYSICS_CONSTANTS.COMPUTE_MASS_PER_KW;
      const battery = powerKw * PHYSICS_CONSTANTS.BATTERY_MASS_PER_KW;
      const structure = Math.pow(solar + radiator + compute + battery, PHYSICS_CONSTANTS.STRUCTURE_MASS_EXPONENT) * PHYSICS_CONSTANTS.STRUCTURE_MASS_FACTOR;
      const bus = PHYSICS_CONSTANTS.BUS_MASS;
      return solar + radiator + compute + battery + structure + bus;
    },
    constraints: {
      validate: (value, inputs) => {
        // CRITICAL FIX: Account for automatic constellation splitting
        // The physics model automatically splits large satellites into constellations
        // So we should validate based on per-satellite mass, not total mass
        const powerKw = inputs.powerRequiredKw || 0;
        
        // If power is very high, the system will automatically split into multiple satellites
        // Estimate number of satellites needed (using optimal size of ~100kW per satellite)
        // Mass scales roughly with power, so per-satellite mass ≈ total mass / num satellites
        const OPTIMAL_COMPUTE_PER_SAT_KW = 100; // From SATELLITE_CONSTRAINTS.optimalComputeKw
        const estimatedNumSats = Math.max(1, Math.ceil(powerKw / OPTIMAL_COMPUTE_PER_SAT_KW));
        
        // For small satellites, mass scales roughly linearly with power
        // For larger satellites, there's a scaling penalty, but for validation we use linear as conservative estimate
        const massPerSatKg = value / estimatedNumSats;
        
        // Validate per-satellite mass, not total mass
        // If per-satellite mass is acceptable, no warning needed (system will auto-split)
        if (massPerSatKg <= PHYSICS_CONSTANTS.MAX_SATELLITE_MASS) {
          return { valid: true };
        }
        
        // Even after splitting, per-satellite mass would be too high
        // This suggests the power target is too high for current technology
        return {
          valid: false,
          warning: `Per-satellite mass ${massPerSatKg.toFixed(0)}kg exceeds limit (estimated ${estimatedNumSats} satellites needed)`,
          error: 'Consider reducing power target or improving specific power',
        };
      },
    },
  },

  // Launch cost per satellite = mass * launch cost per kg
  {
    id: 'launchCostPerSatellite',
    type: 'derived',
    label: 'Launch Cost per Satellite',
    unit: ' $',
    derivedFrom: ['totalSatelliteMassKg', 'launchCost2025'],
    formula: (inputs) => (inputs.totalSatelliteMassKg || 0) * (inputs.launchCost2025 || 1500),
  },

  // Power density = power / mass
  {
    id: 'powerDensityWPerKg',
    type: 'derived',
    label: 'Power Density',
    unit: ' W/kg',
    derivedFrom: ['powerRequiredKw', 'totalSatelliteMassKg'],
    formula: (inputs) => {
      const powerKw = inputs.powerRequiredKw || 0;
      const massKg = inputs.totalSatelliteMassKg || 0;
      return massKg > 0 ? (powerKw * 1000) / massKg : 0;
    },
    constraints: {
      validate: (value) => {
        if (value > PHYSICS_CONSTANTS.MAX_POWER_DENSITY_W_PER_KG) {
          return {
            valid: false,
            error: `Power density ${(value).toFixed(0)} W/kg exceeds current technology (${PHYSICS_CONSTANTS.MAX_POWER_DENSITY_W_PER_KG} W/kg)`,
            warning: 'Increase mass or decrease power target',
          };
        }
        return { valid: true };
      },
    },
  },
];

/**
 * GROUND CONSTRAINT COUPLING
 * 
 * Note: Ground constraints are handled in physicsCost.ts calculateGroundTotal()
 * The constraint multiplier MUST multiply the base costs:
 * 
 *   siteCost = BASE_SITE_2025 * constraintMultiplier
 *   energyCost = BASE_ENERGY_2025 * constraintMultiplier
 * 
 * This is already implemented correctly in the physics model.
 * The constraint multiplier is calculated from:
 *   - Grid growth rate
 *   - Cooling growth rate
 *   - Water growth rate
 *   - Land growth rate
 *   - AI demand pressure (15-month doubling)
 * 
 * When constraint sliders change, the constraint multiplier recalculates,
 * and site/energy costs automatically update via the physics model.
 */

/**
 * Calculate all derived values from independent inputs
 */
export function calculateDerivedValues(
  independentValues: Record<string, number>,
  allParams: Record<string, any> = {}
): Record<string, number> {
  const derived: Record<string, number> = {};
  const allValues = { ...independentValues, ...derived, ...allParams };

  // Calculate derived values in dependency order
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const config of SLIDER_CONFIGS) {
      if (config.type === 'derived' && config.formula && config.derivedFrom) {
        // Check if all dependencies are available
        const hasAllDeps = config.derivedFrom.every(dep => 
          independentValues[dep] !== undefined || 
          derived[dep] !== undefined || 
          allValues[dep] !== undefined
        );

        if (hasAllDeps) {
          const inputs: Record<string, number> = {};
          for (const dep of config.derivedFrom) {
            inputs[dep] = independentValues[dep] ?? derived[dep] ?? allValues[dep] ?? 0;
          }

          const newValue = config.formula(inputs, allValues);
          const oldValue = derived[config.id];

          if (oldValue === undefined || Math.abs(newValue - oldValue) > 0.001) {
            derived[config.id] = newValue;
            allValues[config.id] = newValue;
            changed = true;
          }
        }
      }
    }
  }

  return derived;
}

/**
 * Validate configuration and return warnings/errors
 */
export function validateConfiguration(
  values: Record<string, number>,
  allParams: Record<string, any> = {}
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const allValues = { ...values, ...allParams };

  for (const config of SLIDER_CONFIGS) {
    const value = values[config.id] ?? allValues[config.id];
    
    if (value === undefined) continue;

    // Check constraints
    if (config.constraints?.validate) {
      const inputs: Record<string, number> = {};
      if (config.derivedFrom) {
        for (const dep of config.derivedFrom) {
          inputs[dep] = values[dep] ?? allValues[dep] ?? 0;
        }
      }

      const validation = config.constraints.validate(value, inputs);
      
      if (!validation.valid) {
        if (validation.error) {
          warnings.push({
            type: 'error',
            message: validation.error,
            suggestion: validation.warning,
            parameter: config.id,
          });
        } else if (validation.warning) {
          warnings.push({
            type: 'warning',
            message: validation.warning,
            parameter: config.id,
          });
        }
      }
    }

    // Check min/max constraints
    if (config.constraints?.min) {
      const inputs: Record<string, number> = {};
      if (config.derivedFrom) {
        for (const dep of config.derivedFrom) {
          inputs[dep] = values[dep] ?? allValues[dep] ?? 0;
        }
      }
      const min = config.constraints.min(inputs);
      if (value < min) {
        warnings.push({
          type: 'error',
          message: `${config.label || config.id} (${value}) is below minimum ${min}`,
          parameter: config.id,
        });
      }
    }

    if (config.constraints?.max) {
      const inputs: Record<string, number> = {};
      if (config.derivedFrom) {
        for (const dep of config.derivedFrom) {
          inputs[dep] = values[dep] ?? allValues[dep] ?? 0;
        }
      }
      const max = config.constraints.max(inputs);
      if (value > max) {
        warnings.push({
          type: 'error',
          message: `${config.label || config.id} (${value}) exceeds maximum ${max}`,
          parameter: config.id,
        });
      }
    }
  }

  return warnings;
}

/**
 * Get slider configuration by ID
 */
export function getSliderConfig(id: string): SliderConfig | undefined {
  return SLIDER_CONFIGS.find(config => config.id === id);
}

/**
 * Check if a slider is derived (read-only)
 */
export function isDerivedSlider(id: string): boolean {
  const config = getSliderConfig(id);
  return config?.type === 'derived' ?? false;
}

/**
 * Get all sliders that depend on a given slider
 */
export function getDependentSliders(id: string): string[] {
  return SLIDER_CONFIGS
    .filter(config => config.derivedFrom?.includes(id))
    .map(config => config.id);
}

