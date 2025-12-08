"use client";

import { useRef } from "react";
import { Mesh, Vector3 } from "three";
import { latLngToVec3 } from "../lib/three/coordinateUtils";

/**
 * Pole markers for coordinate system verification
 * Green = North Pole (90°N)
 * Blue = South Pole (-90°S)
 */
export function PoleMarkers() {
  const northPoleRef = useRef<Mesh>(null);
  const southPoleRef = useRef<Mesh>(null);

  // North Pole: 90°N, 0°E (any longitude works for poles)
  const northPoleLat = 90;
  const northPoleLon = 0;
  const [northX, northY, northZ] = latLngToVec3(northPoleLat, northPoleLon, 1.01);

  // South Pole: -90°S, 0°E
  const southPoleLat = -90;
  const southPoleLon = 0;
  const [southX, southY, southZ] = latLngToVec3(southPoleLat, southPoleLon, 1.01);

  return (
    <>
      {/* North Pole - Green */}
      <mesh
        ref={northPoleRef}
        position={[northX, northY, northZ]}
        renderOrder={1000}
        onUpdate={(self) => {
          if (self) {
            const globeCenter = new Vector3(0, 0, 0);
            self.lookAt(globeCenter);
          }
        }}
      >
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial
          color="#00ff00"
          transparent={false}
          opacity={1.0}
          emissive="#00ff00"
          emissiveIntensity={10.0}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>

      {/* South Pole - Blue */}
      <mesh
        ref={southPoleRef}
        position={[southX, southY, southZ]}
        renderOrder={1000}
        onUpdate={(self) => {
          if (self) {
            const globeCenter = new Vector3(0, 0, 0);
            self.lookAt(globeCenter);
          }
        }}
      >
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial
          color="#0000ff"
          transparent={false}
          opacity={1.0}
          emissive="#0000ff"
          emissiveIntensity={10.0}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>
    </>
  );
}

