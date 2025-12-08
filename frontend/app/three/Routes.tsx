"use client";

import { Line } from "@react-three/drei";
import { useOrbitSim } from "../state/orbitStore";
import { createGeodesicArc } from "../lib/three/coordinateUtils";
import { Vector3 } from "three";

/**
 * Convert xyz back to lat/lon for geodesic calculation
 */
function xyzToLatLon(x: number, y: number, z: number): [number, number, number] {
  const radius = Math.sqrt(x * x + y * y + z * z);
  const lat = Math.asin(z / radius) * 180 / Math.PI;
  const lon = Math.atan2(y, x) * 180 / Math.PI;
  const alt = (radius - 1) * 6371; // Convert back to km
  return [lat, lon, alt];
}

export function Routes() {
  const routes = useOrbitSim((s) => s.routes);

  return (
    <>
      {routes.map((r, i) => {
        // Convert xyz to lat/lon for proper geodesic calculation
        const [fromLat, fromLon, fromAlt] = xyzToLatLon(r.fromVec[0], r.fromVec[1], r.fromVec[2]);
        const [toLat, toLon, toAlt] = xyzToLatLon(r.toVec[0], r.toVec[1], r.toVec[2]);
        
        // Create geodesic arc that goes around the globe
        const points = createGeodesicArc(fromLat, fromLon, fromAlt, toLat, toLon, toAlt, 30);
        
        const color = r.type === 'orbit' ? 'cyan' : r.type === 'core' ? 'purple' : 'orange';
        
        return (
          <Line
            key={r.id || i}
            points={points}
            color={color}
            lineWidth={2}
          />
        );
      })}
    </>
  );
}

