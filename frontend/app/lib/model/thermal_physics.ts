/**
 * Thermal Physics - Radiator Sizing
 */

export interface ThermalParams {
  computePowerKw: number;
  computeEfficiency: number;
  powerSystemEfficiency: number;
  otherSystemsWasteKw: number;
  
  radiatorTempK: number;
  sinkTempK: number;
  emissivity: number;
  radiatorMassPerM2: number;
  
  doubleSided: boolean;
  marginFactor: number;
}

export const DEFAULT_THERMAL_PARAMS: ThermalParams = {
  computePowerKw: 100,
  computeEfficiency: 0.85,
  powerSystemEfficiency: 0.90,
  otherSystemsWasteKw: 5,
  
  radiatorTempK: 343,
  sinkTempK: 250,
  emissivity: 0.85,
  radiatorMassPerM2: 3.0,
  
  doubleSided: true,
  marginFactor: 1.25,
};

export const STEFAN_BOLTZMANN = 5.67e-8;

export interface ThermalSystemResult {
  wasteHeatKw: number;
  radiativeFluxWm2: number;
  radiatorAreaM2: number;
  radiatorMassKg: number;
}

export function calculateThermalSystem(params: ThermalParams): ThermalSystemResult {
  const computeWasteKw = params.computePowerKw * (1 - params.computeEfficiency);
  const powerSystemWasteKw = params.computePowerKw * (1 - params.powerSystemEfficiency);
  const totalWasteKw = computeWasteKw + powerSystemWasteKw + params.otherSystemsWasteKw;
  
  const radiativeFlux = params.emissivity * STEFAN_BOLTZMANN * 
    (Math.pow(params.radiatorTempK, 4) - Math.pow(params.sinkTempK, 4));
  
  let areaM2 = (totalWasteKw * 1000) / radiativeFlux;
  
  if (params.doubleSided) {
    areaM2 = areaM2 / 2;
  }
  
  areaM2 = areaM2 * params.marginFactor;
  
  const massKg = areaM2 * params.radiatorMassPerM2;
  
  return {
    wasteHeatKw: totalWasteKw,
    radiativeFluxWm2: radiativeFlux,
    radiatorAreaM2: areaM2,
    radiatorMassKg: massKg,
  };
}

