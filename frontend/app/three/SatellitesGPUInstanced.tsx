"use client";

import { InstancedMesh, Object3D, Vector3, Quaternion, SphereGeometry, OctahedronGeometry } from "three";
import { useRef, useEffect, useMemo } from "react";
import { useOrbitSim } from "../state/orbitStore";
import { useSimulationStore } from "../store/simulationStore";

// LOD thresholds - more aggressive for better performance at high counts
const LOD_THRESHOLDS = {
  FULL_GEOMETRY: 3000,      // < 3k: Full instanced geometry
  BILLBOARDS: 8000,         // 3k-8k: Billboard impostors
  POINT_SPRITES: 20000,     // 8k-20k: Point sprites
  REPRESENTATIVE: 50000,    // 20k-50k: Representative mode (5%)
  // > 50k: Shell heat bands only (handled separately)
};

// Determine LOD level based on satellite count
function getLODLevel(count: number): "full" | "billboard" | "sprite" | "representative" | "heat" {
  if (count < LOD_THRESHOLDS.FULL_GEOMETRY) return "full";
  if (count < LOD_THRESHOLDS.BILLBOARDS) return "billboard";
  if (count < LOD_THRESHOLDS.POINT_SPRITES) return "sprite";
  if (count < LOD_THRESHOLDS.REPRESENTATIVE) return "representative";
  return "heat";
}

// No per-instance data interface needed - we use instance matrices

/**
 * GPU-Instanced Satellite Renderer
 * 
 * Uses InstancedBufferAttributes for all per-satellite data.
 * Only updates on events (year change, strategy change, deployment).
 * No per-frame CPU animation.
 */
