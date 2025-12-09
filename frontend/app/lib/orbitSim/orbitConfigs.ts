/**
 * Rocket and Pod Type Configurations
 * Defines available launch vehicles and compute pod types
 */

export type RocketId = 'falcon' | 'newGlenn' | 'starship';
export type PodTypeId = 'base' | 'edge' | 'hyperscale' | 'monster';

export interface RocketConfig {
  id: RocketId;
  label: string;
  description: string;
  launchCost: number;          // $ per launch
  podsPerLaunch: number;       // how many pods this rocket can carry
  failureRate: number;         // per-launch failure probability (0..1)
  maxLaunchesPerYear: number;  // capacity cap
}

export interface PodConfig {
  id: PodTypeId;
  label: string;
  description: string;
  computePerPodTflopYr: number;     // TFLOP-yr per pod
  powerPerPodKw: number;            // kW at full load
  coolingEfficiencyFactor: number;  // <1 is better than ground
  podCapex: number;                 // $ per pod hardware
}

export const ROCKETS: RocketConfig[] = [
  {
    id: 'falcon',
    label: 'Falcon 9',
    description: 'Proven workhorse. Medium cost, reliable.',
    launchCost: 50_000_000,      // $50M per launch
    podsPerLaunch: 4,
    failureRate: 0.02,            // 2% failure rate
    maxLaunchesPerYear: 144,      // ~12 launches/month
  },
  {
    id: 'newGlenn',
    label: 'New Glenn',
    description: 'Heavy lift. Higher cost, more pods per launch.',
    launchCost: 80_000_000,      // $80M per launch
    podsPerLaunch: 8,
    failureRate: 0.05,            // 5% failure rate (newer system)
    maxLaunchesPerYear: 60,       // ~5 launches/month
  },
  {
    id: 'starship',
    label: 'Starship',
    description: 'Massive capacity. Very high cost but cheapest $/kg.',
    launchCost: 100_000_000,     // $100M per launch
    podsPerLaunch: 25,
    failureRate: 0.08,            // 8% failure rate (early system)
    maxLaunchesPerYear: 200,      // ~16 launches/month (high cadence)
  },
];

// OLD POD_TYPES DELETED - Using power-first model instead
// All pods must have >= 100kW power (enforced in orbitalPodSpec.ts)
export const POD_TYPES: PodConfig[] = [
  {
    id: 'base',
    label: 'Base Pod',
    description: '100kW minimum power pod (2025 physics floor).',
    computePerPodTflopYr: 0, // Compute derived from power, not constant
    powerPerPodKw: 100,      // 100 kW minimum (enforced)
    coolingEfficiencyFactor: 0.6,
    podCapex: 2_000_000,     // $2M per pod (BASE_POD cost)
  },
];

// Helper functions
export function getRocket(id: RocketId): RocketConfig {
  return ROCKETS.find(r => r.id === id) || ROCKETS[0];
}

export function getPodType(id: PodTypeId): PodConfig {
  return POD_TYPES.find(p => p.id === id) || POD_TYPES[0]; // Return first pod if not found
}

