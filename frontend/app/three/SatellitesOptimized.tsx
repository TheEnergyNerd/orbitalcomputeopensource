"use client";

import { InstancedMesh, Object3D, Vector3, CircleGeometry, BufferGeometry, BufferAttribute, Points, PointsMaterial, OctahedronGeometry, Quaternion } from "three";
import { useRef, useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useOrbitSim } from "../state/orbitStore";
import { 
  updateOrbitalTheta, 
  calculateOrbitalPosition,
  type OrbitalState 
} from "../lib/orbitSim/orbitalMechanics";
import { getShellFromAltitude } from "../lib/orbitSim/satellitePositioning";

// Performance thresholds - Aggressively trigger representative mode (5%) for better performance
// System struggles with even 2k satellites, so we trigger much earlier
const PERFORMANCE_LIMITS = {
  INSTANCED_SPHERES: 500,    // Up to 500: instanced spheres
  INSTANCED_POINTS: 1000,    // 500-1k: instanced points + impostors
  GPU_POINT_SPRITES: 2000,   // 1k-2k: GPU point sprites only
  // Above 2k: Must fall back to representative mode (5%)
};

// Render mode based on satellite count
type RenderMode = "spheres" | "points" | "sprites" | "representative";

interface PerformanceMonitor {
  fps: number;
  lowFpsCount: number;
  highFpsCount: number; // Count of consecutive good FPS frames
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
    highFpsCount: 0,
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
      // Render only 5% in representative mode for better performance at high counts
      const representativePercentage = 0.05; // 5% for better performance while maintaining visual density
      const targetCount = Math.max(1, Math.floor(totalCount * representativePercentage));
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
        const oldCount = spawnQueueRef.current.length;
        spawnQueueRef.current = [...spawnQueueRef.current, ...newSats];
        // Only log if count actually increased
        if (spawnQueueRef.current.length > oldCount) {
          // Silent - too verbose
        }
      } else {
        // Satellites were removed or reordered, reset queue
        spawnQueueRef.current = [...satellites];
        spawnStartTimeRef.current = performance.now();
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
    
    // Silent - too verbose
    
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
      
      // Group by class - check satelliteClass property
      const satClass = sat.satelliteClass || "A";
      if (satClass === "A") {
        classA.push(sat);
      } else if (satClass === "B") {
        classB.push(sat);
        // Debug: Log Class B detection for first few
        if (visibleSatellites.indexOf(sat) < 5) {
          // Silent - too verbose
        }
      } else {
        // Default to Class A if unknown
        classA.push(sat);
      }
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
      // Silent
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
      
      // Aggressive performance monitoring - trigger representative mode early
      // Threshold: 25 FPS (higher threshold for faster activation)
      if (perfMonitor.current.fps < 25) {
        perfMonitor.current.lowFpsCount++;
        perfMonitor.current.highFpsCount = 0; // Reset recovery counter
        if (perfMonitor.current.lowFpsCount >= 2 && !representativeMode) {
          // Require only 2 consecutive seconds (very fast activation)
          setRepresentativeMode(true);
          console.warn(`[SatellitesOptimized] 🚨 Performance kill-switch activated: FPS ${perfMonitor.current.fps.toFixed(1)} < 25`);
        }
      } else {
        perfMonitor.current.lowFpsCount = 0;
        // Auto-disable representative mode if FPS recovers (require sustained recovery - 10 seconds)
        if (representativeMode && perfMonitor.current.fps >= 50) {
          perfMonitor.current.highFpsCount++;
          // Only disable if FPS is consistently good for 10 seconds (slower recovery to prevent flickering)
          if (perfMonitor.current.highFpsCount >= 10) {
            console.log(`[SatellitesOptimized] ✅ Performance recovered: FPS ${perfMonitor.current.fps.toFixed(1)} >= 50, disabling representative mode`);
            setRepresentativeMode(false);
            perfMonitor.current.highFpsCount = 0; // Reset after disabling
          }
        } else {
          perfMonitor.current.highFpsCount = 0; // Reset if FPS drops
        }
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
    // Silent - too verbose
  }, [satellitesByShell]);
  
  // Single useFrame loop for all satellites
  // Performance: Only update every other frame to reduce CPU load
  useFrame((state, delta) => {
    frameCountRef.current++;
    
    // Skip every other frame for better performance (update at 30 FPS instead of 60)
    if (frameCountRef.current % 2 !== 0 && satellites.length > 500) {
      return;
    }
    
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
        // Ensure uniform scale to prevent distortion when zooming
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0); // Ensure no rotation that could cause distortion
        dummy.updateMatrix();
        classARef.current.setMatrixAt(i, dummy.matrix);
      });
      classARef.current.instanceMatrix.needsUpdate = true;
    }
    
    // Update Class B satellites (Casey SSO slicer) - MUST face sun (100% of Class-B faces Sun)
    // Also apply breathing glow based on sun alignment
    if (classBRef.current && satellitesByShell.classB.length > 0) {
      const time = Date.now() / 1000; // Current time in seconds
      const breathingPhase = (time * 0.5) % (Math.PI * 2); // 2 second breathing cycle
      // Calculate sun direction: sun is at fixed position relative to Earth
      // For SSO orbits, sun-facing means the satellite's normal points toward the sun
      // Use actual sun position (simplified: sun is in +X direction in Earth-centered coordinates)
      // Sun is ~150M km away, normalized to Earth radius (6371 km)
      const sunDistanceNormalized = 150000000 / 6371; // ~23,500 Earth radii
      // Sun position in Earth-centered coordinates (simplified: fixed in +X direction)
      const sunPosition = new Vector3(sunDistanceNormalized, 0, 0);
      
      satellitesByShell.classB.forEach((sat, i) => {
        let position = new Vector3();
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          position.set(sat.x, sat.y, sat.z);
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
            position.set(x, y, z);
          } else {
            position.set(sat.x || 0, sat.y || 0, sat.z || 0);
          }
        }
        
        // CRITICAL: Class-B MUST face the sun (0% rotate toward Earth)
        // Calculate direction from satellite position to sun position
        const satToSun = sunPosition.clone().sub(position).normalize();
        
        // For a diamond/blade shape, we want the face to be perpendicular to the sun direction
        // The diamond's "front" face should face the sun
        // Use lookAt to orient the satellite's -Z axis (front) toward the sun
        const forward = new Vector3(0, 0, -1); // Diamond's front face
        const target = satToSun.clone();
        const quaternion = new Quaternion();
        quaternion.setFromUnitVectors(forward, target);
        
        dummy.position.copy(position);
        dummy.quaternion.copy(quaternion);
        // Ensure uniform scale to prevent distortion when zooming
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
        // Ensure uniform scale and no rotation to prevent distortion
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
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
        // Ensure uniform scale and no rotation to prevent distortion
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        geoRef.current.setMatrixAt(i, dummy.matrix);
      });
      geoRef.current.instanceMatrix.needsUpdate = true;
    }
  });
  
  // Create Class B geometry instance once - memoized to prevent recreation
  const classBGeometryRef = useRef<OctahedronGeometry | null>(null);
  useEffect(() => {
    if (!classBGeometryRef.current) {
      classBGeometryRef.current = new OctahedronGeometry(0.06, 0);
      // Silent
    }
  }, []);
  
  // Determine geometry based on render mode
  const getGeometry = (mode: RenderMode) => {
    switch (mode) {
      case "spheres":
        return <sphereGeometry args={[0.03, 12, 12]} />; // Smaller - 0.03 radius
      case "points":
        return <circleGeometry args={[0.03, 12]} />; // Screen-facing impostors
      case "sprites":
        return <circleGeometry args={[0.025, 8]} />; // Even smaller for sprites
      case "representative":
        return <sphereGeometry args={[0.03, 12, 12]} />; // Smaller
    }
  };
  
  // Class A geometry - half the size of default, higher quality for zoom
  const getClassAGeometry = (mode: RenderMode) => {
    switch (mode) {
      case "spheres":
        return <sphereGeometry args={[0.015, 16, 16]} />; // Increased segments for better quality when zoomed
      case "points":
        return <circleGeometry args={[0.015, 16]} />; // Increased segments
      case "sprites":
        return <circleGeometry args={[0.0125, 12]} />; // Increased segments
      case "representative":
        return <sphereGeometry args={[0.015, 16, 16]} />; // Increased segments
    }
  };
  
  // Silent - too verbose, only log on significant changes
  const lastLogRef = useRef({ total: 0, visible: 0, classB: 0 });
  useEffect(() => {
    const hasSignificantChange = 
      Math.abs(satellites.length - lastLogRef.current.total) > 100 ||
      Math.abs(visibleSatellites.length - lastLogRef.current.visible) > 100 ||
      satellitesByShell.classB.length !== lastLogRef.current.classB;
    
    if (hasSignificantChange) {
      lastLogRef.current = {
        total: satellites.length,
        visible: visibleSatellites.length,
        classB: satellitesByShell.classB.length,
      };
    }
  }, [satellites.length, visibleSatellites.length, satellitesByShell.classB.length]);
  
  if (satellites.length === 0) {
      // Silent
    return null;
  }
  
  if (visibleSatellites.length === 0) {
    // Silent
    return null;
  }
  
  return (
    <>
      {/* Class A Satellites (Starlink-compute) - Teal circles with subtle halo - HALF SIZE */}
      {satellitesByShell.classA.length > 0 && (
        <instancedMesh
          ref={classARef}
          args={[undefined, undefined, satellitesByShell.classA.length]}
          frustumCulled={true}
        >
          {getClassAGeometry(renderMode)}
          <meshStandardMaterial
            color="#00d4aa" // Teal
            emissive="#00d4aa"
            emissiveIntensity={2.0} // Subtle halo
            depthWrite={true}
            depthTest={true}
          />
        </instancedMesh>
      )}
      
      {/* Class B Satellites (Casey SSO slicer) - Diamond/blade geometry, sun-facing ONLY, NO Earth glow */}
      {satellitesByShell.classB.length > 0 && classBGeometryRef.current && (
        <instancedMesh
          ref={classBRef}
          args={[classBGeometryRef.current, undefined, satellitesByShell.classB.length]}
          frustumCulled={true}
        >
          <ClassBMaterialWithBreathing />
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

/**
 * Class B Material with Breathing Glow
 * Breathing intensity based on sun alignment quality (1-2 second cycle)
 */
function ClassBMaterialWithBreathing() {
  const materialRef = useRef<any>(null);
  const frameSkipRef = useRef(0);
  const sunDirection = useOrbitSim((s) => s.sunDirection);
  useFrame((state) => {
    if (!materialRef.current) return;
    
    // Update breathing glow every 3rd frame for better performance
    frameSkipRef.current++;
    if (frameSkipRef.current % 3 !== 0) return;
    
    const time = state.clock.elapsedTime;
    // Breathing cycle: 1-2 second period (0.5-1.0 Hz)
    const breathingPhase = (time * 0.75) % (Math.PI * 2); // ~1.33 second cycle
    const breathingIntensity = 0.5 + Math.sin(breathingPhase) * 0.5; // 0.5 to 1.0
    
    // Sun alignment quality (simplified: assume good alignment for SSO)
    const alignment = 1.0; // Perfect alignment for SSO
    
    // Base emissive intensity scales with alignment and breathing
    const baseIntensity = 10.0;
    const breathingMultiplier = 0.5 + (breathingIntensity * 0.5); // 0.5 to 1.0
    const finalIntensity = baseIntensity * alignment * breathingMultiplier;
    
    materialRef.current.emissiveIntensity = finalIntensity;
  });
  
  return (
    <meshStandardMaterial
      ref={materialRef}
      color="#ffffff" // Bright white (not cyan like Class A)
      emissive="#00ffff" // Neon cyan only on sun-facing side
      emissiveIntensity={10.0} // Base intensity, animated by breathing
      depthWrite={true}
      depthTest={true}
      side={0} // FrontSide only - backside is dark (no Earth-facing glow)
      metalness={0.8}
      roughness={0.2}
    />
  );
}

