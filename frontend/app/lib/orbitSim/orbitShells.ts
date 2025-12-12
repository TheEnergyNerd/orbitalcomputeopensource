/**
 * NEW ORBITAL SHELL MODEL (ENERGY-FIRST)
 * Four distinct orbital compute shells with energy-first properties
 */

export type OrbitShellId = "VLEO" | "MID-LEO" | "SSO" | "MEO" | "GEO";

export interface OrbitShell {
  id: OrbitShellId;
  altitude_km: [min: number, max: number];
  latency_ms: number;
  stability_rating: number;
  solar_efficiency: number; // relative multiplier
  congestion_capacity: number; // max active routes
  carbon_amortization_factor: number;
}

export const ORBIT_SHELLS: OrbitShell[] = [
  {
    id: "VLEO",
    altitude_km: [250, 350],
    latency_ms: 25,
    stability_rating: 0.4,
    solar_efficiency: 0.6,
    congestion_capacity: 5_000,
    carbon_amortization_factor: 1.4,
  },
  {
    id: "MID-LEO",
    altitude_km: [400, 600], // More distinct from VLEO
    latency_ms: 65,
    stability_rating: 0.9,
    solar_efficiency: 1.0,
    congestion_capacity: 20_000,
    carbon_amortization_factor: 1.0,
  },
  {
    id: "SSO",
    altitude_km: [600, 800], // Class B satellites altitude range
    latency_ms: 110,
    stability_rating: 1.3,
    solar_efficiency: 1.4,
    congestion_capacity: 35_000,
    carbon_amortization_factor: 0.6,
  },
  {
    id: "MEO",
    altitude_km: [10000, 15000], // Much higher for visual distinction
    latency_ms: 220,
    stability_rating: 1.6,
    solar_efficiency: 0.9,
    congestion_capacity: 50_000,
    carbon_amortization_factor: 0.8,
  },
  {
    id: "GEO",
    altitude_km: [35786, 35786], // Fixed altitude - true GEO
    latency_ms: 280,
    stability_rating: 2.0,
    solar_efficiency: 1.2,
    congestion_capacity: 100_000,
    carbon_amortization_factor: 0.5,
  },
];

/**
 * Get shell by altitude
 */
export function getShellByAltitude(alt_km: number): OrbitShell {
  for (const shell of ORBIT_SHELLS) {
    if (alt_km >= shell.altitude_km[0] && alt_km <= shell.altitude_km[1]) {
      return shell;
    }
  }
  // Default to MID-LEO if altitude doesn't match
  return ORBIT_SHELLS[1];
}

/**
 * Get shell by ID
 */
export function getShellById(id: OrbitShellId): OrbitShell {
  return ORBIT_SHELLS.find(s => s.id === id) || ORBIT_SHELLS[1];
}

