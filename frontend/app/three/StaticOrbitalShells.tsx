"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useOrbitSim } from "../state/orbitStore";
import { useSimulationStore } from "../store/simulationStore";
import { 
  getInitialDeploymentState,
  calculateYearDeployment,
  type YearDeploymentState 
} from "../lib/orbitSim/yearSteppedDeployment";
import type { StrategyMode } from "../lib/orbitSim/satelliteClasses";
import { Vector3, BufferGeometry, Float32BufferAttribute, LineBasicMaterial } from "three";
import { Line } from "@react-three/drei";

/**
 * Static Orbital Shells
 * Shows Class A (multi-inclination LEO) and Class B (SSO ring) as static density fields
 * No orbital motion - structural energy/computation state visualization
 */
export function StaticOrbitalShells() {
  const { satellites } = useOrbitSim();
  const timeline = useSimulationStore((s) => s.timeline);
  const selectedYearIndex = useSimulationStore((s) => s.selectedYearIndex);
  const currentYear = timeline[selectedYearIndex]?.year || 2025;

  // Calculate deployment state for current year
  const deploymentData = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return {
        S_A_lowLEO: 0,
        S_A_midLEO: 0,
        S_A_sunSync: 0,
        S_B: 0,
      };
    }

    const firstYear = timeline[0].year;
    const lastYear = Math.min(currentYear, timeline[timeline.length - 1].year);

    // Build strategy map (default to BALANCED)
    const strategyMap = new Map<number, StrategyMode>();
    timeline.forEach(step => {
      strategyMap.set(step.year, "BALANCED");
    });

    // Run deployment simulation
    let state: YearDeploymentState = getInitialDeploymentState();
    let finalResult = null;

    for (let year = firstYear; year <= lastYear; year++) {
      const strategy = strategyMap.get(year) || "BALANCED";
      const result = calculateYearDeployment(state, strategy);
      finalResult = result;

      state = {
        year: year + 1,
        strategy,
        S_A: result.S_A,
        S_A_lowLEO: result.S_A_lowLEO,
        S_A_midLEO: result.S_A_midLEO,
        S_A_sunSync: result.S_A_sunSync,
        S_B: result.S_B,
        deployedByYear_A: new Map(state.deployedByYear_A),
        deployedByYear_B: new Map(state.deployedByYear_B),
        totalComputePFLOPs: result.totalComputePFLOPs,
        totalPowerMW: result.totalPowerMW,
      };
      state.deployedByYear_A.set(year, result.newA);
      state.deployedByYear_B.set(year, result.newB);
    }

    return finalResult || {
      S_A_lowLEO: 0,
      S_A_midLEO: 0,
      S_A_sunSync: 0,
      S_B: 0,
    };
  }, [timeline, currentYear]);

  // Generate shell geometries
  const classAShells = useMemo(() => {
    const shells: Array<{
      altitude: number;
      inclination: number;
      count: number;
      color: string;
      opacity: number;
    }> = [];

    // Low LEO: 350-450 km, 53° inclination
    if (deploymentData.S_A_lowLEO > 0) {
      shells.push({
        altitude: 400, // Average of 350-450
        inclination: 53,
        count: deploymentData.S_A_lowLEO,
        color: "#00d4aa", // Teal
        opacity: Math.min(0.4, deploymentData.S_A_lowLEO / 1000),
      });
    }

    // Mid LEO: 500-650 km, 70° inclination
    if (deploymentData.S_A_midLEO > 0) {
      shells.push({
        altitude: 575, // Average of 500-650
        inclination: 70,
        count: deploymentData.S_A_midLEO,
        color: "#00d4aa", // Teal
        opacity: Math.min(0.4, deploymentData.S_A_midLEO / 1000),
      });
    }

    // Sun-sync (Class A): ~560 km, 97-98° inclination
    if (deploymentData.S_A_sunSync > 0) {
      shells.push({
        altitude: 560,
        inclination: 97.5,
        count: deploymentData.S_A_sunSync,
        color: "#00d4aa", // Teal
        opacity: Math.min(0.3, deploymentData.S_A_sunSync / 1000),
      });
    }

    return shells;
  }, [deploymentData]);

  // Class B SSO ring: ~560 km, 98° inclination, thickens with count
  const classBRing = useMemo(() => {
    if (deploymentData.S_B === 0) return null;

    const thickness = Math.min(0.05, 0.01 + (deploymentData.S_B / 10000) * 0.04);
    const opacity = Math.min(0.6, 0.2 + (deploymentData.S_B / 5000) * 0.4);

    return {
      altitude: 560,
      inclination: 98,
      count: deploymentData.S_B,
      thickness,
      opacity,
    };
  }, [deploymentData]);

  return (
    <>
      {/* Class A LEO Shells - Multi-inclination density fields */}
      {classAShells.map((shell, i) => (
        <OrbitalShellRing
          key={`classA-${i}`}
          altitude={shell.altitude}
          inclination={shell.inclination}
          color={shell.color}
          opacity={shell.opacity}
          count={shell.count}
        />
      ))}

      {/* Class B SSO Ring - Single thick ring */}
      {classBRing && (
        <SSORing
          altitude={classBRing.altitude}
          thickness={classBRing.thickness}
          opacity={classBRing.opacity}
          count={classBRing.count}
        />
      )}
    </>
  );
}

/**
 * Orbital Shell Ring - Static visualization of a shell
 */
