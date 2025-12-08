/**
 * Satellite Deployment Strategy (Year-by-Year Counts)
 * Now uses strategy-based 3-shell model (LEO, MEO, GEO)
 */

import { 
  calculateDeployment, 
  getInitialState, 
  calculateMultiYearDeployment,
  STRATEGY_ORBIT_WEIGHTS,
  type StrategyMode,
  type DeploymentState,
  type DeploymentResult 
} from "./strategyDeployment";

export interface DeploymentYear {
  year: number;
  launches: number;
  satsPerLaunch: number;
  newSats: number;
  totalSats: number;
  orbitalPowerMW: number;
  phase: "ramp" | "scale" | "flood";
  // New fields for 3-shell model
  N_LEO: number;
  N_MEO: number;
  N_GEO: number;
  P_LEO: number; // kW
  P_MEO: number; // kW
  P_GEO: number; // kW
  totalComputePFLOPs: number;
  strategy: StrategyMode;
}

export interface ShellDistribution {
  shell: "LEO" | "MEO" | "GEO";
  altitudeRange: [min: number, max: number];
  percentage: number;
}

// Legacy shell distribution (for backward compatibility)
export const SHELL_DISTRIBUTION: ShellDistribution[] = [
  { shell: "LEO", altitudeRange: [500, 800], percentage: 0.60 },
  { shell: "MEO", altitudeRange: [8000, 20000], percentage: 0.25 },
  { shell: "GEO", altitudeRange: [35786, 35786], percentage: 0.15 },
];

const POWER_PER_SAT_KW = 100; // 100 kW per satellite

export const DEPLOYMENT_SCHEDULE: DeploymentYear[] = [
  // Phase 1 — Feasibility Ramp (2025–2027)
  { year: 2025, launches: 2, satsPerLaunch: 20, newSats: 40, totalSats: 40, orbitalPowerMW: 4, phase: "ramp" },
  { year: 2026, launches: 4, satsPerLaunch: 30, newSats: 120, totalSats: 160, orbitalPowerMW: 16, phase: "ramp" },
  { year: 2027, launches: 8, satsPerLaunch: 40, newSats: 320, totalSats: 480, orbitalPowerMW: 48, phase: "ramp" },
  
  // Phase 2 — Economic Crossover (2028–2031)
  { year: 2028, launches: 12, satsPerLaunch: 50, newSats: 600, totalSats: 1080, orbitalPowerMW: 108, phase: "scale" },
  { year: 2029, launches: 20, satsPerLaunch: 60, newSats: 1200, totalSats: 2280, orbitalPowerMW: 228, phase: "scale" },
  { year: 2030, launches: 30, satsPerLaunch: 60, newSats: 1800, totalSats: 4080, orbitalPowerMW: 408, phase: "scale" },
  { year: 2031, launches: 40, satsPerLaunch: 60, newSats: 2400, totalSats: 6480, orbitalPowerMW: 648, phase: "scale" },
  
  // Phase 3 — Flood the Planet (2032–2040)
  { year: 2032, launches: 60, satsPerLaunch: 60, newSats: 3600, totalSats: 10080, orbitalPowerMW: 1008, phase: "flood" },
  { year: 2033, launches: 80, satsPerLaunch: 60, newSats: 4800, totalSats: 14880, orbitalPowerMW: 1488, phase: "flood" },
  { year: 2034, launches: 120, satsPerLaunch: 60, newSats: 7200, totalSats: 22080, orbitalPowerMW: 2208, phase: "flood" },
  { year: 2035, launches: 160, satsPerLaunch: 60, newSats: 9600, totalSats: 31680, orbitalPowerMW: 3168, phase: "flood" },
  { year: 2036, launches: 200, satsPerLaunch: 60, newSats: 12000, totalSats: 43680, orbitalPowerMW: 4368, phase: "flood" },
  { year: 2037, launches: 250, satsPerLaunch: 60, newSats: 15000, totalSats: 58680, orbitalPowerMW: 5868, phase: "flood" },
  { year: 2038, launches: 300, satsPerLaunch: 60, newSats: 18000, totalSats: 76680, orbitalPowerMW: 7668, phase: "flood" },
  { year: 2039, launches: 350, satsPerLaunch: 60, newSats: 21000, totalSats: 97680, orbitalPowerMW: 9768, phase: "flood" },
  { year: 2040, launches: 400, satsPerLaunch: 60, newSats: 24000, totalSats: 121680, orbitalPowerMW: 12168, phase: "flood" },
];

/**
 * Get deployment data for a specific year
 */
export function getDeploymentForYear(year: number): DeploymentYear | null {
  return DEPLOYMENT_SCHEDULE.find(d => d.year === year) || null;
}

/**
 * Get cumulative satellites up to a year
 */
export function getTotalSatsByYear(year: number): number {
  const deployment = getDeploymentForYear(year);
  return deployment?.totalSats || 0;
}

/**
 * Get new satellites for a year
 */
export function getNewSatsForYear(year: number): number {
  const deployment = getDeploymentForYear(year);
  return deployment?.newSats || 0;
}

/**
 * Assign satellite to shell based on strategy and distribution
 * Now uses strategy-based orbit allocation weights
 */
export function assignSatelliteToShell(
  satelliteIndex: number, 
  totalNewSats: number,
  strategy: StrategyMode = "balanced"
): ShellDistribution {
  // Get strategy weights
  const weights = STRATEGY_ORBIT_WEIGHTS[strategy];
  
  // Create distribution based on strategy
  const distribution: ShellDistribution[] = [
    { shell: "LEO", altitudeRange: [500, 800], percentage: weights.LEO },
    { shell: "MEO", altitudeRange: [8000, 20000], percentage: weights.MEO },
    { shell: "GEO", altitudeRange: [35786, 35786], percentage: weights.GEO },
  ];
  
  // Use satellite index to deterministically assign shell
  const cumulative = [distribution[0].percentage];
  for (let i = 1; i < distribution.length; i++) {
    cumulative.push(cumulative[i - 1] + distribution[i].percentage);
  }
  
  const random = (satelliteIndex / totalNewSats) % 1; // Deterministic based on index
  
  for (let i = 0; i < cumulative.length; i++) {
    if (random < cumulative[i]) {
      return distribution[i];
    }
  }
  
  return distribution[distribution.length - 1];
}

/**
 * Get random altitude within shell range
 */
export function getAltitudeForShell(shell: ShellDistribution): number {
  const [min, max] = shell.altitudeRange;
  return min + Math.random() * (max - min);
}

