/**
 * Regional Ground Supply Model
 * 
 * Calculates ground costs based on regional supply/demand dynamics
 * instead of global constraint multipliers.
 */

import { Region, REGIONS } from './regions';

export function convertPflopsToMw(
  demandPflops: number,
  gflopsPerWatt: number,
  pue: number = 1.3,
  utilization: number = 0.7
): number {
  const gflops = demandPflops * 1e6;
  const rawPowerW = gflops / gflopsPerWatt;
  const withPue = rawPowerW * pue;
  const withUtilization = withPue / utilization;
  const powerMw = withUtilization / 1e6;
  
  return powerMw;
}

export function getGlobalDemandPflops(year: number, gflopsPerWatt: number): number {
  const powerGw2025 = 120;
  const powerGw2050 = 2000;
  const years = year - 2025;
  const totalYears = 25;
  
  const growthRate = Math.pow(powerGw2050 / powerGw2025, 1 / totalYears) - 1;
  const powerGw = powerGw2025 * Math.pow(1 + growthRate, years);
  
  const pue = 1.3;
  const utilization = 0.7;
  const powerW = powerGw * 1e9;
  const pflops = powerW * gflopsPerWatt * utilization / pue / 1e6;
  
  return pflops;
}

export interface DemandSplit {
  trainingFraction: number;   // Can go anywhere (latency insensitive)
  inferenceFraction: number;  // Must be near users (latency sensitive)
}

