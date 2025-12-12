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

  // Class B SSO ring: 600-800 km, 98° inclination, thickens with count
  const classBRing = useMemo(() => {
    if (deploymentData.S_B === 0) return null;

    const thickness = Math.min(0.05, 0.01 + (deploymentData.S_B / 10000) * 0.04);
    const opacity = Math.min(0.6, 0.2 + (deploymentData.S_B / 5000) * 0.4);

    return {
      altitude: 700, // Average of 600-800 km range
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
  
  // Calculate congestion for this shell (from satellites)
  const satellites = useOrbitSim((s) => s.satellites);
  const routes = useOrbitSim((s) => s.routes);
  
  // Calculate congestion: number of satellites in this shell + routes passing through
  const shellCongestion = useMemo(() => {
    const shellSats = satellites.filter(sat => {
      const satAlt = sat.orbitalState?.altitudeRadius || (sat as any).alt_km || 550;
      const altKm = (satAlt - 1) * 6371;
      // Check if satellite is in this shell's altitude range
      const altDiff = Math.abs(altKm - altitude);
      return altDiff < 50; // Within 50km of shell altitude
    });
    
    // Count routes that pass through this shell
    const routesThroughShell = routes.filter(route => {
      // Simple check: if route altitude is near shell altitude
      const fromAlt = (Math.sqrt(route.fromVec[0]**2 + route.fromVec[1]**2 + route.fromVec[2]**2) - 1) * 6371;
      const toAlt = (Math.sqrt(route.toVec[0]**2 + route.toVec[1]**2 + route.toVec[2]**2) - 1) * 6371;
      return Math.abs(fromAlt - altitude) < 100 || Math.abs(toAlt - altitude) < 100;
    });
    
    // Normalize congestion (0-1): more satellites + routes = higher congestion
    const maxExpected = 1000; // Normalize to 1000 satellites
    const congestion = Math.min(1.0, (shellSats.length + routesThroughShell.length * 0.1) / maxExpected);
    return congestion;
  }, [satellites, routes, altitude]);
  
  // Apply scale animation and congestion-based jitter
  useFrame((state, delta) => {
    if (materialRef.current && pulseActiveRef.current) {
      // Apply opacity pulse during expansion
      materialRef.current.opacity = opacity * (1.0 + (scaleRef.current - 1.0) * 5); // Scale opacity with expansion
    } else if (materialRef.current) {
      // Apply congestion-based visual effects - ENHANCED FOR VISIBILITY
      const baseOpacity = opacity;
      if (shellCongestion > 0.3) {
        // More visible jitter for congested shells
        const congestionJitter = Math.sin(state.clock.elapsedTime * (5 + shellCongestion * 10)) * shellCongestion * 0.3;
        materialRef.current.opacity = baseOpacity * (1.0 + congestionJitter);
        
        // High congestion: add noise to color and brightness hotspots
        if (shellCongestion > 0.7) {
          const noise = (Math.random() - 0.5) * shellCongestion * 0.3;
          const brightness = 1.0 + (shellCongestion * 0.5); // Brighter when congested
          materialRef.current.color.setRGB(
            (parseFloat(color.slice(1, 3)) / 255 + noise) * brightness,
            (parseFloat(color.slice(3, 5)) / 255 + noise) * brightness,
            (parseFloat(color.slice(5, 7)) / 255 + noise) * brightness
          );
        }
      } else {
        // Stable shell: smooth, even glow
        materialRef.current.opacity = baseOpacity;
        materialRef.current.color.set(color);
      }
    }
    
    // Apply spatial jitter to ring for high congestion
    if (lineRef.current && shellCongestion > 0.6) {
      const jitterAmount = shellCongestion * 0.01;
      const jitterX = (Math.random() - 0.5) * jitterAmount;
      const jitterY = (Math.random() - 0.5) * jitterAmount;
      const jitterZ = (Math.random() - 0.5) * jitterAmount;
      // Apply jitter to ring scale
      if (lineRef.current.scale) {
        lineRef.current.scale.set(
          scaleRef.current + jitterX,
          scaleRef.current + jitterY,
          scaleRef.current + jitterZ
        );
      }
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

