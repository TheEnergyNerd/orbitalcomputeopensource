/**
 * Launch Provider System
 * Each provider has capacity limits (pods per launch, launches per month)
 */

export type LaunchProviderId = "F9" | "Starship" | "SmallLift";

export interface LaunchProvider {
  id: LaunchProviderId;
  label: string;
  podsPerLaunch: number;
  launchesPerMonth: number; // Average launches per month
}

export const LAUNCH_PROVIDERS: Record<LaunchProviderId, LaunchProvider> = {
  F9: {
    id: "F9",
    label: "F9",
    podsPerLaunch: 1,
    launchesPerMonth: 4, // 3-5 range, average 4
  },
  Starship: {
    id: "Starship",
    label: "Starship",
    podsPerLaunch: 5,
    launchesPerMonth: 12, // 10-20 range, average 12
  },
  SmallLift: {
    id: "SmallLift",
    label: "SmallLift",
    podsPerLaunch: 1,
    launchesPerMonth: 2, // 1-2 range, average 2
  },
};

/**
 * Calculate total launch capacity from active providers
 */
export function calculateLaunchCapacity(activeProviders: LaunchProviderId[]): number {
  return activeProviders.reduce((total, providerId) => {
    const provider = LAUNCH_PROVIDERS[providerId];
    return total + (provider.podsPerLaunch * provider.launchesPerMonth);
  }, 0);
}

