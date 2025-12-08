"use client";

import { InstancedMesh, Object3D, Vector3, CircleGeometry, BufferGeometry, BufferAttribute, Points, PointsMaterial } from "three";
import { useRef, useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useOrbitSim } from "../state/orbitStore";
import { 
  updateOrbitalTheta, 
  calculateOrbitalPosition,
  type OrbitalState 
} from "../lib/orbitSim/orbitalMechanics";
import { getShellFromAltitude } from "../lib/orbitSim/satellitePositioning";

// Performance thresholds
const PERFORMANCE_LIMITS = {
  INSTANCED_SPHERES: 10000,  // Up to 10k: instanced spheres
  INSTANCED_POINTS: 50000,   // 10k-50k: instanced points + impostors
  GPU_POINT_SPRITES: 150000, // 50k-150k: GPU point sprites only
  // Above 150k: Must fall back to representative mode
};

// Render mode based on satellite count
type RenderMode = "spheres" | "points" | "sprites" | "representative";

interface PerformanceMonitor {
  fps: number;
  lowFpsCount: number;
  lastFrameTime: number;
  frameCount: number;
}

export function SatellitesOptimized() {
  const satellites = useOrbitSim((s) => s.satellites);
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);
  const { camera, gl } = useThree();
  
  // Performance monitoring
  const perfMonitor = useRef<PerformanceMonitor>({
    fps: 60,
    lowFpsCount: 0,
    lastFrameTime: performance.now(),
    frameCount: 0,
  });
  
  // Render mode state
  const [renderMode, setRenderMode] = useState<RenderMode>("spheres");
  const [representativeMode, setRepresentativeMode] = useState(false);
  
  // Separate instanced meshes per shell (for fallback)
  const leoRef = useRef<InstancedMesh>(null!);
  const meoRef = useRef<InstancedMesh>(null!);
  const geoRef = useRef<InstancedMesh>(null!);
  
  // Separate instanced meshes for Class A and Class B
  const classARef = useRef<InstancedMesh>(null!);
  const classBRef = useRef<InstancedMesh>(null!);
  
  // Orbital states
  const orbitalStatesRef = useRef<Map<string, OrbitalState>>(new Map());
  const shellTransitionRef = useRef<Map<string, { startTime: number; startAlt: number; targetAlt: number }>>(new Map());
  
  // Streaming spawn state
  const spawnQueueRef = useRef<typeof satellites>([]);
  const spawnStartTimeRef = useRef<number>(performance.now()); // Initialize to current time
  const spawnDurationRef = useRef<number>(500); // 0.5 seconds - much faster
  
  // Frame counter for debug logging
  const frameCountRef = useRef(0);
  
  // Frame counter for debug logging
  const frameCount = useRef(0);
  
  // Determine render mode based on satellite count
  const determineRenderMode = (count: number): RenderMode => {
    if (representativeMode) return "representative";
    if (count <= PERFORMANCE_LIMITS.INSTANCED_SPHERES) return "spheres";
    if (count <= PERFORMANCE_LIMITS.INSTANCED_POINTS) return "points";
    if (count <= PERFORMANCE_LIMITS.GPU_POINT_SPRITES) return "sprites";
    return "representative";
  };
  
  // Apply streaming spawn rate - MUST be defined before satellitesByShell
  const visibleSatellites = useMemo(() => {
    const totalCount = satellites.length;
    const mode = determineRenderMode(totalCount);
    
    if (mode === "representative") {
      // Render only 5% in representative mode
      const targetCount = Math.max(1, Math.floor(totalCount * 0.05));
      const step = totalCount / targetCount;
      const sampled: typeof satellites = [];
      for (let i = 0; i < totalCount; i += step) {
        const index = Math.floor(i);
        if (index < totalCount) sampled.push(satellites[index]);
      }
      return sampled;
    }
    
    // Apply streaming spawn rate - gradually reveal satellites over 2 seconds
    // Check if satellites array changed (new deployment)
    const currentSatIds = satellites.map(s => s.id).join(",");
    const queueSatIds = spawnQueueRef.current.map(s => s.id).join(",");
    
    if (currentSatIds !== queueSatIds) {
      // New satellites detected
      const existingIds = new Set(spawnQueueRef.current.map(s => s.id));
      const newSats = satellites.filter(s => !existingIds.has(s.id));
      
      if (newSats.length > 0) {
        // Add new satellites to queue without resetting spawn progress
        spawnQueueRef.current = [...spawnQueueRef.current, ...newSats];
        console.log(`[SatellitesOptimized] Added ${newSats.length} new satellites (total: ${spawnQueueRef.current.length}), continuing spawn`);
      } else {
        // Satellites were removed or reordered, reset queue
        spawnQueueRef.current = [...satellites];
        spawnStartTimeRef.current = performance.now();
        console.log(`[SatellitesOptimized] Satellites changed, resetting spawn queue: ${satellites.length} total`);
      }
    }
    
    // If no satellites, return empty array
    if (spawnQueueRef.current.length === 0) {
      return [];
    }
    
    const elapsed = performance.now() - spawnStartTimeRef.current;
    const spawnProgress = Math.min(1, elapsed / spawnDurationRef.current);
    
    // CRITICAL: After 2 seconds, show ALL satellites
    // Before 2 seconds, gradually reveal them
    const targetCount = spawnProgress >= 1 
      ? spawnQueueRef.current.length  // After 2 seconds, show all
      : Math.max(1, Math.floor(spawnQueueRef.current.length * spawnProgress));
    
    const visible = spawnQueueRef.current.slice(0, targetCount);
    
    // Log progress occasionally
    if (targetCount % 50 === 0 || targetCount === spawnQueueRef.current.length || (targetCount < 10 && targetCount % 1 === 0)) {
      console.log(`[SatellitesOptimized] Streaming spawn: ${targetCount}/${spawnQueueRef.current.length} visible (${(spawnProgress * 100).toFixed(1)}%)`);
    }
    
    return visible;
  }, [satellites, representativeMode]);
  
  // Group satellites by shell AND class (use visible satellites for rendering)
  const satellitesByShell = useMemo(() => {
    const leo: typeof satellites = [];
    const meo: typeof satellites = [];
    const geo: typeof satellites = [];
    const classA: typeof satellites = [];
    const classB: typeof satellites = [];
    
    visibleSatellites.forEach(sat => {
      // Determine altitude from orbitalState or calculate from position
      let alt: number;
      if (sat.orbitalState?.altitudeRadius) {
        alt = sat.orbitalState.altitudeRadius;
      } else {
        // Calculate altitude from x, y, z position
        const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
        alt = (radius - 1) * 6371; // Convert normalized radius to km
      }
      
      const shell = getShellFromAltitude(alt);
      if (shell === "LEO") leo.push(sat);
      else if (shell === "MEO") meo.push(sat);
      else if (shell === "GEO") geo.push(sat);
      else leo.push(sat); // Default to LEO
      
      // Group by class
      const satClass = sat.satelliteClass || "A";
      if (satClass === "A") classA.push(sat);
      else if (satClass === "B") classB.push(sat);
    });
    
    return { leo, meo, geo, classA, classB };
  }, [visibleSatellites]);
  
  // Update render mode when satellite count changes
  useEffect(() => {
    const newMode = determineRenderMode(satellites.length);
    if (newMode !== renderMode) {
      setRenderMode(newMode);
      if (newMode === "representative") {
        setRepresentativeMode(true);
        console.warn(`[SatellitesOptimized] ⚠️ Performance mode: Rendering 5% representative (${satellites.length} total)`);
      }
    }
  }, [satellites.length, renderMode]);
  
  // Performance monitoring
  useFrame((state, delta) => {
    perfMonitor.current.frameCount++;
    const now = performance.now();
    const elapsed = now - perfMonitor.current.lastFrameTime;
    
    if (elapsed >= 1000) {
      // Calculate FPS every second
      perfMonitor.current.fps = (perfMonitor.current.frameCount * 1000) / elapsed;
      perfMonitor.current.frameCount = 0;
      perfMonitor.current.lastFrameTime = now;
      
      // Performance kill-switch: if FPS < 30 for 3 consecutive seconds
      if (perfMonitor.current.fps < 30) {
        perfMonitor.current.lowFpsCount++;
        if (perfMonitor.current.lowFpsCount >= 3 && !representativeMode) {
          setRepresentativeMode(true);
          console.warn(`[SatellitesOptimized] 🚨 Performance kill-switch activated: FPS ${perfMonitor.current.fps.toFixed(1)} < 30`);
        }
      } else {
        perfMonitor.current.lowFpsCount = 0;
      }
    }
  });
  
  // Initialize orbital states
  useEffect(() => {
    visibleSatellites.forEach((sat) => {
      if (!orbitalStatesRef.current.has(sat.id)) {
        if (sat.orbitalState) {
          orbitalStatesRef.current.set(sat.id, sat.orbitalState);
        } else {
          const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
          const altitudeKm = (radius - 1) * 6371;
          orbitalStatesRef.current.set(sat.id, {
            altitudeRadius: altitudeKm,
            inclination: 53 * Math.PI / 180,
            theta: Math.random() * 2 * Math.PI,
            orbitalPeriod: 2 * Math.PI * Math.sqrt(Math.pow((6371 + altitudeKm) * 1000, 3) / 3.986004418e14),
            launchTime: Date.now(),
          });
        }
      }
    });
  }, [visibleSatellites]);
  
  // Update instance counts per class
  useEffect(() => {
    if (classARef.current) {
      classARef.current.count = satellitesByShell.classA.length;
    }
    if (classBRef.current) {
      classBRef.current.count = satellitesByShell.classB.length;
    }
    // Fallback for shell-based (non-classified satellites)
    if (leoRef.current) {
      leoRef.current.count = satellitesByShell.leo.length;
    }
    if (meoRef.current) {
      meoRef.current.count = satellitesByShell.meo.length;
    }
    if (geoRef.current) {
      geoRef.current.count = satellitesByShell.geo.length;
    }
    console.log(`[SatellitesOptimized] Class A: ${satellitesByShell.classA.length}, Class B: ${satellitesByShell.classB.length}`);
  }, [satellitesByShell]);
  
  // Single useFrame loop for all satellites
  useFrame((state, delta) => {
    frameCountRef.current++;
    // CRITICAL: Always update positions, even if paused (for initial render)
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;
    const dummy = new Object3D();
    
    // Update Class A satellites (Starlink-compute)
    if (classARef.current && satellitesByShell.classA.length > 0) {
      satellitesByShell.classA.forEach((sat, i) => {
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          dummy.position.set(sat.x, sat.y, sat.z);
        } else {
          const orbitalState = orbitalStatesRef.current.get(sat.id);
          if (orbitalState) {
            if (!simPaused) {
              orbitalState.theta = updateOrbitalTheta(
                orbitalState.theta,
                orbitalState.orbitalPeriod,
                effectiveDelta
              );
            }
            const [x, y, z] = calculateOrbitalPosition(
              orbitalState.altitudeRadius,
              orbitalState.inclination,
              orbitalState.theta
            );
            dummy.position.set(x, y, z);
          } else {
            dummy.position.set(sat.x || 0, sat.y || 0, sat.z || 0);
          }
        }
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        classARef.current.setMatrixAt(i, dummy.matrix);
      });
      classARef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Update Class B satellites (Casey SSO slicer)
    if (classBRef.current && satellitesByShell.classB.length > 0) {
      satellitesByShell.classB.forEach((sat, i) => {
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          dummy.position.set(sat.x, sat.y, sat.z);
        } else {
          const orbitalState = orbitalStatesRef.current.get(sat.id);
          if (orbitalState) {
            if (!simPaused) {
              orbitalState.theta = updateOrbitalTheta(
                orbitalState.theta,
                orbitalState.orbitalPeriod,
                effectiveDelta
              );
            }
            const [x, y, z] = calculateOrbitalPosition(
              orbitalState.altitudeRadius,
              orbitalState.inclination,
              orbitalState.theta
            );
            dummy.position.set(x, y, z);
          } else {
            dummy.position.set(sat.x || 0, sat.y || 0, sat.z || 0);
          }
        }
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        classBRef.current.setMatrixAt(i, dummy.matrix);
      });
      classBRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Update LEO satellites (fallback for non-classified)
    if (leoRef.current && satellitesByShell.leo.length > 0) {
      satellitesByShell.leo.forEach((sat, i) => {
        // CRITICAL: Always use explicit x, y, z coordinates if available
        // Don't recalculate from orbital state if we have explicit coords
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          dummy.position.set(sat.x, sat.y, sat.z);
        } else {
          const orbitalState = orbitalStatesRef.current.get(sat.id);
          if (orbitalState) {
            if (!simPaused) {
              orbitalState.theta = updateOrbitalTheta(
                orbitalState.theta,
                orbitalState.orbitalPeriod,
                effectiveDelta
              );
            }
            const [x, y, z] = calculateOrbitalPosition(
              orbitalState.altitudeRadius,
              orbitalState.inclination,
              orbitalState.theta
            );
            dummy.position.set(x, y, z);
          } else {
            dummy.position.set(sat.x || 0, sat.y || 0, sat.z || 0);
          }
        }
        
        // Debug: Log first satellite position (removed frameCount check to reduce noise)
        
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        leoRef.current.setMatrixAt(i, dummy.matrix);
      });
      leoRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Update MEO satellites
    if (meoRef.current && satellitesByShell.meo.length > 0) {
      satellitesByShell.meo.forEach((sat, i) => {
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          dummy.position.set(sat.x, sat.y, sat.z);
        } else {
          const orbitalState = orbitalStatesRef.current.get(sat.id);
          if (orbitalState) {
            if (!simPaused) {
              orbitalState.theta = updateOrbitalTheta(
                orbitalState.theta,
                orbitalState.orbitalPeriod,
                effectiveDelta
              );
            }
            const [x, y, z] = calculateOrbitalPosition(
              orbitalState.altitudeRadius,
              orbitalState.inclination,
              orbitalState.theta
            );
            dummy.position.set(x, y, z);
          } else {
            dummy.position.set(sat.x || 0, sat.y || 0, sat.z || 0);
          }
        }
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        meoRef.current.setMatrixAt(i, dummy.matrix);
      });
      meoRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Update GEO satellites
    if (geoRef.current && satellitesByShell.geo.length > 0) {
      satellitesByShell.geo.forEach((sat, i) => {
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          dummy.position.set(sat.x, sat.y, sat.z);
        } else {
          const orbitalState = orbitalStatesRef.current.get(sat.id);
          if (orbitalState) {
            if (!simPaused) {
              orbitalState.theta = updateOrbitalTheta(
                orbitalState.theta,
                orbitalState.orbitalPeriod,
                effectiveDelta
              );
            }
            const [x, y, z] = calculateOrbitalPosition(
              orbitalState.altitudeRadius,
              orbitalState.inclination,
              orbitalState.theta
            );
            dummy.position.set(x, y, z);
          } else {
            dummy.position.set(sat.x || 0, sat.y || 0, sat.z || 0);
          }
        }
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        geoRef.current.setMatrixAt(i, dummy.matrix);
      });
      geoRef.current.instanceMatrix.needsUpdate = true;
    }
  });
  
  // Determine geometry based on render mode
  const getGeometry = (mode: RenderMode) => {
    switch (mode) {
      case "spheres":
        return <sphereGeometry args={[0.05, 12, 12]} />; // Larger - 0.05 radius for visibility
      case "points":
        return <circleGeometry args={[0.05, 12]} />; // Screen-facing impostors
      case "sprites":
        return <circleGeometry args={[0.04, 8]} />; // Even smaller for sprites
      case "representative":
        return <sphereGeometry args={[0.05, 12, 12]} />; // Larger
    }
  };
  
  // Debug: Log satellite counts
  useEffect(() => {
    console.log(`[SatellitesOptimized] Total satellites: ${satellites.length}, Visible: ${visibleSatellites.length}, By shell: LEO=${satellitesByShell.leo.length}, MEO=${satellitesByShell.meo.length}, GEO=${satellitesByShell.geo.length}`);
  }, [satellites.length, visibleSatellites.length, satellitesByShell]);
  
  if (satellites.length === 0) {
    console.log("[SatellitesOptimized] No satellites in store");
    return null;
  }
  
  if (visibleSatellites.length === 0) {
    console.log("[SatellitesOptimized] No visible satellites (streaming spawn in progress)");
    return null;
  }
  
  return (
    <>
      {/* Class A Satellites (Starlink-compute) - Teal circles with subtle halo */}
      {satellitesByShell.classA.length > 0 && (
        <instancedMesh
          ref={classARef}
          args={[undefined, undefined, satellitesByShell.classA.length]}
          frustumCulled={true}
        >
          {getGeometry(renderMode)}
          <meshStandardMaterial
            color="#00d4aa" // Teal
            emissive="#00d4aa"
            emissiveIntensity={2.0} // Subtle halo
            depthWrite={true}
            depthTest={true}
          />
        </instancedMesh>
      )}
      
      {/* Class B Satellites (Casey SSO slicer) - Bright white/neon blue pills with strong glow */}
      {satellitesByShell.classB.length > 0 && (
        <instancedMesh
          ref={classBRef}
          args={[undefined, undefined, satellitesByShell.classB.length]}
          frustumCulled={true}
        >
          {/* Slightly larger pill/diamond shape for Class B */}
          <boxGeometry args={[0.06, 0.03, 0.06]} />
          <meshStandardMaterial
            color="#00ffff" // Neon cyan/blue
            emissive="#00ffff"
            emissiveIntensity={8.0} // Strong one-sided glow
            depthWrite={true}
            depthTest={true}
          />
        </instancedMesh>
      )}
      
      {/* Fallback: Shell-based rendering for non-classified satellites */}
      {satellitesByShell.leo.length > 0 && satellitesByShell.classA.length === 0 && satellitesByShell.classB.length === 0 && (
        <instancedMesh
          ref={leoRef}
          args={[undefined, undefined, satellitesByShell.leo.length]}
          frustumCulled={true}
        >
          {getGeometry(renderMode)}
          <meshStandardMaterial
            color="#ff0000"
            emissive="#ff0000"
            emissiveIntensity={5.0}
            depthWrite={true}
            depthTest={true}
          />
        </instancedMesh>
      )}
      
      {satellitesByShell.meo.length > 0 && (
        <instancedMesh
          ref={meoRef}
          args={[undefined, undefined, satellitesByShell.meo.length]}
          frustumCulled={true}
        >
          {getGeometry(renderMode)}
          <meshStandardMaterial
            color="#00ff00"
            emissive="#00ff00"
            emissiveIntensity={2.0}
            depthWrite={true}
            depthTest={true}
          />
        </instancedMesh>
      )}
      
      {satellitesByShell.geo.length > 0 && (
        <instancedMesh
          ref={geoRef}
          args={[undefined, undefined, satellitesByShell.geo.length]}
          frustumCulled={true}
        >
          {getGeometry(renderMode)}
          <meshStandardMaterial
            color="#ff00ff"
            emissive="#ff00ff"
            emissiveIntensity={2.0}
            depthWrite={true}
            depthTest={true}
          />
        </instancedMesh>
      )}
      
      {/* Performance warning overlay */}
      {representativeMode && (
        <mesh position={[0, 0, 0]}>
          {/* This will be handled by UI overlay, not 3D mesh */}
        </mesh>
      )}
    </>
  );
}

