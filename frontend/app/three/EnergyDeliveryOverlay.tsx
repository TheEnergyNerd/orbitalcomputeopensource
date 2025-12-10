"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, BufferGeometry, BufferAttribute, LineBasicMaterial, Color } from "three";
import { useOrbitSim, type Satellite } from "../state/orbitStore";
import { useSimulationStore } from "../store/simulationStore";
import { latLonAltToXYZ } from "../lib/three/coordinateUtils";

/**
 * Energy Delivery vs Distance Map (Globe Overlay)
 * Shows radial energy beams from SSO ring toward surface regions
 * Beams persist through night cycles, demonstrating permanent daylight
 */
export function EnergyDeliveryOverlay() {
  const satellites = useOrbitSim((s) => s.satellites);
  const timeline = useSimulationStore((s) => s.timeline);
  const beamGeometryRef = useRef<BufferGeometry | null>(null);
  const beamMaterialRef = useRef<LineBasicMaterial | null>(null);
  const groundGlowGeometryRef = useRef<BufferGeometry | null>(null);
  const groundGlowMaterialRef = useRef<LineBasicMaterial | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);

  // Get current year
  const currentYear = timeline && timeline.length > 0 
    ? timeline[timeline.length - 1]?.year || 2025 
    : 2025;

  // Filter Class B SSO satellites (800-1000 km)
  // Type guard to ensure satellites have x, y, z coordinates
  type SatWithPos = Satellite & { x: number; y: number; z: number };
  const classBSSOSats = useMemo((): SatWithPos[] => {
    return satellites.filter((sat): sat is SatWithPos => {
      const altRadius = sat.orbitalState?.altitudeRadius;
      return sat.satelliteClass === "B" && 
        altRadius !== undefined &&
        altRadius >= 800 && 
        altRadius <= 1000 &&
        typeof sat.x === 'number' && 
        typeof sat.y === 'number' && 
        typeof sat.z === 'number';
    });
  }, [satellites]);

  // Target regions: Northern mid-latitudes and dense population corridors
  const targetRegions = useMemo(() => [
    // North America
    { lat: 40, lon: -100, name: "North America" },
    { lat: 45, lon: -75, name: "Northeast Corridor" },
    // Europe
    { lat: 50, lon: 10, name: "Central Europe" },
    { lat: 52, lon: 0, name: "UK" },
    // Asia
    { lat: 35, lon: 140, name: "Japan" },
    { lat: 30, lon: 120, name: "East China" },
    // Additional population centers
    { lat: 40, lon: -74, name: "NYC Metro" },
    { lat: 34, lon: -118, name: "LA Metro" },
    { lat: 51, lon: -0.1, name: "London" },
    { lat: 48, lon: 2.3, name: "Paris" },
  ], []);

  // Calculate energy beams from SSO sats to target regions
  const energyBeams = useMemo(() => {
    if (classBSSOSats.length === 0 || currentYear < 2030) {
      return [];
    }

    const beams: Array<{
      from: Vector3;
      to: Vector3;
      opacity: number;
      energyShare: number;
    }> = [];

    // For each target region, find nearest SSO sat and create beam
    targetRegions.forEach(region => {
      const [x, y, z] = latLonAltToXYZ(region.lat, region.lon, 0);
      // Normalize to Earth surface (radius = 1)
      const targetVec = new Vector3(x, y, z).normalize();

      // Find nearest SSO satellite
      let nearestSatIndex = -1;
      let minDistance = Infinity;

      classBSSOSats.forEach((sat, index) => {
        const satPos = new Vector3(sat.x, sat.y, sat.z);
        const distance = satPos.distanceTo(targetVec);
        if (distance < minDistance) {
          minDistance = distance;
          nearestSatIndex = index;
        }
      });

      if (nearestSatIndex >= 0 && nearestSatIndex < classBSSOSats.length) {
        const nearestSat = classBSSOSats[nearestSatIndex];
        const satPos = new Vector3(nearestSat.x, nearestSat.y, nearestSat.z);
        const energyShare = Math.max(0.1, Math.min(1.0, 1.0 - (minDistance / 2.0))); // 0.1 to 1.0 based on distance
        
        beams.push({
          from: satPos,
          to: targetVec,
          opacity: energyShare * 0.3, // Max 30% opacity
          energyShare,
        });
      }
    });

    return beams;
  }, [classBSSOSats, targetRegions, currentYear]);

  // Calculate ground solar contributions (patchy, time-limited)
  const groundSolarGlows = useMemo(() => {
    // Simulate ground solar: only active during day, affected by weather/season
    const timeOfDay = (Date.now() / 1000) % 86400; // Seconds in day
    const isDaytime = timeOfDay > 21600 && timeOfDay < 64800; // 6 AM to 6 PM
    
    if (!isDaytime) {
      return []; // No ground solar at night
    }

    // Random weather/season suppression
    const weatherFactor = 0.3 + Math.random() * 0.5; // 30-80% availability
    
    return targetRegions.map(region => {
      const [x, y, z] = latLonAltToXYZ(region.lat, region.lon, 0);
      const glowIntensity = weatherFactor * 0.2; // Max 20% opacity, reduced by weather
      
      return {
        position: new Vector3(x, y, z),
        intensity: glowIntensity,
      };
    });
  }, [targetRegions]);

  // Update beam geometry
  useFrame(() => {
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < 100) return; // Update every 100ms
    lastUpdateTimeRef.current = now;

    if (energyBeams.length === 0) {
      if (beamGeometryRef.current) {
        beamGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
        beamGeometryRef.current.setAttribute('color', new BufferAttribute(new Float32Array(0), 3));
      }
      return;
    }

    // Build beam geometry
    const positions: number[] = [];
    const colors: number[] = [];
    const beamColor = new Color(0xFFFF00); // Yellow/gold for energy beams

    energyBeams.forEach(beam => {
      positions.push(beam.from.x, beam.from.y, beam.from.z);
      positions.push(beam.to.x, beam.to.y, beam.to.z);
      
      const alpha = beam.opacity;
      colors.push(beamColor.r * alpha, beamColor.g * alpha, beamColor.b * alpha);
      colors.push(beamColor.r * alpha, beamColor.g * alpha, beamColor.b * alpha);
    });

    if (!beamGeometryRef.current) {
      beamGeometryRef.current = new BufferGeometry();
    }

    beamGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    beamGeometryRef.current.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    beamGeometryRef.current.attributes.position.needsUpdate = true;
    beamGeometryRef.current.attributes.color.needsUpdate = true;
  });

  // Update ground glow geometry
  useFrame(() => {
    if (groundSolarGlows.length === 0) {
      if (groundGlowGeometryRef.current) {
        groundGlowGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
        groundGlowGeometryRef.current.setAttribute('color', new BufferAttribute(new Float32Array(0), 3));
      }
      return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const glowColor = new Color(0xFFA500); // Orange for ground solar

    groundSolarGlows.forEach(glow => {
      // Create small radial lines from surface to show patchy nature
      const center = glow.position;
      const radius = 0.02; // Small radius for patchy effect
      
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const offset = new Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0
        ).add(center);
        
        positions.push(center.x, center.y, center.z);
        positions.push(offset.x, offset.y, offset.z);
        
        const alpha = glow.intensity;
        colors.push(glowColor.r * alpha, glowColor.g * alpha, glowColor.b * alpha);
        colors.push(glowColor.r * alpha, glowColor.g * alpha, glowColor.b * alpha);
      }
    });

    if (!groundGlowGeometryRef.current) {
      groundGlowGeometryRef.current = new BufferGeometry();
    }

    groundGlowGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    groundGlowGeometryRef.current.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    groundGlowGeometryRef.current.attributes.position.needsUpdate = true;
    groundGlowGeometryRef.current.attributes.color.needsUpdate = true;
  });

  // Only render if SSO sats exist
  if (classBSSOSats.length === 0 || currentYear < 2030) {
    return null;
  }

  return (
    <>
      {/* Energy beams from SSO ring to surface */}
      {beamGeometryRef.current && (
        <lineSegments geometry={beamGeometryRef.current}>
          <lineBasicMaterial
            ref={beamMaterialRef}
            vertexColors={true}
            transparent={true}
            opacity={0.8}
            linewidth={2}
            depthTest={true}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Ground solar glows (patchy, intermittent) */}
      {groundGlowGeometryRef.current && (
        <lineSegments geometry={groundGlowGeometryRef.current}>
          <lineBasicMaterial
            ref={groundGlowMaterialRef}
            vertexColors={true}
            transparent={true}
            opacity={0.6}
            linewidth={1}
            depthTest={true}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </>
  );
}

