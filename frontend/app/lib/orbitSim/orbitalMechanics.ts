/**
 * True Orbital Mechanics
 * Satellites move via orbital equations, not static positions
 */

export interface OrbitalState {
  altitudeRadius: number; // km
  inclination: number; // radians
  theta: number; // radians (current position in orbit)
  orbitalPeriod: number; // seconds
  launchTime: number; // timestamp when launched
}

const EARTH_RADIUS_KM = 6371;
const GRAVITATIONAL_CONSTANT = 3.986004418e14; // m^3/s^2 (Earth)

/**
 * Calculate orbital period from altitude
 * T = 2π * sqrt((R + h)^3 / GM)
 */
export function calculateOrbitalPeriod(altitudeKm: number): number {
  const radiusM = (EARTH_RADIUS_KM + altitudeKm) * 1000; // Convert to meters
  const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(radiusM, 3) / GRAVITATIONAL_CONSTANT);
  return periodSeconds;
}

/**
 * Calculate orbital angular velocity
 * ω = 2π / T
 */
export function calculateAngularVelocity(orbitalPeriod: number): number {
  return (2 * Math.PI) / orbitalPeriod;
}

/**
 * Update orbital theta based on time delta
 */
export function updateOrbitalTheta(
  currentTheta: number,
  orbitalPeriod: number,
  deltaTime: number
): number {
  const angularVelocity = calculateAngularVelocity(orbitalPeriod);
  return (currentTheta + angularVelocity * deltaTime) % (2 * Math.PI);
}

/**
 * Calculate 3D position from orbital state
 * x = r * cos(theta) * cos(inclination)
 * y = r * sin(theta)
 * z = r * cos(theta) * sin(inclination)
 */
export function calculateOrbitalPosition(
  altitudeKm: number,
  inclination: number,
  theta: number
): [number, number, number] {
  const radius = (EARTH_RADIUS_KM + altitudeKm) / EARTH_RADIUS_KM; // Normalized to Earth radius = 1
  
  // CRITICAL: Use same coordinate system as latLonAltToXYZ (Three.js Y-up)
  // Three.js: Y-up, X-east, Z-north
  // For orbital mechanics, we need to convert theta (orbit angle) and inclination to lat/lon
  // Then use the same conversion as latLonAltToXYZ for consistency
  
  // Simplified orbital to lat/lon conversion:
  // For a circular orbit at inclination, the latitude varies with sin(theta) * sin(inclination)
  // and longitude varies with the orbit angle
  const lat = Math.asin(Math.sin(theta) * Math.sin(inclination)) * 180 / Math.PI;
  // Longitude is the orbit angle projected onto the equator, plus a phase based on inclination
  let lon = (Math.atan2(Math.cos(theta) * Math.sin(inclination), Math.cos(inclination)) * 180 / Math.PI + theta * 180 / Math.PI) % 360;
  if (lon > 180) lon -= 360; // Normalize to [-180, 180]
  
  // Use THE ONLY CORRECT FORMULA (same as latLonAltToXYZ)
  // Note: parameter 'theta' is orbital angle, so we use 'thetaLon' for longitude conversion
  const phi = (90 - lat) * (Math.PI / 180);
  const thetaLon = (lon + 180) * (Math.PI / 180);
  
  const x = -radius * Math.sin(phi) * Math.cos(thetaLon);
  const z = radius * Math.sin(phi) * Math.sin(thetaLon);
  const y = radius * Math.cos(phi);
  
  // CRITICAL: Ensure position is above Earth
  const actualRadius = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  if (actualRadius < 1.05) {
    // Position is too close to Earth, push it outward
    const scale = 1.05 / actualRadius;
    return [x * scale, y * scale, z * scale];
  }
  
  return [x, y, z];
}

/**
 * Generate initial orbital state for a satellite
 */
export function generateOrbitalState(
  altitudeKm: number,
  inclination?: number
): OrbitalState {
  // Default inclination: 53 degrees (Starlink-like) or random
  const defaultInclination = inclination || (53 * Math.PI / 180);
  
  // Random starting theta
  const initialTheta = Math.random() * 2 * Math.PI;
  
  return {
    altitudeRadius: altitudeKm,
    inclination: defaultInclination,
    theta: initialTheta,
    orbitalPeriod: calculateOrbitalPeriod(altitudeKm),
    launchTime: Date.now(),
  };
}

/**
 * Get random inclination for a shell
 */
export function getRandomInclination(): number {
  // Typical LEO inclinations: 53° (Starlink), 97° (SSO), or random
  const inclinations = [
    53 * Math.PI / 180, // Starlink
    97 * Math.PI / 180, // SSO
    Math.random() * Math.PI, // Random
  ];
  return inclinations[Math.floor(Math.random() * inclinations.length)];
}

