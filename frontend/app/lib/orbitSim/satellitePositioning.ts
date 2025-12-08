/**
 * Physically Coherent Satellite Positioning
 * 
 * Implements strict constraints:
 * - Latitude bands per shell (LEO ±70°, MEO ±55°, GEO ±2°)
 * - Uniform longitude distribution
 * - Non-uniform latitude distribution (arcsin)
 * - Minimum angular spacing
 * - Correct lat/lon to XYZ conversion
 */

export type ShellType = "LEO" | "MEO" | "GEO" | "SSO";
export type SatelliteClass = "A" | "B";

export interface SatellitePosition {
  lat: number; // degrees
  lon: number; // degrees
  alt: number; // km
  x: number;
  y: number;
  z: number;
  shell: ShellType;
}

// Shell configuration
const SHELL_CONFIG = {
  LEO: {
    latitudeBand: 70, // degrees
    altitudeRange: [550, 750] as [number, number], // km
    minAngularSeparation: 5.0, // degrees (increased for more spread)
  },
  MEO: {
    latitudeBand: 55, // degrees
    altitudeRange: [1000, 1500] as [number, number], // km (brought much closer)
    minAngularSeparation: 8.0, // degrees (increased for more spread)
  },
  GEO: {
    latitudeBand: 2, // degrees
    altitudeRange: [2000, 2500] as [number, number], // km (brought much closer, no longer true GEO)
    minAngularSeparation: 12.0, // degrees (increased for more spread)
  },
  SSO: {
    latitudeBand: 98, // degrees (sun-synchronous, near-polar)
    altitudeRange: [560, 560] as [number, number], // km (fixed SSO altitude)
    minAngularSeparation: 6.0, // degrees
    inclination: 98, // degrees (sun-synchronous)
  },
};

const EARTH_RADIUS_KM = 6371;

/**
 * LAT/LON → XYZ CONVERSION
 * Adjusted for Three.js Y-up and webgl-earth texture orientation
 * 
 * For Three.js sphere geometry with webgl-earth texture (flipY=true):
 * x = r × cos(lat) × sin(lon)  [Adjusted for texture]
 * y = r × sin(lat)              [Y is vertical]
 * z = r × cos(lat) × cos(lon)  [Adjusted for texture]
 * 
 * Angles must be in radians
 */
export function latLonToXYZ(latDeg: number, lonDeg: number, radius: number): [number, number, number] {
  const latRad = latDeg * (Math.PI / 180);
  const lonRad = lonDeg * (Math.PI / 180);
  
  // Adjusted to match webgl-earth texture orientation
  const x = radius * Math.cos(latRad) * Math.sin(lonRad);
  const y = radius * Math.sin(latRad);
  const z = radius * Math.cos(latRad) * Math.cos(lonRad);
  
  return [x, y, z];
}

/**
 * Sample latitude using arcsin distribution
 * u = randomUniform(0, 1)
 * lat = arcsin(2u - 1) × (bandLimit / 90) × (180 / π)
 * 
 * This creates:
 * - High density near equator (human population)
 * - Sparse near poles
 * - Hard limit at ±bandLimit
 * 
 * The arcsin distribution naturally keeps satellites away from poles:
 * - Most satellites cluster near equator (lat ≈ 0°)
 * - Few satellites near band limits (lat ≈ ±bandLimit)
 */
function sampleLatitude(bandLimit: number): number {
  const u = Math.random();
  // arcsin(2u - 1) gives [-π/2, π/2] radians
  // Convert to degrees: [-90°, 90°]
  // Scale by (bandLimit / 90) to get [-bandLimit, bandLimit] degrees
  const latRad = Math.asin(2 * u - 1); // [-π/2, π/2] radians
  const latDeg = latRad * (180 / Math.PI) * (bandLimit / 90); // Scale to [-bandLimit, bandLimit] degrees
  
  // Clamp to ensure we never exceed the band limit
  const clamped = Math.max(-bandLimit, Math.min(bandLimit, latDeg));
  
  // Additional safety: ensure we're not too close to poles
  // For LEO (70° band), this means satellites stay between -70° and +70° (20° from poles)
  // The arcsin distribution already does this, but enforce explicitly
  return clamped;
}

/**
 * Sample longitude uniformly
 * lon = randomUniform(-180, +180)
 */
function sampleLongitude(): number {
  return (Math.random() - 0.5) * 360; // [-180, 180]
}

/**
 * Calculate angular distance between two lat/lon points (in degrees)
 */
function angularDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);
  const lon1Rad = lon1 * (Math.PI / 180);
  const lon2Rad = lon2 * (Math.PI / 180);
  
  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return c * (180 / Math.PI); // Convert to degrees
}

/**
 * Check if a position violates minimum angular spacing
 */
function violatesAngularSpacing(
  newLat: number,
  newLon: number,
  existingPositions: Array<{ lat: number; lon: number; shell: ShellType }>,
  shell: ShellType,
  minSeparation: number
): boolean {
  for (const existing of existingPositions) {
    if (existing.shell === shell) {
      const distance = angularDistance(newLat, newLon, existing.lat, existing.lon);
      if (distance < minSeparation) {
        return true; // Violates spacing
      }
    }
  }
  return false; // No violation
}

/**
 * Generate SSO (Sun-Synchronous Orbit) position for Class B satellites
 * 
 * SSO satellites use:
 * - Inclination ~98° (sun-synchronous)
 * - Altitude ~560 km
 * - Latitude distribution constrained by inclination
 * 
 * @param existingPositions Array of existing positions to check spacing against
 * @returns SatellitePosition or null if unable to find valid position
 */
