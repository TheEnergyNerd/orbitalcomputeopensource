/**
 * MULTI-SHELL ORBITAL CAPACITY MODEL
 * Five distinct orbital shells with capacity limits, power constraints, and radiation penalties
 * Target: 150 GW orbital by 2040 (150k satellites at 1 MW each)
 * 
 * DEPLOYMENT_SCALE: 0.64 (to scale from 235k to 150k satellites)
 */
const DEPLOYMENT_SCALE = 0.64;

export type OrbitShellId = "LEO_340" | "LEO_550" | "LEO_1100" | "MEO_8000" | "MEO_20000";

export interface OrbitShell {
  id: OrbitShellId;
  altitude_km: number; // Single altitude value
  altitude_range_km: [min: number, max: number]; // Range for compatibility
  spacing_km: number; // Safe spacing between satellites
  max_power_per_sat_kw: number; // Maximum power per satellite in this shell
  eclipse_fraction: number; // Fraction of time in eclipse
  debris_risk: 'low' | 'medium' | 'high' | 'very_high' | 'permanent';
  radiation_penalty?: number; // Efficiency loss from radiation (0-1)
  latency_ms: number;
  stability_rating: number;
  solar_efficiency: number; // relative multiplier
  congestion_capacity: number; // max satellites before congestion penalty
  carbon_amortization_factor: number;
}

export const ORBIT_SHELLS: OrbitShell[] = [
  {
    id: "LEO_340",
    altitude_km: 340,
    altitude_range_km: [250, 350],
    spacing_km: 80, // Tighter spacing, more drag
    max_power_per_sat_kw: 300, // Limited by drag/size
    eclipse_fraction: 0.35, // More time in shadow at low altitude
    debris_risk: 'low', // Deorbits naturally in ~2 years
    latency_ms: 25,
    stability_rating: 0.4,
    solar_efficiency: 0.6,
    congestion_capacity: Math.round(30_000 * DEPLOYMENT_SCALE), // Scaled to 150 GW target (19,200)
    carbon_amortization_factor: 1.4,
  },
  {
    id: "LEO_550",
    altitude_km: 550,
    altitude_range_km: [400, 600],
    spacing_km: 80,
    max_power_per_sat_kw: 500,
    eclipse_fraction: 0.30,
    debris_risk: 'medium', // Deorbits in ~5-7 years
    latency_ms: 65,
    stability_rating: 0.9,
    solar_efficiency: 1.0,
    congestion_capacity: Math.round(80_000 * DEPLOYMENT_SCALE), // Scaled to 150 GW target (51,200)
    carbon_amortization_factor: 1.0,
  },
  {
    id: "LEO_1100",
    altitude_km: 1100,
    altitude_range_km: [600, 800],
    spacing_km: 100,
    max_power_per_sat_kw: 800,
    eclipse_fraction: 0.25,
    debris_risk: 'high', // Decades to deorbit
    latency_ms: 110,
    stability_rating: 1.3,
    solar_efficiency: 1.4,
    congestion_capacity: Math.round(50_000 * DEPLOYMENT_SCALE), // Scaled to 150 GW target (32,000)
    carbon_amortization_factor: 0.6,
  },
  {
    id: "MEO_8000",
    altitude_km: 8000,
    altitude_range_km: [8000, 12000],
    spacing_km: 300, // Wider spacing needed
    max_power_per_sat_kw: 1000,
    eclipse_fraction: 0.15,
    debris_risk: 'very_high', // Doesn't deorbit naturally
    radiation_penalty: 0.10, // 10% efficiency loss from Van Allen belt
    latency_ms: 220,
    stability_rating: 1.6,
    solar_efficiency: 0.9,
    congestion_capacity: Math.round(40_000 * DEPLOYMENT_SCALE), // Scaled to 150 GW target (25,600)
    carbon_amortization_factor: 0.8,
  },
  {
    id: "MEO_20000",
    altitude_km: 20000,
    altitude_range_km: [15000, 25000],
    spacing_km: 500,
    max_power_per_sat_kw: 2000,
    eclipse_fraction: 0.05, // Almost always sunlit
    debris_risk: 'permanent',
    radiation_penalty: 0.25, // 25% efficiency loss from Van Allen belt
    latency_ms: 280,
    stability_rating: 2.0,
    solar_efficiency: 1.2,
    congestion_capacity: Math.round(20_000 * DEPLOYMENT_SCALE), // Scaled to 150 GW target (12,800)
    carbon_amortization_factor: 0.5,
  },
];

/**
 * Get shell by altitude
 */
export function getShellByAltitude(alt_km: number): OrbitShell {
  for (const shell of ORBIT_SHELLS) {
    if (alt_km >= shell.altitude_range_km[0] && alt_km <= shell.altitude_range_km[1]) {
      return shell;
    }
  }
  // Default to LEO_550 if altitude doesn't match
  return ORBIT_SHELLS[1];
}

/**
 * Get shell by ID
 */
export function getShellById(id: OrbitShellId): OrbitShell {
  return ORBIT_SHELLS.find(s => s.id === id) || ORBIT_SHELLS[1];
}

