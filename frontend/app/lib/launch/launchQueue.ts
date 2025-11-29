/**
 * Launch queue and provider system
 */

export type LaunchProviderId = 'f9' | 'starship' | 'smallLift';

export interface LaunchProvider {
  id: LaunchProviderId;
  enabled: boolean;
  podsPerLaunch: number;
  launchesPerMonth: number;
}

export interface LaunchQueueItem {
  id: string;
  etaMonths: number;
}

export interface LaunchState {
  providers: Record<LaunchProviderId, LaunchProvider>;
  queue: LaunchQueueItem[];
  maxQueue: number; // e.g. 5 initially
}

export const DEFAULT_LAUNCH_PROVIDERS: Record<LaunchProviderId, Omit<LaunchProvider, 'enabled'>> = {
  f9: {
    id: 'f9',
    podsPerLaunch: 1,
    launchesPerMonth: 4,
  },
  starship: {
    id: 'starship',
    podsPerLaunch: 5,
    launchesPerMonth: 12,
  },
  smallLift: {
    id: 'smallLift',
    podsPerLaunch: 1,
    launchesPerMonth: 2,
  },
};

export function createDefaultLaunchState(): LaunchState {
  return {
    providers: {
      f9: { ...DEFAULT_LAUNCH_PROVIDERS.f9, enabled: true },
      starship: { ...DEFAULT_LAUNCH_PROVIDERS.starship, enabled: false },
      smallLift: { ...DEFAULT_LAUNCH_PROVIDERS.smallLift, enabled: false },
    },
    queue: [],
    maxQueue: 5,
  };
}

/**
 * Calculate deployment rate from launch providers
 */
export function calculateDeploymentRate(launchState: LaunchState): number {
  let totalPodsPerMonth = 0;
  for (const provider of Object.values(launchState.providers)) {
    if (provider.enabled) {
      totalPodsPerMonth += provider.launchesPerMonth * provider.podsPerLaunch;
    }
  }
  return totalPodsPerMonth;
}

/**
 * Process launch queue for one month
 * Returns: number of pods launched this month
 */
export function processLaunchQueue(
  launchState: LaunchState,
  podsAvailable: number,
  fuelAvailable: number,
  fuelPerLaunch: number = 10
): { newState: LaunchState; podsLaunched: number } {
  const next: LaunchState = {
    ...launchState,
    queue: launchState.queue.map(item => ({ ...item, etaMonths: item.etaMonths - 1 })),
  };

  // Remove completed launches
  const completed = next.queue.filter(item => item.etaMonths <= 0).length;
  next.queue = next.queue.filter(item => item.etaMonths > 0);

  let podsLaunched = completed;

  // Try to add new launches to queue
  const deploymentRate = calculateDeploymentRate(launchState);
  const maxNewLaunches = Math.floor(deploymentRate / 12); // Approximate per-month launches

  for (let i = 0; i < maxNewLaunches; i++) {
    if (
      next.queue.length < next.maxQueue &&
      podsAvailable >= 1 &&
      fuelAvailable >= fuelPerLaunch
    ) {
      next.queue.push({
        id: `launch_${Date.now()}_${Math.random()}`,
        etaMonths: 6, // Base launch duration: 6 months
      });
      podsAvailable -= 1;
      fuelAvailable -= fuelPerLaunch;
    }
  }

  return { newState: next, podsLaunched };
}

