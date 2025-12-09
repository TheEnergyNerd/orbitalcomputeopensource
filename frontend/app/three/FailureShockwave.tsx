"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RingGeometry, Mesh } from "three";
import { useSimStore } from "../store/simStore";
import { useOrbitSim } from "../state/orbitStore";

interface Shockwave {
  id: string;
  position: [number, number, number];
  radius: number;
  opacity: number;
  lifetime: number;
  shell: 1 | 2 | 3;
}

export function FailureShockwave() {
  // NOTE: SimState.events is string[], not structured event objects
  // This component is stubbed out until events are restructured
  return null;

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);

  // Animate shockwaves
  useFrame((state, delta) => {
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;
    const toRemove: string[] = [];
    
    shockwavesRef.current.forEach((shockwave, id) => {
      shockwave.lifetime -= effectiveDelta * 1000;
      shockwave.radius += effectiveDelta * 0.5; // Expand
      shockwave.opacity = Math.max(0, shockwave.lifetime / 3000);
      
      if (shockwave.lifetime <= 0) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => shockwavesRef.current.delete(id));
  });

  return (
    <>
      {Array.from(shockwavesRef.current.values()).map((shockwave) => (
        <mesh
          key={shockwave.id}
          position={shockwave.position}
        >
          <ringGeometry args={[shockwave.radius, shockwave.radius + 0.02, 64]} />
          <meshStandardMaterial
            color="#ff0000"
            transparent
            opacity={shockwave.opacity}
            emissive="#ff0000"
            emissiveIntensity={1.5}
            side={2} // DoubleSide
            depthWrite={false}
            depthTest={true}
          />
        </mesh>
      ))}
    </>
  );
}

