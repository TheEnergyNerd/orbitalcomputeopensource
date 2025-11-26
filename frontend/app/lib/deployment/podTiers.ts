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

export const POD_TIERS: PodTier[] = [
  {
    id: "tier1",
    label: "Tier 1 Pod",
    powerKW: 150, // 150 kW base capacity
    unlockAtTotalPods: 0,
    baseCostM: 50,
    baseBuildDays: 180,
  },
  {
    id: "tier2",
    label: "Tier 2 Pod",
    powerKW: 1000, // 1 MW
    unlockAtTotalPods: 100,
    baseCostM: 80,
    baseBuildDays: 150,
  },
  {
    id: "tier3",
    label: "Tier 3 Pod",
    powerKW: 5000, // 5 MW
    unlockAtTotalPods: 500,
    baseCostM: 120,
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

