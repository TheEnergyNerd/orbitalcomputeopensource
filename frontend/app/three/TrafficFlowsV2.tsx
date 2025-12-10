/**
 * Routing Beam Animation (Encodes Multiple Variables)
 * Routing lines encode: load (thickness), latency (speed), congestion (jitter), policy (color)
 */

"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Vector3, Quaternion, TubeGeometry, CatmullRomCurve3 } from "three";
import { Line } from "@react-three/drei";
import { useOrbitSim } from "../state/orbitStore";
import { createGeodesicArc } from "../lib/three/coordinateUtils";
// Route tube component - updates geometry per frame for animated jitter
function RouteTube({ curve, radius, color }: { curve: CatmullRomCurve3, radius: number, color: string }) {
  const meshRef = useRef<any>(null);
  const geometryRef = useRef<TubeGeometry | null>(null);
  
  useFrame(() => {
    if (!meshRef.current) return;
    
    // Dispose old geometry
    if (geometryRef.current) {
      geometryRef.current.dispose();
    }
    
    // Create new geometry with updated curve (jitter animation)
    geometryRef.current = new TubeGeometry(curve, 50, radius, 8, false);
    meshRef.current.geometry = geometryRef.current;
  });
  
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
      }
    };
  }, []);
  
  return (
    <mesh ref={meshRef}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.5}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// Arrowhead component - properly aligned with direction