export function getDemandSplit(year: number): DemandSplit {
  const baseInferenceFraction = 0.3;
  const inferenceGrowthRate = 0.02;
  const yearsFromBase = year - 2025;
  
  const inferenceFraction = Math.min(0.8, baseInferenceFraction + inferenceGrowthRate * yearsFromBase);
  
  return {
    trainingFraction: 1 - inferenceFraction,
    inferenceFraction: inferenceFraction,
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function calculateScarcityAdder(
  utilization: number,
  maxAdder: number,
  threshold: number = 0.7,
  steepness: number = 15
): number {
  return maxAdder * sigmoid(steepness * (utilization - threshold));
}

export function calculateBuildRate(
  region: Region,
  backlogMw: number,
  year: number
): number {
  const backlogPressure = backlogMw / 10000;
  const expansionFactor = 1 + 0.5 * Math.tanh(backlogPressure);
  
  const yearsFromBase = year - 2025;
  const maturityFactor = 1 + 0.03 * yearsFromBase;
  
  const expandedRate = region.baseBuildRateMwYear * expansionFactor * maturityFactor;
  
  return Math.min(expandedRate, region.maxBuildRateMwYear);
}

export interface RegionalAllocation {
  regionId: string;
  allocatedMw: number;
  utilization: number;
  effectiveEnergyCost: number;
  effectiveTotalCost: number;
}

export interface GroundCostResult {
  // Core costs (refactored: energy has NO multiplier, site has multiplier)
  energyCostPerPflopYear: number; // Raw electricity cost (NO constraint multiplier)
  siteCostPerPflopYear: number; // Site costs WITH constraint multiplier
  capacityDeliveryPremium?: number; // Scarcity price for firm MW at right place/time
  timeToEnergizePenalty?: number; // Queue delay penalty (WACC/lost revenue)
  hardwareCapexPerPflopYear: number;
  totalCostPerPflopYear: number;
  constraintMultiplier: number; // Applied to site/capacity, NOT energy
  
  // Regional model fields
  year?: number;
  totalDemandMw?: number;
  totalCapacityMw?: number;
  globalBacklogMw?: number;
  averageEnergyCostMwh?: number; // For regional model
  constraintSeverity?: number; // For regional model (0-1, how constrained)
  regionalAllocations?: RegionalAllocation[];
  averageUtilization?: number;
  
  // Queue model fields
  supplyMetrics?: {
    demandGw: number;
    capacityGw: number;
    pipelineGw: number;
    maxBuildRateGwYear: number;
    avgWaitYears: number;
    utilizationPct: number;
  };
  constraintComponents?: {
    queuePressure: number;
    utilizationPressure: number;
    scarcityPremium: number;
  };
  
  // SMR and other fields
  smrEnabled?: boolean;
  smrRampFactor?: number;
  effectiveElectricityCost?: number;
  constraintRelief?: {
    grid: number;
    cooling: number;
    water: number;
    land: number;
  };
  breakdown?: {
    grid?: number;
    cooling?: number;
    water?: number;
    land?: number;
    energyMultiplier?: number;
    siteMultiplier?: number;
    capacityDeliveryMultiplier?: number;
  };
}

export function calculateRegionalGroundCost(
  year: number,
  demandPflops: number,
  gflopsPerWatt: number,
  pue: number,
  utilization: number,
  hardwareCostPerPflop: number,
  regions: Region[] = REGIONS
): GroundCostResult {
  
  const demandMw = convertPflopsToMw(demandPflops, gflopsPerWatt, pue, utilization);
  
  const { trainingFraction, inferenceFraction } = getDemandSplit(year);
  const trainingDemandMw = demandMw * trainingFraction;
  const inferenceDemandMw = demandMw * inferenceFraction;
  
  const yearsFromBase = year - 2025;
  const updatedRegions = regions.map(region => {
    const backlog = region.backlogMw || 0;
    const buildRate = calculateBuildRate(region, backlog, year);
    const newCapacity = region.initialCapacityMw + buildRate * yearsFromBase;
    
    return {
      ...region,
      currentCapacityMw: newCapacity,
      currentBuildRateMwYear: buildRate,
    };
  });
  
  const trainingRegions = [...updatedRegions].sort((a, b) => 
    a.baseEnergyCostMwh - b.baseEnergyCostMwh
  );
  
  const inferenceRegions = [...updatedRegions].sort((a, b) => {
    const costA = a.baseEnergyCostMwh * (1 + a.latencyPenalty);
    const costB = b.baseEnergyCostMwh * (1 + b.latencyPenalty);
    return costA - costB;
  });
  
  let remainingTraining = trainingDemandMw;
  const trainingAllocations: RegionalAllocation[] = [];
  
  for (const region of trainingRegions) {
    if (remainingTraining <= 0) break;
    
    const available = region.currentCapacityMw! * 0.7;
    const allocation = Math.min(remainingTraining, available);
    const utilization = allocation / region.currentCapacityMw!;
    
    const scarcityAdder = calculateScarcityAdder(utilization, region.scarcityMaxAdder);
    const effectiveEnergy = region.baseEnergyCostMwh + scarcityAdder;
    
    const gridChargePerMwh = region.baseGridChargeKwMonth * 12 / 8760 * 1000;
    const siteCapexPerMwh = region.baseSiteCapexMwYear / 8760;
    const totalCostPerMwh = effectiveEnergy + gridChargePerMwh + siteCapexPerMwh;
    
    trainingAllocations.push({
      regionId: region.id,
      allocatedMw: allocation,
      utilization,
      effectiveEnergyCost: effectiveEnergy,
      effectiveTotalCost: totalCostPerMwh,
    });
    
    remainingTraining -= allocation;
  }
  
  let remainingInference = inferenceDemandMw;
  const inferenceAllocations: RegionalAllocation[] = [];
  
  for (const region of inferenceRegions) {
    if (remainingInference <= 0) break;
    
    const existingAlloc = trainingAllocations.find(a => a.regionId === region.id);
    const usedCapacity = existingAlloc?.allocatedMw || 0;
    const available = region.currentCapacityMw! - usedCapacity;
    
    const allocation = Math.min(remainingInference, available);
    const totalUsed = usedCapacity + allocation;
    const utilization = totalUsed / region.currentCapacityMw!;
    
    const scarcityAdder = calculateScarcityAdder(utilization, region.scarcityMaxAdder);
    const effectiveEnergy = region.baseEnergyCostMwh + scarcityAdder;
    
    const gridChargePerMwh = region.baseGridChargeKwMonth * 12 / 8760 * 1000;
    const siteCapexPerMwh = region.baseSiteCapexMwYear / 8760;
    const totalCostPerMwh = effectiveEnergy + gridChargePerMwh + siteCapexPerMwh;
    
    inferenceAllocations.push({
      regionId: region.id,
      allocatedMw: allocation,
      utilization,
      effectiveEnergyCost: effectiveEnergy,
      effectiveTotalCost: totalCostPerMwh,
    });
    
    remainingInference -= allocation;
  }
  
  const allAllocations = [...trainingAllocations, ...inferenceAllocations];
  
  const totalAllocatedMw = allAllocations.reduce((sum, a) => sum + a.allocatedMw, 0);
  const totalCapacityMw = updatedRegions.reduce((sum, r) => sum + r.currentCapacityMw!, 0);
  const globalBacklogMw = Math.max(0, demandMw - totalCapacityMw);
  
  const totalMw = Math.max(totalAllocatedMw, 1);
  const weightedEnergy = allAllocations.reduce((sum, a) => 
    sum + a.allocatedMw * a.effectiveEnergyCost, 0) / totalMw;
  const weightedTotal = allAllocations.reduce((sum, a) => 
    sum + a.allocatedMw * a.effectiveTotalCost, 0) / totalMw;
  
  const unmetDemandMw = remainingTraining + remainingInference;
  
  const mwhPerPflopYear = (1e6 / gflopsPerWatt) * pue / utilization * 8760 / 1000;
  const energyCostPerPflopYear = weightedEnergy * mwhPerPflopYear;
  const siteCostPerPflopYear = (weightedTotal - weightedEnergy) * mwhPerPflopYear;
  
  const totalCostPerPflopYear = energyCostPerPflopYear + siteCostPerPflopYear + hardwareCostPerPflop;
  
  const avgUtilization = totalCapacityMw > 0 ? totalAllocatedMw / totalCapacityMw : 0;
  const constraintSeverity = sigmoid(10 * (avgUtilization - 0.6));
  
  // REFACTORED: Regional model should separate energy (no multiplier) from site (with multiplier)
  // energyCostPerPflopYear is already raw electricity (weightedEnergy)
  // siteCostPerPflopYear already includes capacity/delivery premium (weightedTotal - weightedEnergy)
  const constraintMultiplier = 1 + constraintSeverity; // Applied to site/capacity, NOT energy
  
  return {
    year,
    totalDemandMw: demandMw,
    totalCapacityMw,
    globalBacklogMw,
    averageEnergyCostMwh: weightedEnergy,
    totalCostPerPflopYear,
    energyCostPerPflopYear, // Raw electricity (NO constraint multiplier)
    siteCostPerPflopYear, // Site costs WITH constraint multiplier (includes capacity/delivery premium)
    hardwareCapexPerPflopYear: hardwareCostPerPflop,
    regionalAllocations: allAllocations,
    averageUtilization: avgUtilization,
    constraintSeverity,
    constraintMultiplier, // Applied to site/capacity, NOT energy
  };
}

