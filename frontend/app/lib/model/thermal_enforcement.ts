/**
 * Thermal Enforcement Module
 * 
 * Ensures thermal limits are enforced as hard constraints.
 * Thermal capping must be applied exactly once to effective compute.
 */

export interface ThermalEnforcementParams {
  computePowerKw: number;
  wasteHeatKw: number;
  maxRejectableKw: number;
  radiatorTempK: number;
  sinkTempK: number;
  emissivity: number;
  areaM2: number;
  allowExtremeDerates?: boolean; // Allow thermalCapFactor < 0.2 (default: false)
}

export interface ThermalEnforcementResult {
  wasteHeatKw: number;
  maxRejectableKw: number;
  thermalCapFactor: number;
  thermalInfeasible: boolean;
  effectiveComputePowerKw: number;
  debug: {
    radiatorTempK: number;
    sinkTempK: number;
    emissivity: number;
    areaM2: number;
    wasteHeatKw: number;
    maxRejectableKw: number;
    thermalCapFactor: number;
    thermalInfeasible: boolean;
  };
}

/**
 * Enforce thermal limits as hard constraint
 * 
 * @param params Thermal parameters
 * @returns Thermal enforcement result with capped compute power
 */
export function enforceThermalLimits(
  params: ThermalEnforcementParams
): ThermalEnforcementResult {
  const {
    computePowerKw,
    wasteHeatKw,
    maxRejectableKw,
    radiatorTempK,
    sinkTempK,
    emissivity,
    areaM2,
    allowExtremeDerates = false,
  } = params;
  
  // Thermal cap factor: min(1, maxRejectableKw / wasteHeatKw)
  const thermalCapFactor = Math.min(1.0, maxRejectableKw / wasteHeatKw);
  
  // Feasibility check: if thermalCapFactor < 0.2, mark as infeasible
  const thermalInfeasible = thermalCapFactor < 0.2 && !allowExtremeDerates;
  
  if (thermalInfeasible) {
    throw new Error(
      `Thermal infeasible: thermalCapFactor=${thermalCapFactor.toFixed(3)} < 0.2. ` +
      `Satellite cannot reject waste heat (${wasteHeatKw.toFixed(1)} kW) with available radiator ` +
      `(${maxRejectableKw.toFixed(1)} kW). Set allowExtremeDerates=true to allow extreme derates.`
    );
  }
  
  // Apply thermal cap to compute power (MUST be applied exactly once)
  const effectiveComputePowerKw = computePowerKw * thermalCapFactor;
  
  return {
    wasteHeatKw,
    maxRejectableKw,
    thermalCapFactor,
    thermalInfeasible,
    effectiveComputePowerKw,
    debug: {
      radiatorTempK,
      sinkTempK,
      emissivity,
      areaM2,
      wasteHeatKw,
      maxRejectableKw,
      thermalCapFactor,
      thermalInfeasible,
    },
  };
}

/**
 * Validate thermal consistency
 * 
 * Ensures that if thermalCapFactor < 1, effective compute is reduced
 */
export function validateThermalConsistency(
  requestedComputeKw: number,
  effectiveComputeKw: number,
  thermalCapFactor: number
): { valid: boolean; error?: string } {
  const expectedEffective = requestedComputeKw * thermalCapFactor;
  const error = Math.abs(effectiveComputeKw - expectedEffective) / requestedComputeKw;
  
  if (error > 0.001) { // 0.1% tolerance
    return {
      valid: false,
      error: `Thermal cap not applied correctly: requested=${requestedComputeKw}kW, ` +
        `effective=${effectiveComputeKw}kW, expected=${expectedEffective.toFixed(2)}kW, ` +
        `capFactor=${thermalCapFactor.toFixed(3)}, error=${(error * 100).toFixed(2)}%`,
    };
  }
  
  return { valid: true };
}