function OrbitalShellRing({
  altitude,
  inclination,
  color,
  opacity,
  count,
}: {
  altitude: number; // km
  inclination: number; // degrees
  color: string;
  opacity: number;
  count: number;
}) {
  const radius = 1.0 + (altitude / 6371.0); // Normalized to Earth radius = 1
  const inclinationRad = (inclination * Math.PI) / 180;
  const scaleRef = useRef(1.0);
  const pulseActiveRef = useRef(false);
  
  // Annual deployment pulse - expand on year change
  const timeline = useSimulationStore((s) => s.timeline);
  const lastYearRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!timeline || timeline.length === 0) return;
    const currentYear = timeline[timeline.length - 1]?.year;
    const lastYear = lastYearRef.current;
    
    if (lastYear !== null && currentYear !== lastYear) {
      // Year advanced - trigger pulse
      console.log(`[StaticOrbitalShells] 🎆 Year advanced: ${lastYear} → ${currentYear}, triggering pulse`);
      pulseActiveRef.current = true;
      scaleRef.current = 1.04; // Increased to 4% expansion for better visibility
      
      // Decay back to 1.0 over 400ms
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / 400);
        scaleRef.current = 1.04 - (0.04 * progress); // Decay from 1.04 to 1.0
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          pulseActiveRef.current = false;
        }
      };
      requestAnimationFrame(animate);
    }
    
    lastYearRef.current = currentYear;
  }, [timeline]);

  // Generate ring points (static, no animation)
  const points = useMemo(() => {
    const numPoints = 128;
    const points: Vector3[] = [];

    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * 2 * Math.PI;
      // For a given inclination, generate points on the orbital plane
      const lat = Math.asin(Math.sin(inclinationRad) * Math.sin(theta)) * (180 / Math.PI);
      const lon = (theta * 180) / Math.PI;

      // Convert to 3D position
      const phi = (90 - lat) * (Math.PI / 180);
      const thetaLon = (lon + 180) * (Math.PI / 180);
      const x = -radius * Math.sin(phi) * Math.cos(thetaLon);
      const z = radius * Math.sin(phi) * Math.sin(thetaLon);
      const y = radius * Math.cos(phi);

      points.push(new Vector3(x, y, z));
    }

    return points;
  }, [radius, inclinationRad]);

  // Create a closed ring using Line segments
  const positions = useMemo(() => {
    const arr = new Float32Array(points.length * 3);
    points.forEach((point, i) => {
      arr[i * 3] = point.x;
      arr[i * 3 + 1] = point.y;
      arr[i * 3 + 2] = point.z;
    });
    return arr;
  }, [points]);

  const lineRef = useRef<any>(null);
  const materialRef = useRef<LineBasicMaterial>(null);
  
  // Apply scale animation
  useFrame(() => {
    if (materialRef.current && pulseActiveRef.current) {
      // Apply opacity pulse during expansion
      materialRef.current.opacity = opacity * (1.0 + (scaleRef.current - 1.0) * 5); // Scale opacity with expansion
    } else if (materialRef.current) {
      materialRef.current.opacity = opacity;
    }
  });

  return (
    <group scale={[scaleRef.current, scaleRef.current, scaleRef.current]}>
      <line ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          ref={materialRef}
          color={color}
          opacity={opacity}
          transparent
          linewidth={2}
        />
      </line>
    </group>
  );
}

/**
 * SSO Ring - Thick sun-synchronous ring for Class B
 */
function SSORing({
  altitude,
  thickness,
  opacity,
  count,
}: {
  altitude: number;
  thickness: number;
  opacity: number;
  count: number;
}) {
  const radius = 1.0 + (altitude / 6371.0);
  const inclination = 98 * (Math.PI / 180);

  // Generate a thick ring using multiple concentric circles
  const rings = useMemo(() => {
    const numRings = 8; // Number of concentric rings for thickness
    const numPoints = 256;
    const rings: Vector3[][] = [];

    for (let ringIdx = 0; ringIdx < numRings; ringIdx++) {
      const ringRadius = radius + (ringIdx - numRings / 2) * thickness / numRings;
      const points: Vector3[] = [];

      for (let i = 0; i < numPoints; i++) {
        const theta = (i / numPoints) * 2 * Math.PI;
        const lat = Math.asin(Math.sin(inclination) * Math.sin(theta)) * (180 / Math.PI);
        const lon = (theta * 180) / Math.PI;

        const phi = (90 - lat) * (Math.PI / 180);
        const thetaLon = (lon + 180) * (Math.PI / 180);
        const x = -ringRadius * Math.sin(phi) * Math.cos(thetaLon);
        const z = ringRadius * Math.sin(phi) * Math.sin(thetaLon);
        const y = ringRadius * Math.cos(phi);

        points.push(new Vector3(x, y, z));
      }

      rings.push(points);
    }

    return rings;
  }, [radius, thickness, inclination]);

  return (
    <group>
      {rings.map((ring, ringIdx) => {
        const positions = new Float32Array(ring.length * 3);
        ring.forEach((point, i) => {
          positions[i * 3] = point.x;
          positions[i * 3 + 1] = point.y;
          positions[i * 3 + 2] = point.z;
        });

        return (
          <line key={ringIdx}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={ring.length}
                array={positions}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color="#00ffff" // Cyan for Class B
              opacity={opacity}
              transparent
              linewidth={3}
            />
          </line>
        );
      })}
    </group>
  );
}

