"use client";

import { InstancedMesh, Object3D, Vector3 } from "three";
import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useOrbitSim } from "../state/orbitStore";
import { 
  updateOrbitalTheta, 
  calculateOrbitalPosition,
  type OrbitalState 
} from "../lib/orbitSim/orbitalMechanics";

// Render only 2% of satellites for performance
const RENDER_PERCENTAGE = 0.02;

export function Satellites() {
  const ref = useRef<InstancedMesh>(null!);
  const satellites = useOrbitSim((s) => s.satellites);
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);
  const { camera } = useThree();
  const lastSatellitesRef = useRef<string>("");
  const orbitalStatesRef = useRef<Map<string, OrbitalState>>(new Map());
  const shellTransitionRef = useRef<Map<string, { startTime: number; startAlt: number; targetAlt: number }>>(new Map());
  
  // Sample satellites to render only 2% of total
  const visibleSatellites = useMemo(() => {
    const targetCount = Math.max(1, Math.floor(satellites.length * RENDER_PERCENTAGE));
    
    if (satellites.length <= targetCount) {
      return satellites;
    }
    
    // Uniformly sample to get exactly targetCount satellites
    const step = satellites.length / targetCount;
    const sampled: typeof satellites = [];
    for (let i = 0; i < satellites.length; i += step) {
      const index = Math.floor(i);
      if (index < satellites.length) {
        sampled.push(satellites[index]);
      }
    }
    
    // Ensure we have at least some satellites visible
    if (sampled.length === 0 && satellites.length > 0) {
      sampled.push(satellites[0]);
    }
    
    if (satellites.length > 100) {
      console.log(`[Satellites] Rendering ${sampled.length} of ${satellites.length} satellites (${(sampled.length / satellites.length * 100).toFixed(1)}%)`);
    }
    return sampled;
  }, [satellites]);

  // Initialize orbital states when satellites change
  useEffect(() => {
    if (!ref.current) return;
    
    // Check if visible satellites actually changed
    const currentHash = visibleSatellites.map(s => s.id).join(",");
    if (currentHash === lastSatellitesRef.current) return;
    lastSatellitesRef.current = currentHash;
    
    if (visibleSatellites.length === 0) {
      ref.current.count = 0;
      orbitalStatesRef.current.clear();
      return;
    }
    
    // Update instance count to visible satellites
    ref.current.count = visibleSatellites.length;
    
    // Initialize or preserve orbital states for visible satellites
    visibleSatellites.forEach((sat) => {
      if (!orbitalStatesRef.current.has(sat.id)) {
        // New satellite - use existing orbital state or create from position
        if (sat.orbitalState) {
          orbitalStatesRef.current.set(sat.id, sat.orbitalState);
        } else {
          // Estimate from current position
          const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
          const altitudeKm = (radius - 1) * 6371; // Convert normalized to km
          const inclination = Math.atan2(sat.z, sat.x);
          const theta = Math.atan2(sat.y, Math.sqrt(sat.x ** 2 + sat.z ** 2));
          
          // Get target altitude from satellite's shell assignment
          const targetAlt = sat.shell ? (() => {
            // Map shell ID to target altitude (middle of shell range)
            const shellMap: Record<number, number> = {
              1: 300, // VLEO: 250-350 km
              2: 700, // MID-LEO: 500-900 km
              3: 1050, // SSO: 900-1200 km
              4: 8500, // MEO: 5000-12000 km
            };
            return shellMap[sat.shell] || 700;
          })() : altitudeKm;
          
          // If target altitude differs from current, start transition animation
          if (Math.abs(targetAlt - altitudeKm) > 10) {
            shellTransitionRef.current.set(sat.id, {
              startTime: Date.now(),
              startAlt: altitudeKm,
              targetAlt: targetAlt,
            });
          }
          
          orbitalStatesRef.current.set(sat.id, {
            altitudeRadius: altitudeKm, // Start at current altitude
            inclination: inclination || (53 * Math.PI / 180),
            theta: theta || Math.random() * 2 * Math.PI,
            orbitalPeriod: 2 * Math.PI * Math.sqrt(Math.pow((6371 + altitudeKm) * 1000, 3) / 3.986004418e14),
            launchTime: Date.now(),
          });
        }
      } else {
        // Existing satellite - check if shell changed
        const currentState = orbitalStatesRef.current.get(sat.id)!;
        const currentAlt = currentState.altitudeRadius;
        const targetAlt = sat.shell ? (() => {
          const shellMap: Record<number, number> = {
            1: 300,
            2: 700,
            3: 1050,
            4: 8500,
          };
          return shellMap[sat.shell] || currentAlt;
        })() : currentAlt;
        
        // If shell changed, start transition animation (2-3 seconds)
        if (Math.abs(targetAlt - currentAlt) > 10 && !shellTransitionRef.current.has(sat.id)) {
          shellTransitionRef.current.set(sat.id, {
            startTime: Date.now(),
            startAlt: currentAlt,
            targetAlt: targetAlt,
          });
        }
      }
    });
    
    // Remove states for satellites that no longer exist
    const currentIds = new Set(visibleSatellites.map(s => s.id));
    for (const [id] of orbitalStatesRef.current) {
      if (!currentIds.has(id)) {
        orbitalStatesRef.current.delete(id);
      }
    }
  }, [visibleSatellites]);

  // Update orbital positions every frame
  useFrame((state, delta) => {
    if (!ref.current || visibleSatellites.length === 0 || simPaused) return;
    
    const effectiveDelta = delta * simSpeed;
    const dummy = new Object3D();
    const cameraPos = new Vector3();
    camera.getWorldPosition(cameraPos);
    
    visibleSatellites.forEach((sat, i) => {
      const orbitalState = orbitalStatesRef.current.get(sat.id);
      
      if (orbitalState) {
        // Check for shell transition animation (2-3 seconds)
        const transition = shellTransitionRef.current.get(sat.id);
        if (transition) {
          const elapsed = (Date.now() - transition.startTime) / 1000; // seconds
          const duration = 2.5; // 2.5 seconds transition
          
          if (elapsed < duration) {
            // Smooth interpolation (ease-in-out)
            const t = elapsed / duration;
            const eased = t < 0.5 
              ? 2 * t * t 
              : 1 - Math.pow(-2 * t + 2, 2) / 2;
            
            // Interpolate altitude
            orbitalState.altitudeRadius = transition.startAlt + (transition.targetAlt - transition.startAlt) * eased;
            
            // Update orbital period for new altitude
            orbitalState.orbitalPeriod = 2 * Math.PI * Math.sqrt(
              Math.pow((6371 + orbitalState.altitudeRadius) * 1000, 3) / 3.986004418e14
            );
          } else {
            // Transition complete
            orbitalState.altitudeRadius = transition.targetAlt;
            orbitalState.orbitalPeriod = 2 * Math.PI * Math.sqrt(
              Math.pow((6371 + transition.targetAlt) * 1000, 3) / 3.986004418e14
            );
            shellTransitionRef.current.delete(sat.id);
          }
        }
        
        // Update theta based on orbital mechanics
        orbitalState.theta = updateOrbitalTheta(
          orbitalState.theta,
          orbitalState.orbitalPeriod,
          effectiveDelta
        );
        
        // Calculate new position from orbital state
        const [x, y, z] = calculateOrbitalPosition(
          orbitalState.altitudeRadius,
          orbitalState.inclination,
          orbitalState.theta
        );
        
        dummy.position.set(x, y, z);
      } else {
        // Fallback to stored position
        dummy.position.set(sat.x || 0, sat.y || 0, sat.z || 0);
      }
      
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    
    ref.current.instanceMatrix.needsUpdate = true;
    
    // Update material color based on pod types (use first satellite's pod type for now)
    // TODO: Implement per-instance coloring for true pod-type visualization
    if (visibleSatellites.length > 0 && ref.current.material) {
      const firstPodType = visibleSatellites[0].podType || "compute";
      let color: string;
      switch (firstPodType) {
        case "compute":
          color = "#4a90e2";
          break;
        case "relay":
          color = "#00ff00";
          break;
        case "storage":
          color = "#bd10e0";
          break;
        default:
          color = "#00ffff";
      }
      (ref.current.material as any).color.set(color);
      (ref.current.material as any).emissive.set(color);
    }
  });

  if (visibleSatellites.length === 0) {
    return null;
  }

  return (
    <instancedMesh 
      ref={ref} 
      args={[undefined, undefined, visibleSatellites.length]}
      frustumCulled={true}
    >
          <sphereGeometry args={[0.008, 12, 12]} />
          <meshStandardMaterial
            color={"#00ffff"}
            transparent={false}
            emissive={"#00ffff"}
            emissiveIntensity={2.0}
            depthWrite={true}
            depthTest={true}
          />
    </instancedMesh>
  );
}

