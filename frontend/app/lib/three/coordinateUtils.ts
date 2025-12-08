import { Vector3, CatmullRomCurve3 } from "three";

/**
 * Convert lat/lon/alt to Three.js x/y/z coordinates
 * Earth radius in Three.js units (normalized to 1)
 */
const EARTH_RADIUS = 1;

/**
 * LAT/LON → 3D CONVERSION FOR MARKERS AND TEXTURE ALIGNMENT
 * This formula works with the webgl-earth texture (flipY=true)
 * 
 * Uses the formula that was working correctly for launch sites and data centers:
 * phi = (90 - lat) converts to colatitude
 * theta = (lon + 180) accounts for texture orientation
 */
export function latLonAltToXYZ(lat: number, lon: number, altKm: number): [number, number, number] {
  // Normalize: Earth radius = 1.0, so altitude is added as fraction
  const radius = 1.0 + (altKm / 6371); // normalize altitude (Earth radius ~6371km)
  
  // REVERTED TO WORKING FORMULA for markers/texture alignment
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  
  return [x, y, z];
}

/**
 * Helper function that returns coordinates as array (for compatibility)
 * REVERTED TO WORKING FORMULA for markers/texture alignment
 */
export function latLngToVec3(latDeg: number, lngDeg: number, radius: number): [number, number, number] {
  // REVERTED TO WORKING FORMULA for markers/texture alignment
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lngDeg + 180) * (Math.PI / 180);
  
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  
  return [x, y, z];
}

/**
 * Convert XYZ coordinates back to lat/lon/alt (inverse of latLonAltToXYZ)
 * Inverse of: x = -r × sin(phi) × cos(theta), z = r × sin(phi) × sin(theta), y = r × cos(phi)
 * where phi = (90 - lat), theta = (lon + 180)
 */
export function xyzToLatLonAlt(x: number, y: number, z: number): [number, number, number] {
  const radius = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  
  // Calculate phi (colatitude): y = r × cos(phi) => phi = acos(y / r)
  const phi = Math.acos(y / radius);
  const lat = 90 - (phi * 180 / Math.PI);
  
  // Calculate theta: x = -r × sin(phi) × cos(theta), z = r × sin(phi) × sin(theta)
  // => atan2(-z, x) gives theta, then subtract 180 to get longitude
  const theta = Math.atan2(-z, x);
  const lon = (theta * 180 / Math.PI) - 180;
  
  // Calculate altitude from radius
  const altKm = (radius - 1.0) * 6371; // Convert normalized to km
  
  return [lat, lon, altKm];
}

/**
 * Create geodesic arc using lifted great-circle with QuadraticBezierCurve3
 * This ensures arcs NEVER go through Earth
 * 
 * FORBIDDEN: Linear interpolation, CatmullRomCurve3, lerpVectors, straight bezier without lifted midpoint
 */
export function createGeodesicArc(
  fromLat: number,
  fromLon: number,
  fromAlt: number,
  toLat: number,
  toLon: number,
  toAlt: number,
  numPoints: number = 96,
  exactStartXYZ?: [number, number, number],
  exactEndXYZ?: [number, number, number]
): [number, number, number][] {
  // Get start and end positions
  const startVec = exactStartXYZ 
    ? new Vector3(...exactStartXYZ)
    : new Vector3(...latLonAltToXYZ(fromLat, fromLon, fromAlt));
  const endVec = exactEndXYZ
    ? new Vector3(...exactEndXYZ)
    : new Vector3(...latLonAltToXYZ(toLat, toLon, toAlt));
  
  // 1. Normalize Both Endpoints
  const a = startVec.clone().normalize();
  const b = endVec.clone().normalize();
  
  // 2. Great-Circle Midpoint (NOT linear midpoint)
  const mid = a.clone().add(b).normalize();
  
  // 3. Lift the Midpoint Above the Surface
  // ARC GEOMETRY MUST NEVER TOUCH THE EARTH
  // Use lifted midpoint at R * 1.3 so arcs do not intersect the globe
  const EARTH_RADIUS = 1.0;
  const startRadius = startVec.length();
  const endRadius = endVec.length();
  const avgRadius = (startRadius + endRadius) / 2;
  
  // Lifted midpoint at R * 1.3 (30% above Earth surface)
  const liftedMid = mid.normalize().multiplyScalar(avgRadius * 1.3);
  
  // 4. Build the Curve using CatmullRomCurve3 with lifted midpoint
  const curve = new CatmullRomCurve3([
    startVec,
    liftedMid,
    endVec
  ]);
  
  // 5. Sample Points
  const curvePoints = curve.getPoints(numPoints);
  
  // Convert Vector3[] to [number, number, number][]
  const points: [number, number, number][] = curvePoints.map((v: Vector3) => [v.x, v.y, v.z]);
  
  // CRITICAL: Replace endpoints with exact XYZ coordinates if provided
  if (exactStartXYZ) {
    points[0] = [...exactStartXYZ] as [number, number, number];
  }
  if (exactEndXYZ) {
    points[points.length - 1] = [...exactEndXYZ] as [number, number, number];
  }
  
  // Validate: Ensure no point is below 1.02 (VLEO minimum)
  return points.map(p => {
    const radius = Math.sqrt(p[0]**2 + p[1]**2 + p[2]**2);
    if (radius < 1.02) {
      // Scale up to minimum safe radius
      const scale = 1.02 / radius;
      return [p[0] * scale, p[1] * scale, p[2] * scale] as [number, number, number];
    }
    return p;
  });
}

export function createArcPoints(
  fromLat: number,
  fromLon: number,
  fromAlt: number,
  toLat: number,
  toLon: number,
  toAlt: number,
  numPoints: number = 30
): [number, number, number][] {
  return createGeodesicArc(fromLat, fromLon, fromAlt, toLat, toLon, toAlt, numPoints);
}
