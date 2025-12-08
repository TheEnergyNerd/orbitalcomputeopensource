/**
 * Upgrade Allocation Store
 * Manages 100-point allocation system for factory upgrades
 */

import { create } from "zustand";

export type UpgradeTier = 1 | 2 | 3;
export type UpgradeSystem = 'silicon' | 'chips' | 'racks' | 'launch';

export interface UpgradeConfig {
  tier: UpgradeTier;
  pointsSpent: number;
}

export interface UpgradesState {
  totalPoints: number;
  pointsRemaining: number;
  systems: Record<UpgradeSystem, UpgradeConfig>;
}

// Tier costs: going from 1→2 costs 20, 2→3 costs 20 (so max per system 40)
export const UPGRADE_COST: Record<UpgradeTier, number> = {
  1: 0,   // base
  2: 20,
  3: 40,
};

// Calculate cost to reach a tier from current tier
export function getUpgradeCost(currentTier: UpgradeTier, targetTier: UpgradeTier): number {
  if (targetTier <= currentTier) return 0;
  return UPGRADE_COST[targetTier] - UPGRADE_COST[currentTier];
}

interface UpgradeStore {
  upgrades: UpgradesState;
  setUpgrade: (system: UpgradeSystem, tier: UpgradeTier) => boolean;
  resetUpgrades: () => void;
  getUpgradeMultipliers: () => {
    silicon: number;
    chips: number;
    racks: number;
    launch: number;
    opexMultiplier: number;
    carbonMultiplier: number;
    launchRiskBonus: number;
    tierMultipliers?: {
      throughput: { 1: number; 2: number; 3: number };
      opex: { 1: number; 2: number; 3: number };
      carbon: { 1: number; 2: number; 3: number };
      risk: { 1: number; 2: number; 3: number };
    };
  };
}

const INITIAL_UPGRADES: UpgradesState = {
  totalPoints: 100,
  pointsRemaining: 100,
  systems: {
    silicon: { tier: 1, pointsSpent: 0 },
    chips: { tier: 1, pointsSpent: 0 },
    racks: { tier: 1, pointsSpent: 0 },
    launch: { tier: 1, pointsSpent: 0 },
  },
};

export const useUpgradeStore = create<UpgradeStore>((set, get) => ({
  upgrades: INITIAL_UPGRADES,

  setUpgrade: (system: UpgradeSystem, tier: UpgradeTier) => {
    const state = get();
    const currentTier = state.upgrades.systems[system].tier;
    
    // Can't downgrade
    if (tier < currentTier) {
      return false;
    }
    
    // Already at this tier
    if (tier === currentTier) {
      return true;
    }
    
    // Calculate cost
    const cost = getUpgradeCost(currentTier, tier);
    
    // Check if we have enough points
    if (state.upgrades.pointsRemaining < cost) {
      return false; // Not enough points
    }
    
    // Apply upgrade
    set((s) => {
      const newSystems = { ...s.upgrades.systems };
      newSystems[system] = {
        tier,
        pointsSpent: UPGRADE_COST[tier],
      };
      
      return {
        upgrades: {
          ...s.upgrades,
          pointsRemaining: s.upgrades.pointsRemaining - cost,
          systems: newSystems,
        },
      };
    });
    
    return true;
  },

  resetUpgrades: () => {
    set({ upgrades: INITIAL_UPGRADES });
  },

  getUpgradeMultipliers: () => {
    const { upgrades } = get();
    const { silicon, chips, racks, launch } = upgrades.systems;
    
    // Standard tier multipliers as specified
    const TIER_MULTIPLIERS = {
      throughput: { 1: 1.0, 2: 1.3, 3: 1.6 },
      opex: { 1: 1.0, 2: 1.10, 3: 1.25 },
      carbon: { 1: 1.0, 2: 1.08, 3: 1.20 },
      risk: { 1: 1.0, 2: 1.05, 3: 1.15 },
    } as const;
    
    // Throughput multipliers per stage
    const siliconMult = TIER_MULTIPLIERS.throughput[silicon.tier as 1 | 2 | 3];
    const chipsMult = TIER_MULTIPLIERS.throughput[chips.tier as 1 | 2 | 3];
    const racksMult = TIER_MULTIPLIERS.throughput[racks.tier as 1 | 2 | 3];
    const launchMult = TIER_MULTIPLIERS.throughput[launch.tier as 1 | 2 | 3];
    
    // OPEX multiplier: sum of all non-launch stages
    const opexMultFromUpgrades =
      TIER_MULTIPLIERS.opex[silicon.tier as 1 | 2 | 3] *
      TIER_MULTIPLIERS.opex[chips.tier as 1 | 2 | 3] *
      TIER_MULTIPLIERS.opex[racks.tier as 1 | 2 | 3];
    
    // Carbon multiplier: sum of silicon and chips
    const carbonMultFromUpgrades =
      TIER_MULTIPLIERS.carbon[silicon.tier as 1 | 2 | 3] *
      TIER_MULTIPLIERS.carbon[chips.tier as 1 | 2 | 3];
    
    // Launch risk: only from launch tier
    const launchRiskMultiplier = TIER_MULTIPLIERS.risk[launch.tier as 1 | 2 | 3];
    const launchRiskBonus = (launchRiskMultiplier - 1) * 0.01; // Convert to percentage bonus
    
    return {
      silicon: siliconMult,
      chips: chipsMult,
      racks: racksMult,
      launch: launchMult,
      opexMultiplier: opexMultFromUpgrades,
      carbonMultiplier: carbonMultFromUpgrades,
      launchRiskBonus,
      // Expose tier multipliers for per-stage calculations
      tierMultipliers: TIER_MULTIPLIERS,
    };
  },
}));

