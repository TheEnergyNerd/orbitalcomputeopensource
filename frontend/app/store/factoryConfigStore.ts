/**
 * Factory Configuration Store
 * Manages factory pipeline tiers and capacity calculations for Advanced tab
 */

import { create } from "zustand";

export type FactoryTier = 1 | 2 | 3;

export interface FactoryConfig {
  siliconTier: FactoryTier;
  chipsTier: FactoryTier;
  racksTier: FactoryTier;
  podsTier: FactoryTier;
  launchTier: FactoryTier;
}

export interface FactoryCapacity {
  factoryPodsPerYear: number;
  launchesPerYear: number;
  orbitPodsPerYear: number; // min(factoryPodsPerYear, launchesPerYear * podsPerLaunch)
  podsPerLaunch: number; // from rocket config
}

// Tier multipliers: T1 = 1x, T2 = 2x, T3 = 4x
const TIER_MULTIPLIERS: Record<FactoryTier, number> = {
  1: 1,
  2: 2,
  3: 4,
};

// Base throughput rates (units per second)
const BASE_RATES = {
  silicon: 10, // units/s
  chips: 5,    // units/s
  racks: 2,   // units/s
  pods: 1,    // units/s
  launch: 0.1, // launches/s (converted to launches/year)
};

// Tier costs (capex points)
const TIER_COSTS: Record<FactoryTier, number> = {
  1: 10,
  2: 25,
  3: 50,
};

interface FactoryConfigStore {
  config: FactoryConfig;
  setTier: (stage: keyof FactoryConfig, tier: FactoryTier) => void;
  getCapacity: (podsPerLaunch: number) => FactoryCapacity;
  getBottleneck: () => { id: string; label: string; shortReason: string } | null;
  getCapexSpent: () => number;
  getLaunchFailureRisk: () => number;
}

const DEFAULT_CONFIG: FactoryConfig = {
  siliconTier: 1,
  chipsTier: 1,
  racksTier: 1,
  podsTier: 1,
  launchTier: 1,
};

export const useFactoryConfigStore = create<FactoryConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,

  setTier: (stage, tier) => {
    set((state) => ({
      config: { ...state.config, [stage]: tier },
    }));
  },

  getCapacity: (podsPerLaunch: number) => {
    const { config } = get();
    
    // Calculate throughput for each stage
    const siliconRate = BASE_RATES.silicon * TIER_MULTIPLIERS[config.siliconTier];
    const chipsRate = Math.min(
      BASE_RATES.chips * TIER_MULTIPLIERS[config.chipsTier],
      siliconRate * 2 // 2 chips per silicon
    );
    const racksRate = Math.min(
      BASE_RATES.racks * TIER_MULTIPLIERS[config.racksTier],
      chipsRate / 10 // 10 chips per rack
    );
    const podsRate = Math.min(
      BASE_RATES.pods * TIER_MULTIPLIERS[config.podsTier],
      racksRate / 5 // 5 racks per pod
    );
    const launchRate = BASE_RATES.launch * TIER_MULTIPLIERS[config.launchTier];
    
    // Factory capacity (pods per year)
    const secondsPerYear = 365 * 24 * 3600;
    const factoryPodsPerYear = podsRate * secondsPerYear;
    
    // Launch capacity (launches per year)
    const launchesPerYear = launchRate * secondsPerYear;
    
    // Orbit throughput is limited by both factory and launch capacity
    const orbitPodsPerYear = Math.min(
      factoryPodsPerYear,
      launchesPerYear * podsPerLaunch
    );
    
    return {
      factoryPodsPerYear,
      launchesPerYear,
      orbitPodsPerYear,
      podsPerLaunch,
    };
  },

  getBottleneck: () => {
    const { config } = get();
    const { getCapacity } = get();
    
    // Get capacity with default podsPerLaunch (will be overridden by actual rocket)
    const capacity = getCapacity(4); // Default 4 pods per launch
    
    // Calculate stage rates
    const siliconRate = BASE_RATES.silicon * TIER_MULTIPLIERS[config.siliconTier];
    const chipsRate = Math.min(
      BASE_RATES.chips * TIER_MULTIPLIERS[config.chipsTier],
      siliconRate * 2
    );
    const racksRate = Math.min(
      BASE_RATES.racks * TIER_MULTIPLIERS[config.racksTier],
      chipsRate / 10
    );
    const podsRate = Math.min(
      BASE_RATES.pods * TIER_MULTIPLIERS[config.podsTier],
      racksRate / 5
    );
    
    // Find the bottleneck (lowest utilization)
    const targetRate = podsRate;
    const utilizations = {
      silicon: (siliconRate * 2) / (targetRate * 10 * 5 * 2), // Convert to pod-equivalent
      chips: (chipsRate * 10) / (targetRate * 5 * 10),
      racks: (racksRate * 5) / (targetRate * 5),
      pods: podsRate / targetRate,
    };
    
    const minUtil = Math.min(...Object.values(utilizations));
    const bottleneckStage = Object.entries(utilizations).find(
      ([_, util]) => util === minUtil
    )?.[0];
    
    if (!bottleneckStage || minUtil >= 0.95) {
      return null; // No significant bottleneck
    }
    
    const labels: Record<string, string> = {
      silicon: "Silicon Mine",
      chips: "Chip Fab",
      racks: "Rack Line",
      pods: "Pod Factory",
    };
    
    const shortfall = (1 - minUtil) * 100;
    return {
      id: bottleneckStage,
      label: labels[bottleneckStage] || bottleneckStage,
      shortReason: minUtil < 0.5 
        ? `under-provisioned by ${shortfall.toFixed(0)}%`
        : `limiting pods by ${shortfall.toFixed(0)}%`,
    };
  },

  getCapexSpent: () => {
    const { config } = get();
    return (
      TIER_COSTS[config.siliconTier] +
      TIER_COSTS[config.chipsTier] +
      TIER_COSTS[config.racksTier] +
      TIER_COSTS[config.podsTier] +
      TIER_COSTS[config.launchTier]
    );
  },

  getLaunchFailureRisk: () => {
    const { config } = get();
    // Risk increases with average utilization
    // If all stages are at high utilization (>90%), risk increases
    const avgTier = (
      config.siliconTier +
      config.chipsTier +
      config.racksTier +
      config.podsTier +
      config.launchTier
    ) / 5;
    
    // Higher tiers = lower risk (better infrastructure)
    // But if utilization is high, risk increases
    const baseRisk = (3 - avgTier) * 5; // 0-10% base risk
    const utilizationRisk = 0; // Would need actual utilization data
    
    return Math.min(100, baseRisk + utilizationRisk);
  },
}));




