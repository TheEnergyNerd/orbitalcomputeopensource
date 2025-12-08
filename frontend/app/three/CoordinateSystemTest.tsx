"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";
import { latLngToVec3 } from "../lib/three/coordinateUtils";

/**
 * STEP 4 & 5: Single marker test and cardinal axis probe
 * This helps debug coordinate system issues
 */
export function CoordinateSystemTest() {
  const markersRef = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    // Clean up previous markers
    markersRef.current.forEach((marker) => {
      // Markers will be cleaned up by React
    });
    markersRef.current = [];
  }, []);

  // VERIFY WITH KNOWN TEST POINTS (MANDATORY)
  // These exact markers must be perfectly placed
  // Colors: NYC=Red, LA=Green, London=Blue, Tokyo=Yellow, Cape Town=Magenta
  const testCities = [
    { name: "NYC", lat: 40.7128, lon: -74.0060, color: 0xff0000 }, // Red
    { name: "Los Angeles", lat: 34.0522, lon: -118.2437, color: 0x00ff00 }, // Green
    { name: "London", lat: 51.5072, lon: -0.1276, color: 0x0000ff }, // Blue
    { name: "Tokyo", lat: 35.6895, lon: 139.6917, color: 0xffff00 }, // Yellow
    { name: "Cape Town", lat: -33.9249, lon: 18.4241, color: 0xff00ff }, // Magenta
  ];

  return (
    <>
      {/* VERIFICATION MARKERS - These must be perfectly placed */}
      {testCities.map((city, idx) => {
        const globeRadius = 1.0;
        const markerOffset = 0.01; // Small offset above surface
        const pos = latLngToVec3(city.lat, city.lon, globeRadius + markerOffset);
        console.log(`[CoordinateSystemTest] ${city.name} (${city.lat}°, ${city.lon}°):`, pos);
        return (
          <mesh 
            key={idx} 
            position={pos}
            ref={(ref) => {
              if (ref) {
                // MARKER PLACEMENT RULE: marker.lookAt(globeCenter)
                const globeCenter = new THREE.Vector3(0, 0, 0);
                ref.lookAt(globeCenter);
              }
            }}
          >
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshBasicMaterial color={city.color} />
          </mesh>
        );
      })}
    </>
  );
}