function Arrowhead({ direction, color }: { direction: Vector3, color: string }) {
  const arrowLength = 0.06;
  const arrowTip = direction.clone().multiplyScalar(arrowLength);
  
  const quaternion = new Quaternion();
  const up = new Vector3(0, 1, 0);
  quaternion.setFromUnitVectors(up, direction);
  
  return (
    <mesh position={arrowTip} quaternion={quaternion}>
      <coneGeometry args={[0.02, arrowLength, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={3.0}
        depthWrite={true}
        depthTest={true}
      />
    </mesh>
  );
}

interface TrafficPulse {
  routeId: string;
  progress: number; // 0 to 1
  speed: number; // Animation speed (inverse of latency)
  color: string; // Policy color (blue → green)
  thickness: number; // Traffic load
  jitter: number; // Congestion jitter
  lastUpdate: number; // Timestamp of last path update
}

const ROUTING_UPDATE_INTERVAL = 3; // Recompute paths every 3 seconds

export function TrafficFlowsV2() {
  const pulsesRef = useRef<Map<string, TrafficPulse>>(new Map());
  const routes = useOrbitSim((s) => s.routes);
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);
  const lastRoutesRef = useRef<string>("");

  // Initialize pulses when routes change
  useEffect(() => {
    const routesHash = routes.map(r => r.id).join(",");
    if (routesHash === lastRoutesRef.current) return;
    lastRoutesRef.current = routesHash;
    
    // Remove pulses for routes that no longer exist
    const currentRouteIds = new Set(routes.map(r => r.id));
    for (const [routeId] of Array.from(pulsesRef.current.entries())) {
      if (!currentRouteIds.has(routeId)) {
        pulsesRef.current.delete(routeId);
      }
    }
    
    // Create pulses for new routes
    routes.forEach((route) => {
      if (!pulsesRef.current.has(route.id)) {
        // Calculate latency from distance
        const fromVec = new Vector3(route.fromVec[0], route.fromVec[1], route.fromVec[2]);
        const toVec = new Vector3(route.toVec[0], route.toVec[1], route.toVec[2]);
        const distance = fromVec.distanceTo(toVec);
        const speedOfLight = 300000 / 1000; // km/ms
        const latency = distance * 6371 / speedOfLight; // Convert normalized to km, then to ms
        
        // Speed is inverse of latency (lower latency = faster animation)
        const animationSpeed = Math.max(0.1, Math.min(2.0, 100 / latency));
        
        // Thickness based on actual traffic load (trafficMbps) - MUCH MORE VISIBLE
        const trafficMbps = route.trafficMbps || 100; // Default 100 Mbps
        // Scale: 10 Mbps = 0.01 radius, 100 Mbps = 0.05 radius, 500 Mbps = 0.15 radius
        // Much larger range for visible differences
        const minRadius = 0.01;
        const maxRadius = 0.15;
        const thickness = Math.max(minRadius, Math.min(maxRadius, (trafficMbps / 10) * 0.01));
        
        // Log thickness for debugging (only first few routes)
        if (pulsesRef.current.size < 3) {
          console.log(`[TrafficFlowsV2] Route ${route.id}: trafficMbps=${trafficMbps.toFixed(1)}, radius=${thickness.toFixed(4)}`);
        }
        
        // Color based on strategy/policy (blue = latency, green = cost, emerald = carbon, purple = balanced)
        // Map route type to strategy color
        let color = "#00ffff"; // Default cyan
        if (route.type === "orbit") color = "#00ffff"; // Cyan for orbit
        else if (route.type === "core") color = "#bd10e0"; // Purple for core
        else if (route.type === "edge") color = "#00ff00"; // Green for edge
        // TODO: Get actual strategy from route metadata if available
        
        // Jitter based on actual congestion index - MORE VISIBLE
        const congestionIndex = route.congestionIndex !== undefined ? route.congestionIndex : 0.3;
        const jitter = Math.min(0.3, congestionIndex * 0.5); // Scale congestion 0-1 to jitter 0-0.3 (increased from 0.15)
        
        pulsesRef.current.set(route.id, {
          routeId: route.id,
          progress: Math.random(), // Start at random position
          speed: animationSpeed,
          color,
          thickness, // This is now the radius (0.01 to 0.15)
          jitter,
          lastUpdate: Date.now(),
        });
      }
    });
  }, [routes]);

  // Store jittered arc points per route (updated per frame for animation)
  const jitteredArcsRef = useRef<Map<string, Vector3[]>>(new Map());
  
  // Animate pulses and update jittered arcs
  useFrame((state, delta) => {
    if (simPaused) return;
    
    const effectiveDelta = delta * simSpeed;
    const time = state.clock.getElapsedTime();
    
    // Update pulse progress
    for (const pulse of Array.from(pulsesRef.current.values())) {
      pulse.progress += pulse.speed * effectiveDelta * 0.1; // Scale speed
      if (pulse.progress > 1) {
        pulse.progress = 0; // Loop
      }
    }
    
    // Update jittered arcs for visible routes only (performance optimization)
    // Only update every 5th frame to reduce CPU load significantly
    const frameSkip = Math.floor(state.clock.elapsedTime * 60) % 5 === 0; // Approximate frame skip
    if (!frameSkip) return;
    
    const MAX_ROUTES = 30; // Reduced from 50 for much better performance
    const routesToUpdate = routes.length > MAX_ROUTES
      ? [...routes].sort((a, b) => (b.trafficMbps || 0) - (a.trafficMbps || 0)).slice(0, MAX_ROUTES)
      : routes;
    
    routesToUpdate.forEach((route) => {
      const pulse = pulsesRef.current.get(route.id);
      if (!pulse) return;
      
      const fromVec = new Vector3(route.fromVec[0], route.fromVec[1], route.fromVec[2]);
      const toVec = new Vector3(route.toVec[0], route.toVec[1], route.toVec[2]);
      
      const fromRadius = fromVec.length();
      const toRadius = toVec.length();
      
      const fromLat = Math.asin(fromVec.z / fromRadius) * 180 / Math.PI;
      const fromLon = Math.atan2(fromVec.y, fromVec.x) * 180 / Math.PI;
      const fromAlt = (fromRadius - 1) * 6371;
      
      const toLat = Math.asin(toVec.z / toRadius) * 180 / Math.PI;
      const toLon = Math.atan2(toVec.y, toVec.x) * 180 / Math.PI;
      const toAlt = (toRadius - 1) * 6371;
      
      const arcPoints = createGeodesicArc(fromLat, fromLon, fromAlt, toLat, toLon, toAlt, 50);
      const arcVector3 = arcPoints.map(([x, y, z]) => new Vector3(x, y, z));
      
      // Apply animated jitter to arc points
      const jitteredPoints = arcVector3.map((point, i) => {
        const progress = i / (arcVector3.length - 1);
        const jitterPhase = ((progress * 2 * Math.PI * 8) + (time * 2)) % (Math.PI * 2);
        const jitterAmount = Math.sin(jitterPhase) * pulse.jitter;
        const bucklePhase = ((progress * 2 * Math.PI * 20) + (time * 3)) % (Math.PI * 2);
        const buckleAmount = Math.sin(bucklePhase) * pulse.jitter * 0.3;
        const totalJitter = jitterAmount + buckleAmount;
        
        const nextPoint = arcVector3[Math.min(i + 1, arcVector3.length - 1)];
        const prevPoint = arcVector3[Math.max(i - 1, 0)];
        const direction = nextPoint.clone().sub(prevPoint).normalize();
        const perpendicular = new Vector3(-direction.y, direction.x, 0).normalize();
        if (perpendicular.length() < 0.1) {
          perpendicular.set(0, 0, 1);
        }
        
        return point.clone().add(perpendicular.multiplyScalar(totalJitter));
      });
      
      jitteredArcsRef.current.set(route.id, jitteredPoints);
    });
  });

  if (routes.length === 0) {
    return null;
  }

  // Performance optimization: limit routes rendered at once (prioritize by traffic)
  // Aggressively reduced for better performance
  const MAX_ROUTES = 30; // Reduced from 50 for much better performance
  const visibleRoutes = routes.length > MAX_ROUTES
    ? [...routes].sort((a, b) => (b.trafficMbps || 0) - (a.trafficMbps || 0)).slice(0, MAX_ROUTES)
    : routes;

  return (
    <>
      {visibleRoutes.map((route, idx) => {
        const pulse = pulsesRef.current.get(route.id);
        if (!pulse) return null;

        // Convert xyz to lat/lon/alt for geodesic calculation
        const fromVec = new Vector3(route.fromVec[0], route.fromVec[1], route.fromVec[2]);
        const toVec = new Vector3(route.toVec[0], route.toVec[1], route.toVec[2]);
        
        const fromRadius = fromVec.length();
        const toRadius = toVec.length();
        
        // Convert to lat/lon/alt
        const fromLat = Math.asin(fromVec.z / fromRadius) * 180 / Math.PI;
        const fromLon = Math.atan2(fromVec.y, fromVec.x) * 180 / Math.PI;
        const fromAlt = (fromRadius - 1) * 6371;
        
        const toLat = Math.asin(toVec.z / toRadius) * 180 / Math.PI;
        const toLon = Math.atan2(toVec.y, toVec.x) * 180 / Math.PI;
        const toAlt = (toRadius - 1) * 6371;
        
        // Get jittered arc points (updated per frame in useFrame)
        const jitteredArcPoints = jitteredArcsRef.current.get(route.id);
        if (!jitteredArcPoints) return null; // Skip if not yet calculated
        
        // Find current pulse position on arc (forward direction)
        const arcIndex = Math.floor(pulse.progress * (jitteredArcPoints.length - 1));
        const nextIndex = Math.min(arcIndex + 1, jitteredArcPoints.length - 1);
        const t = (pulse.progress * (jitteredArcPoints.length - 1)) % 1;
        
        const currentPoint = jitteredArcPoints[arcIndex].clone().lerp(jitteredArcPoints[nextIndex], t);
        const nextPoint = jitteredArcPoints[Math.min(nextIndex + 1, jitteredArcPoints.length - 1)];
        
        const arcDirection = nextPoint.clone().sub(currentPoint).normalize();
        const jitteredPos = currentPoint;
        
        // Direction for arrowhead (forward)
        const forwardDirection = nextPoint.clone().sub(currentPoint).normalize();
        
        // BIDIRECTIONAL: Create reverse pulse (orbit→ground or orbit→orbit reverse)
        const reverseProgress = (1 - pulse.progress) % 1;
        const reverseArcIndex = Math.floor(reverseProgress * (jitteredArcPoints.length - 1));
        const reverseNextIndex = Math.min(reverseArcIndex + 1, jitteredArcPoints.length - 1);
        const reverseT = (reverseProgress * (jitteredArcPoints.length - 1)) % 1;
        
        const reverseCurrentPoint = jitteredArcPoints[reverseArcIndex].clone().lerp(jitteredArcPoints[reverseNextIndex], reverseT);
        const reverseNextPoint = jitteredArcPoints[Math.min(reverseNextIndex + 1, jitteredArcPoints.length - 1)];
        const reverseDirection = reverseNextPoint.clone().sub(reverseCurrentPoint).normalize();
        const reverseJitteredPos = reverseCurrentPoint;
        
        // Create tube geometry for visible thickness (lineWidth doesn't work in WebGL)
        // pulse.thickness is already the radius (0.01 to 0.15)
        const tubeRadius = pulse.thickness;
        const curve = new CatmullRomCurve3(jitteredArcPoints);
        
        // Log first few routes for debugging
        if (idx < 3) {
          console.log(`[TrafficFlowsV2] Route ${route.id}: trafficMbps=${(route.trafficMbps || 100).toFixed(1)}, tubeRadius=${tubeRadius.toFixed(4)}, jitter=${pulse.jitter.toFixed(3)}`);
        }
        
        return (
          <group key={route.id || idx}>
            {/* Static arc (base path) - thickness encodes load - USING TUBE GEOMETRY with animated jitter */}
            <RouteTube curve={curve} radius={tubeRadius} color={pulse.color} />
            
            {/* Forward pulse (ground→orbit or orbit→orbit) */}
            <group position={jitteredPos}>
              <mesh>
                <sphereGeometry args={[0.02, 12, 12]} />
                <meshStandardMaterial
                  color={pulse.color}
                  emissive={pulse.color}
                  emissiveIntensity={3.0}
                  depthWrite={true}
                  depthTest={true}
                />
              </mesh>
              <Arrowhead direction={forwardDirection} color={pulse.color} />
            </group>
            
            {/* Reverse pulse (orbit→ground or orbit→orbit reverse) */}
            <group position={reverseJitteredPos}>
              <mesh>
                <sphereGeometry args={[0.02, 12, 12]} />
                <meshStandardMaterial
                  color={pulse.color}
                  emissive={pulse.color}
                  emissiveIntensity={2.0} // Slightly dimmer for reverse
                  depthWrite={true}
                  depthTest={true}
                />
              </mesh>
              <Arrowhead direction={reverseDirection.clone().negate()} color={pulse.color} />
            </group>
          </group>
        );
      })}
    </>
  );
}