export function generateSSOPosition(
  existingPositions: Array<{ lat: number; lon: number; shell: ShellType }> = []
): SatellitePosition | null {
  const config = SHELL_CONFIG.SSO;
  const inclinationRad = config.inclination * (Math.PI / 180);
  const maxAttempts = 100;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Sample longitude uniformly
    const lon = sampleLongitude();
    
    // Sample latitude using inclination constraint
    // For SSO, latitude is constrained by inclination: lat ≈ asin(sin(inclination) * sin(random))
    const u = Math.random() * 2 - 1; // [-1, 1]
    const latRad = Math.asin(Math.sin(inclinationRad) * u);
    const lat = latRad * (180 / Math.PI);
    
    // Check angular spacing
    if (!violatesAngularSpacing(lat, lon, existingPositions, "SSO", config.minAngularSeparation)) {
      // Sample altitude (fixed for SSO, but allow small variation)
      const alt = config.altitudeRange[0] + Math.random() * (config.altitudeRange[1] - config.altitudeRange[0]);
      const radius = 1.0 + (alt / EARTH_RADIUS_KM);
      
      const [x, y, z] = latLonToXYZ(lat, lon, radius);
      
      return {
        lat,
        lon,
        alt,
        x,
        y,
        z,
        shell: "SSO",
      };
    }
  }
  
  return null; // Failed to find valid position
}

/**
 * Generate a single satellite position for a given shell
 * Enforces all constraints: latitude band, angular spacing, altitude
 */
export function generateSatellitePosition(
  shell: ShellType,
  existingPositions: Array<{ lat: number; lon: number; shell: ShellType }> = [],
  maxAttempts: number = 100
): SatellitePosition | null {
  // Special case: SSO uses different sampling
  if (shell === "SSO") {
    return generateSSOPosition(existingPositions);
  }
  
  const config = SHELL_CONFIG[shell];
  const minSeparation = config.minAngularSeparation;
  
  // Sample altitude within shell range
  const [minAlt, maxAlt] = config.altitudeRange;
  const altitude = shell === "GEO" ? minAlt : minAlt + Math.random() * (maxAlt - minAlt);
  
  // Calculate orbit radius (normalized to Earth radius = 1)
  const orbitRadius = 1.0 + (altitude / EARTH_RADIUS_KM);
  
  // Try to find a valid position
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. Sample longitude uniformly
    const lon = sampleLongitude();
    
    // 2. Sample latitude using arcsin distribution
    let lat = sampleLatitude(config.latitudeBand);
    
    // 3. Clamp to band limit (should already be clamped, but double-check)
    lat = Math.max(-config.latitudeBand, Math.min(config.latitudeBand, lat));
    
    // 4. CRITICAL: Ensure satellite maintains appropriate distance from poles
    // Add a buffer zone to keep satellites away from the extreme band limits
    // This prevents satellites from clustering too close to the poles
    const poleBuffer = Math.max(5, config.latitudeBand * 0.1); // 10% of band or 5° minimum
    const effectiveBandLimit = config.latitudeBand - poleBuffer;
    const absLat = Math.abs(lat);
    
    // Reject positions that are too close to the pole
    if (absLat > effectiveBandLimit) {
      continue; // Too close to pole, resample
    }
    
    // 5. Check angular spacing
    if (violatesAngularSpacing(lat, lon, existingPositions, shell, minSeparation)) {
      continue; // Try again
    }
    
    // 5. Convert to XYZ using THE ONLY CORRECT FORMULA
    const [x, y, z] = latLonToXYZ(lat, lon, orbitRadius);
    
    // 6. Validate radius
    const actualRadius = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    if (actualRadius < 1.0) {
      continue; // Invalid, try again
    }
    
    return {
      lat,
      lon,
      alt: altitude,
      x,
      y,
      z,
      shell,
    };
  }
  
  // Failed to find valid position after max attempts
  console.warn(`[SatellitePositioning] Failed to generate position for ${shell} after ${maxAttempts} attempts`);
  return null;
}

/**
 * Generate multiple satellite positions for a shell
 * Ensures all constraints are met for all satellites
 */
export function generateSatellitePositions(
  shell: ShellType,
  count: number
): SatellitePosition[] {
  const positions: SatellitePosition[] = [];
  const existing: Array<{ lat: number; lon: number; shell: ShellType }> = [];
  
  for (let i = 0; i < count; i++) {
    const position = generateSatellitePosition(shell, existing);
    if (position) {
      positions.push(position);
      existing.push({ lat: position.lat, lon: position.lon, shell: position.shell });
    } else {
      console.warn(`[SatellitePositioning] Failed to generate position ${i + 1}/${count} for ${shell}`);
    }
  }
  
  return positions;
}

/**
 * Get shell altitude (average or specific)
 */
export function getShellAltitude(shell: ShellType): number {
  const config = SHELL_CONFIG[shell];
  const [minAlt, maxAlt] = config.altitudeRange;
  if (shell === "GEO") {
    return minAlt; // Fixed altitude
  }
  return (minAlt + maxAlt) / 2; // Average
}

/**
 * Get shell from altitude
 */
export function getShellFromAltitude(altKm: number): ShellType {
  if (altKm >= 1000 && altKm <= 1500) {
    return "MEO";
  } else if (altKm >= 2000 && altKm <= 2500) {
    return "GEO";
  } else {
    return "LEO"; // Default to LEO (550-750 km)
  }
}