export function SatellitesGPUInstanced() {
  const satellites = useOrbitSim((s) => s.satellites);
  const timeline = useSimulationStore((s) => s.timeline);
  const activeStrategy = useSimulationStore((s) => s.activeStrategy);
  
  // Track last update triggers
  const lastYearRef = useRef<number | null>(null);
  const lastStrategyRef = useRef<string | null>(null);
  const lastSatelliteCountRef = useRef<number>(0);
  
  // InstancedMesh refs - one per class/shell
  const classAVLEORef = useRef<InstancedMesh>(null!);
  const classAMIDLEORef = useRef<InstancedMesh>(null!);
  const classASSORef = useRef<InstancedMesh>(null!);
  const classAMEORef = useRef<InstancedMesh>(null!);
  const classAGEORef = useRef<InstancedMesh>(null!);
  const classBSSORef = useRef<InstancedMesh>(null!);
  
  // Dummy object for matrix calculations
  const dummy = useRef(new Object3D());
  
  // Determine LOD level
  const lodLevel = useMemo(() => getLODLevel(satellites.length), [satellites.length]);
  
  // Group satellites by class and shell - match actual shell definitions
  const satellitesByGroup = useMemo(() => {
    const groups = {
      classAVLEO: [] as typeof satellites,      // 250-350 km
      classAMIDLEO: [] as typeof satellites,    // 400-600 km
      classASSO: [] as typeof satellites,       // 800-1000 km (Class A in SSO)
      classAMEO: [] as typeof satellites,       // 10000-15000 km
      classAGEO: [] as typeof satellites,        // 35786 km
      classBSSO: [] as typeof satellites,         // 800-1000 km (Class B)
    };
    
    satellites.forEach(sat => {
      const alt = sat.orbitalState?.altitudeRadius || 550;
      const isClassB = sat.satelliteClass === "B";
      
      if (isClassB) {
        // Class B always goes to SSO
        groups.classBSSO.push(sat);
      } else {
        // Class A - group by actual shell altitudes
        if (alt >= 35786) {
          groups.classAGEO.push(sat);
        } else if (alt >= 10000) {
          groups.classAMEO.push(sat);
        } else if (alt >= 800 && alt <= 1000) {
          groups.classASSO.push(sat);
        } else if (alt >= 400) {
          groups.classAMIDLEO.push(sat);
        } else if (alt >= 250) {
          groups.classAVLEO.push(sat);
        } else {
          // Default to MID-LEO for unknown altitudes
          groups.classAMIDLEO.push(sat);
        }
      }
    });
    
    return groups;
  }, [satellites]);
  
  // Check if update is needed (event-driven)
  const needsUpdate = useMemo(() => {
    const currentYear = timeline.length > 0 ? timeline[timeline.length - 1]?.year : null;
    const yearChanged = currentYear !== null && currentYear !== lastYearRef.current;
    const strategyChanged = activeStrategy !== lastStrategyRef.current;
    const countChanged = satellites.length !== lastSatelliteCountRef.current;
    
    return yearChanged || strategyChanged || countChanged;
  }, [timeline, activeStrategy, satellites.length]);
  
  // Determine if we need representative mode (outside useEffect to access lodLevel)
  const useRepresentative = lodLevel === "representative";
  
  // Update instance matrices only when needed (event-driven, not per-frame)
  useEffect(() => {
    if (!needsUpdate) return;
    
    const currentYear = timeline.length > 0 ? timeline[timeline.length - 1]?.year : null;
    lastYearRef.current = currentYear;
    lastStrategyRef.current = activeStrategy;
    lastSatelliteCountRef.current = satellites.length;
    
    // Calculate sun direction (simplified: fixed in +X direction)
    const sunDistanceNormalized = 150000000 / 6371; // ~23,500 Earth radii
    const sunPosition = new Vector3(sunDistanceNormalized, 0, 0);
    
    // Update each group
    const updateGroup = (
      group: typeof satellites,
      meshRef: React.RefObject<InstancedMesh>,
      isClassB: boolean
    ) => {
      if (!meshRef.current || group.length === 0) {
        if (meshRef.current) meshRef.current.count = 0;
        return;
      }
      
      // Sample for representative mode
      const displayGroup = useRepresentative 
        ? group.filter((_, i) => i % Math.max(1, Math.floor(group.length / Math.ceil(group.length * 0.05))) === 0)
        : group;
      
      const count = displayGroup.length;
      meshRef.current.count = count;
      
      displayGroup.forEach((sat, i) => {
        // Position
        let position = new Vector3();
        if (sat.x !== undefined && sat.y !== undefined && sat.z !== undefined) {
          position.set(sat.x, sat.y, sat.z);
        } else {
          position.set(0, 0, 0);
        }
        
        // For Class B: Calculate sun-facing rotation
        if (isClassB) {
          const satToSun = sunPosition.clone().sub(position).normalize();
          const forward = new Vector3(0, 0, -1); // Diamond's front face
          const quaternion = new Quaternion();
          quaternion.setFromUnitVectors(forward, satToSun);
          dummy.current.quaternion.copy(quaternion);
        } else {
          dummy.current.quaternion.set(0, 0, 0, 1); // No rotation for Class A
        }
        
        // Set position and scale
        // Scale satellites based on orbit altitude (outer orbits = larger)
        const altitude = sat.orbitalState?.altitudeRadius || 550;
        let scale = 1.0;
        
        // Scale based on altitude: higher orbits are larger for visibility
        if (altitude >= 35786) {
          // GEO: 2x larger
          scale = 2.0;
        } else if (altitude >= 10000) {
          // MEO: 1.5x larger
          scale = 1.5;
        } else if (altitude >= 800) {
          // SSO: 1.2x larger
          scale = 1.2;
        } else if (altitude >= 400) {
          // LEO: 1.0x (normal size)
          scale = 1.0;
        } else {
          // VLEO: 0.8x (smaller)
          scale = 0.8;
        }
        
        dummy.current.position.copy(position);
        dummy.current.scale.set(scale, scale, scale);
        dummy.current.updateMatrix();
        
        // Update instance matrix
        meshRef.current.setMatrixAt(i, dummy.current.matrix);
      });
      
      // Mark instance matrix as needing update
      meshRef.current.instanceMatrix.needsUpdate = true;
    };
    
    // Update each group
    updateGroup(satellitesByGroup.classAVLEO, classAVLEORef, false);
    updateGroup(satellitesByGroup.classAMIDLEO, classAMIDLEORef, false);
    updateGroup(satellitesByGroup.classASSO, classASSORef, false);
    updateGroup(satellitesByGroup.classAMEO, classAMEORef, false);
    updateGroup(satellitesByGroup.classAGEO, classAGEORef, false);
    updateGroup(satellitesByGroup.classBSSO, classBSSORef, true);
    
  }, [needsUpdate, satellitesByGroup, timeline, activeStrategy, useRepresentative]);
  
  // Create geometries once
  const classAGeometry = useMemo(() => {
    if (lodLevel === "full") {
      return new SphereGeometry(0.015, 12, 12);
    } else if (lodLevel === "billboard") {
      // Billboard quad (will need custom shader)
      return new SphereGeometry(0.015, 8, 8);
    } else {
      // Point sprite
      return new SphereGeometry(0.012, 6, 6);
    }
  }, [lodLevel]);
  
  const classBGeometry = useMemo(() => {
    if (lodLevel === "full") {
      return new OctahedronGeometry(0.06, 0);
    } else if (lodLevel === "billboard") {
      // Billboard quad for Class B
      return new OctahedronGeometry(0.05, 0);
    } else {
      // Point sprite
      return new OctahedronGeometry(0.04, 0);
    }
  }, [lodLevel]);
  
  if (satellites.length === 0) return null;
  
  // Heat band mode (>50k) - render as shell rings only
  if (lodLevel === "heat") {
    return null; // Shell rings handled by StaticOrbitalShells
  }
  
  // Representative mode: render only 5% of satellites
  const getRepresentativeSats = (sats: typeof satellites) => {
    if (!useRepresentative) return sats;
    const sampleSize = Math.ceil(sats.length * 0.05);
    const step = Math.max(1, Math.floor(sats.length / sampleSize));
    return sats.filter((_, i) => i % step === 0);
  };
  
  return (
    <>
      {/* Class A - VLEO (250-350 km) */}
      {satellitesByGroup.classAVLEO.length > 0 && (
        <instancedMesh
          ref={classAVLEORef}
          args={[classAGeometry, undefined, getRepresentativeSats(satellitesByGroup.classAVLEO).length]}
          frustumCulled={true}
        >
          <meshBasicMaterial
            color="#00d4aa"
            transparent={true}
            opacity={0.9}
            alphaTest={0.15}
          />
        </instancedMesh>
      )}
      
      {/* Class A - MID-LEO (400-600 km) */}
      {satellitesByGroup.classAMIDLEO.length > 0 && (
        <instancedMesh
          ref={classAMIDLEORef}
          args={[classAGeometry, undefined, getRepresentativeSats(satellitesByGroup.classAMIDLEO).length]}
          frustumCulled={true}
        >
          <meshBasicMaterial
            color="#00d4aa"
            transparent={true}
            opacity={0.9}
            alphaTest={0.15}
          />
        </instancedMesh>
      )}
      
      {/* Class A - SSO (800-1000 km) */}
      {satellitesByGroup.classASSO.length > 0 && (
        <instancedMesh
          ref={classASSORef}
          args={[classAGeometry, undefined, getRepresentativeSats(satellitesByGroup.classASSO).length]}
          frustumCulled={true}
        >
          <meshBasicMaterial
            color="#00d4aa"
            transparent={true}
            opacity={0.9}
            alphaTest={0.15}
          />
        </instancedMesh>
      )}
      
      {/* Class A - MEO (10000-15000 km) */}
      {satellitesByGroup.classAMEO.length > 0 && (
        <instancedMesh
          ref={classAMEORef}
          args={[classAGeometry, undefined, getRepresentativeSats(satellitesByGroup.classAMEO).length]}
          frustumCulled={true}
        >
          <meshBasicMaterial
            color="#00d4aa"
            transparent={true}
            opacity={0.9}
            alphaTest={0.15}
          />
        </instancedMesh>
      )}
      
      {/* Class A - GEO (35786 km) */}
      {satellitesByGroup.classAGEO.length > 0 && (
        <instancedMesh
          ref={classAGEORef}
          args={[classAGeometry, undefined, getRepresentativeSats(satellitesByGroup.classAGEO).length]}
          frustumCulled={true}
        >
          <meshBasicMaterial
            color="#00d4aa"
            transparent={true}
            opacity={0.9}
            alphaTest={0.15}
          />
        </instancedMesh>
      )}
      
      {/* Class B - SSO (800-1000 km) */}
      {satellitesByGroup.classBSSO.length > 0 && (
        <instancedMesh
          ref={classBSSORef}
          args={[classBGeometry, undefined, getRepresentativeSats(satellitesByGroup.classBSSO).length]}
          frustumCulled={true}
        >
          <meshBasicMaterial
            color="#ffffff"
            transparent={true}
            opacity={0.95}
            alphaTest={0.15}
          />
        </instancedMesh>
      )}
    </>
  );
}

