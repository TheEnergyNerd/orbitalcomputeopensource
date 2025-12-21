"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim } from "../state/orbitStore";

interface RoutingArrow {
  id: string;
  from: Vector3;
  to: Vector3;
  color: string;
  opacity: number;
  lifetime: number;
}

export function RoutingArrows() {
  const arrowsRef = useRef<Map<string, RoutingArrow>>(new Map());
  const lastPolicyHash = useRef<string>("");
  const spawnQueueRef = useRef<Array<{ id: string; x: number; y: number; z: number }>>([]);
  const spawnStartTimeRef = useRef<number>(performance.now());
  const spawnDurationRef = useRef<number>(500); // Match SatellitesOptimized
  const showComputeRoutes = useOrbitSim((s) => s.showComputeRoutes);

  // Get visible satellites using same streaming spawn logic as SatellitesOptimized
  const getVisibleSatellites = () => {
    const allSatellites = useOrbitSim.getState().satellites;
    
    if (allSatellites.length === 0) {
      // Reset queue if no satellites
      if (spawnQueueRef.current.length > 0) {
        spawnQueueRef.current = [];
      }
      return [];
    }

    // Initialize queue if empty
    if (!spawnQueueRef.current || spawnQueueRef.current.length === 0) {
      spawnQueueRef.current = [...allSatellites];
      spawnStartTimeRef.current = performance.now();
    }

    // Check if satellites array changed (new deployment)
    const currentSatIds = allSatellites.map(s => s.id).join(",");
    const queueSatIds = (spawnQueueRef.current || []).map(s => s.id).join(",");
    
    if (currentSatIds !== queueSatIds) {
      // New satellites detected
      const existingIds = new Set((spawnQueueRef.current || []).map(s => s.id));
      const newSats = allSatellites.filter(s => !existingIds.has(s.id));
      
      if (newSats.length > 0) {
        // Add new satellites to queue without resetting spawn progress
        spawnQueueRef.current = [...(spawnQueueRef.current || []), ...newSats];
      } else {
        // Satellites were removed or reordered, reset queue
        spawnQueueRef.current = [...allSatellites];
        spawnStartTimeRef.current = performance.now();
      }
    }
    
    // If no satellites, return empty array
    if (!spawnQueueRef.current || spawnQueueRef.current.length === 0) {
      return [];
    }
    
    const elapsed = performance.now() - spawnStartTimeRef.current;
    const spawnProgress = Math.min(1, elapsed / spawnDurationRef.current);
    
    // After spawn duration, show ALL satellites
    // Before that, gradually reveal them
    const targetCount = spawnProgress >= 1 
      ? spawnQueueRef.current.length
      : Math.max(1, Math.floor(spawnQueueRef.current.length * spawnProgress));
    
    return spawnQueueRef.current.slice(0, targetCount);
  };

  // Detect policy changes
  useEffect(() => {
    let lastOrbitProb = 0;
    
    const unsubscribe = useSimulationStore.subscribe((state) => {
      const policy = state.config.routerPolicy;
      const policyHash = policy ? JSON.stringify(policy) : "";
      
      // Only proceed if policy actually changed
      if (policyHash === lastPolicyHash.current) return;
      
      // Extract orbit probability from new policy
      const currentOrbitProb = policy?.jobs?.realtime?.orbit || 0;
      const orbitChange = Math.abs(currentOrbitProb - lastOrbitProb);
      
      // Only show arrows if orbit share changed significantly (>5% - lowered threshold)
      if (orbitChange < 0.05 && lastPolicyHash.current !== "") {
      // Silent
        lastPolicyHash.current = policyHash;
        lastOrbitProb = currentOrbitProb;
        return;
      }
      
      // Silent - too verbose
      lastPolicyHash.current = policyHash;
      lastOrbitProb = currentOrbitProb;

      // Clear old arrows
      arrowsRef.current.clear();

      if (!policy) {
        // Silent
        return;
      }

      // CRITICAL: Only use visible satellites (those that have spawned)
      const visibleSatellites = getVisibleSatellites();
      // Silent - too verbose
      
      if (visibleSatellites.length === 0) {
        // Silent
        return;
      }

      // Create arrows only for significant policy changes - fewer arrows, more meaningful
      const orbitProb = policy.jobs?.realtime?.orbit || 0;
      const numArrows = Math.min(3, Math.max(1, Math.floor(visibleSatellites.length / 20))); // Much fewer arrows
      // Silent - too verbose
      
      let arrowCount = 0;
      let attempts = 0;
      while (arrowCount < numArrows && attempts < numArrows * 20) {
        attempts++;
        const from = visibleSatellites[Math.floor(Math.random() * visibleSatellites.length)];
        const to = visibleSatellites[Math.floor(Math.random() * visibleSatellites.length)];
        
        if (from.id === to.id) continue;
        
        // Only create arrows between satellites that are close (same orbital shell)
        const fromPos = new Vector3(from.x, from.y, from.z);
        const toPos = new Vector3(to.x, to.y, to.z);
        const distance = fromPos.distanceTo(toPos);
        
        // Only show arrows for nearby satellites (within 0.5 units)
        if (distance > 0.5) continue;

        // Determine color based on orbit share
        const color = orbitProb > 0.5 ? "#00ffff" : "#ff00ff"; // Cyan = high orbit share, Purple = low orbit share

        arrowsRef.current.set(`arrow_${arrowCount}`, {
          id: `arrow_${arrowCount}`,
          from: fromPos,
          to: toPos,
          color: color,
          opacity: 1.0,
          lifetime: 2000, // 2 seconds - brief appearance
        });
        arrowCount++;
      }
      
      // Silent - too verbose
    });

    return () => unsubscribe();
  }, []);

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);

  // Animate arrows (fade out)
  const frameCount = useRef(0);
  useFrame((state, delta) => {
    frameCount.current++;
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;
    const toRemove: string[] = [];
    
    // Log only occasionally
    
    arrowsRef.current.forEach((arrow, id) => {
      arrow.lifetime -= effectiveDelta * 1000;
      arrow.opacity = Math.max(0, arrow.lifetime / 5000); // Match 5 second lifetime
      
      if (arrow.lifetime <= 0) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => arrowsRef.current.delete(id));
  });

  if (!showComputeRoutes) {
    return null;
  }

  return (
    <>
      {Array.from(arrowsRef.current.values()).map((arrow) => {
        // Only render if opacity > 0
        if (arrow.opacity <= 0) return null;
        
        const direction = arrow.to.clone().sub(arrow.from).normalize();
        const length = arrow.from.distanceTo(arrow.to) * 0.3; // Shorter arrow
        const endPos = arrow.from.clone().add(direction.clone().multiplyScalar(length));

        return (
          <group key={arrow.id}>
            {/* Much smaller arrowhead - barely visible */}
            <mesh position={endPos} scale={[0.3, 0.3, 0.3]}>
              <coneGeometry args={[0.01, 0.03, 6]} />
              <meshStandardMaterial
                color={arrow.color}
                transparent
                opacity={arrow.opacity * 0.5} // More transparent
                emissive={arrow.color}
                emissiveIntensity={1.0}
                depthWrite={false}
                depthTest={true}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

