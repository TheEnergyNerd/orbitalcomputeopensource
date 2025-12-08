/**
 * Pod Tier System
 * Progression based on total pods built, not difficulty modes
 */

export type PodTierId = "tier1" | "tier2" | "tier3";

export interface PodTier {
  id: PodTierId;
  label: string;
  powerKW: number;
  unlockAtTotalPods: number;
  baseCostM: number; // per pod in $M
  baseBuildDays: number; // initial build time per pod
}

// NEW POWER-FIRST POD TIERS (all >= 100kW)
export const POD_TIERS: PodTier[] = [
  {
    id: "tier1",
    label: "Base Pod",
    powerKW: 100, // 100 kW minimum (2025 physics floor)
    unlockAtTotalPods: 0,
    baseCostM: 2, // $2M (BASE_POD cost)
    baseBuildDays: 180,
  },
  {
    id: "tier2",
    label: "Enhanced Pod",
    powerKW: 500, // 500 kW
    unlockAtTotalPods: 50,
    baseCostM: 5,
    baseBuildDays: 150,
  },
  {
    id: "tier3",
    label: "High-Power Pod",
    powerKW: 1000, // 1 MW
    unlockAtTotalPods: 200,
    baseCostM: 10,
    baseBuildDays: 120,
  },
];

/**
 * Get available pod tiers based on total pods built
 */
export function getAvailableTiers(totalPodsBuilt: number): PodTier[] {
  return POD_TIERS.filter((tier) => totalPodsBuilt >= tier.unlockAtTotalPods);
}

/**
 * Get the highest tier available
 */
export function getHighestAvailableTier(totalPodsBuilt: number): PodTier {
  const available = getAvailableTiers(totalPodsBuilt);
  return available[available.length - 1] || POD_TIERS[0];
}

