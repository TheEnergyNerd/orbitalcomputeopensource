"use client";

import { useRef, useEffect } from "react";
import { Mesh } from "three";
import { latLngToVec3 } from "../lib/three/coordinateUtils";

/**
 * Validation markers for coordinate system verification
 * Hardcoded test points: NYC, London, Tokyo, Sydney
 */
const VALIDATION_MARKERS = [
  { name: "NYC", lat: 40.7128, lng: -74.0060, color: "#ff0000" },
  { name: "London", lat: 51.5074, lng: -0.1278, color: "#00ff00" },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, color: "#0000ff" },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, color: "#ffff00" },
];

export function ValidationMarkers() {
  const markersRef = useRef<Map<string, Mesh>>(new Map());

  return (
    <>
      {VALIDATION_MARKERS.map((marker) => {
        // Use FINAL coordinate system with surface radius 1.002
        const [x, y, z] = latLngToVec3(marker.lat, marker.lng, 1.002);
        
        console.log(`[ValidationMarkers] ${marker.name}: lat=${marker.lat.toFixed(2)}°, lng=${marker.lng.toFixed(2)}° -> xyz=[${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}]`);

        return (
          <mesh
            key={marker.name}
            ref={(ref) => {
              if (ref) {
                markersRef.current.set(marker.name, ref);
                // Make marker look at Earth center (0,0,0) - markers are in world space
                ref.lookAt(0, 0, 0);
              }
            }}
            position={[x, y, z]}
            renderOrder={1000}
          >
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshStandardMaterial
              color={marker.color}
              transparent={false}
              opacity={1.0}
              emissive={marker.color}
              emissiveIntensity={10.0}
              depthWrite={true}
              depthTest={true}
            />
          </mesh>
        );
      })}
    </>
  );
}

