"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { ConeGeometry, Mesh, Color } from "three";
import { useSimStore } from "../store/simStore";
import { useOrbitSim } from "../state/orbitStore";

export function FuturesCone() {
  const coneRef = useRef<Mesh>(null);
  const lastFuturesHash = useRef<string>("");

  // Get futures data
  useEffect(() => {
    const unsubscribe = useSimStore.subscribe((state) => {
      const metrics = state.state?.metrics;
      if (!metrics) return;

      const futuresHash = JSON.stringify({
        orbitShare: metrics.orbitSharePercent,
        cost: metrics.costPerComputeMix,
      });

      if (futuresHash === lastFuturesHash.current) return;
      lastFuturesHash.current = futuresHash;

      // Update cone based on futures
      if (coneRef.current) {
        const orbitShare = metrics.orbitSharePercent || 0;
        const cost = metrics.costPerComputeMix || 0;
        
        // Determine color (green = bullish, gray = neutral, red = bearish)
        let color = new Color(0x888888); // Gray = neutral
        if (orbitShare > 50 && cost < 400) {
          color = new Color(0x00ff00); // Green = bullish
        } else if (orbitShare < 30 || cost > 500) {
          color = new Color(0xff0000); // Red = bearish
        }

        const material = coneRef.current.material as any;
        if (material) {
          material.color = color;
          material.emissive = color;
        }

        // Update width based on uncertainty (simplified)
        const uncertainty = Math.abs(orbitShare - 50) / 50; // 0-1
        const width = 0.1 + uncertainty * 0.2;
        coneRef.current.scale.x = width;
        coneRef.current.scale.z = width;
      }
    });

    return () => unsubscribe();
  }, []);

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);
  const simTime = useOrbitSim((s) => s.simTime);

  // Animate cone (breathing effect) - make it MORE visible
  useFrame((state, delta) => {
    if (coneRef.current) {
      // Use simulation time for consistent breathing
      const effectiveTime = simPaused ? simTime : simTime + delta * simSpeed;
      const breath = 1 + Math.sin(effectiveTime * 0.8) * 0.15; // More visible breathing (15% scale change)
      coneRef.current.scale.y = breath;
      // Also breathe width slightly
      const widthBreath = 1 + Math.sin(effectiveTime * 0.6) * 0.1;
      coneRef.current.scale.x = widthBreath;
      coneRef.current.scale.z = widthBreath;
    }
  });

  return (
    <mesh
      ref={coneRef}
      position={[0, 0, 0]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <coneGeometry args={[0.2, 0.8, 64, 1, true]} />
      <meshStandardMaterial
        color={0x888888}
        transparent
        opacity={0.5}
        emissive={0x888888}
        emissiveIntensity={0.4}
        side={2} // DoubleSide
        depthWrite={false}
        depthTest={true}
      />
    </mesh>
  );
}

