/**
 * Parameterized Orbital Shell Model
 * Abstract shell engine - no real-world satellite dependencies
 */

export type ShellBand = "LEO_1" | "LEO_2" | "LEO_3";
export type Inclination = "EQUATORIAL" | "MID" | "POLAR";

export interface OrbitalShell {
  id: string;
  band: ShellBand;
  inclination: Inclination;
  altitudeKm: number;
  satellites: number;
  meanLifetimeYears: number;
  failureRatePerYear: number;
  capacityTFLOPs?: number; // Optional: compute capacity
}

/**
 * Create initial orbital shells
 */
export function createInitialShells(): OrbitalShell[] {
  return [
    {
      id: "LEO1_EQ",
      band: "LEO_1",
      inclination: "EQUATORIAL",
      altitudeKm: 400,
      satellites: 0,
      meanLifetimeYears: 7,
      failureRatePerYear: 0.02,
    },
    {
      id: "LEO2_MID",
      band: "LEO_2",
      inclination: "MID",
      altitudeKm: 700,
      satellites: 0,
      meanLifetimeYears: 6,
      failureRatePerYear: 0.03,
    },
    {
      id: "LEO3_POL",
      band: "LEO_3",
      inclination: "POLAR",
      altitudeKm: 1000,
      satellites: 0,
      meanLifetimeYears: 5,
      failureRatePerYear: 0.05,
    },
  ];
}

/**
 * Calculate orbital velocity for a shell (km/s)
 */
export function calculateOrbitalVelocity(altitudeKm: number): number {
  const EARTH_RADIUS_KM = 6371;
  const GM = 398600.4418; // Earth's gravitational parameter (km^3/s^2)
  const r = (EARTH_RADIUS_KM + altitudeKm) * 1000; // Convert to meters
  return Math.sqrt(GM * 1000000 / r) / 1000; // Convert back to km/s
}

/**
 * Calculate orbital period for a shell (seconds)
 */
export function calculateOrbitalPeriod(altitudeKm: number): number {
  const EARTH_RADIUS_KM = 6371;
  const GM = 398600.4418;
  const r = EARTH_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt((r * r * r) / GM);
}

/**
 * Calculate signal propagation delay for a shell (ms)
 */
export function calculatePropagationDelay(altitudeKm: number): number {
  const SPEED_OF_LIGHT_KM_S = 299792.458;
  return (altitudeKm * 2 / SPEED_OF_LIGHT_KM_S) * 1000; // Round trip in ms
}

/**
 * Update shell with new satellite count
 */
export function updateShellSatellites(
  shell: OrbitalShell,
  newCount: number
): OrbitalShell {
  return {
    ...shell,
    satellites: Math.max(0, newCount),
  };
}

/**
 * Calculate shell capacity based on satellite count and compute per satellite
 */
export function calculateShellCapacity(
  shell: OrbitalShell,
  computePerSatelliteTFLOPs: number
): number {
  return shell.satellites * computePerSatelliteTFLOPs;
}

/**
 * Apply natural decay to shell (satellites lost to failures)
 */
export function applyNaturalDecay(
  shell: OrbitalShell,
  yearsElapsed: number
): OrbitalShell {
  const expectedFailures = shell.satellites * shell.failureRatePerYear * yearsElapsed;
  const failed = Math.floor(expectedFailures + Math.random() * 0.5); // Add small randomness
  return {
    ...shell,
    satellites: Math.max(0, shell.satellites - failed),
  };
}

