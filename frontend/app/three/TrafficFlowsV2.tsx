/**
 * Routing Beam Animation (Encodes Multiple Variables)
 * Routing lines encode: load (thickness), latency (speed), congestion (jitter), policy (color)
 */

"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { Line } from "@react-three/drei";
import { useOrbitSim } from "../state/orbitStore";
import { createGeodesicArc } from "../lib/three/coordinateUtils";
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
    for (const [routeId] of pulsesRef.current) {
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
        
        // Thickness based on route type (estimate load)
        const loadMultiplier = route.type === "realtime" ? 1.5 : route.type === "interactive" ? 1.2 : 1.0;
        const thickness = 2 * loadMultiplier;
        
        // Color based on policy (blue = orbit, green = ground, purple = core)
        const color = route.type === "orbit" ? "#00ffff" : route.type === "core" ? "#bd10e0" : "#00ff00";
        
        // Jitter based on congestion (estimate)
        const congestion = 0.3; // TODO: Get from actual congestion data
        const jitter = congestion * 0.1; // 0-0.1 jitter based on congestion
        
        pulsesRef.current.set(route.id, {
          routeId: route.id,
          progress: Math.random(), // Start at random position
          speed: animationSpeed,
          color,
          thickness,
          jitter,
          lastUpdate: Date.now(),
        });
      }
    });
  }, [routes]);

  // Animate pulses
  useFrame((state, delta) => {
    if (simPaused) return;
    
    const effectiveDelta = delta * simSpeed;
    
    // Update pulse progress
    for (const pulse of pulsesRef.current.values()) {
      pulse.progress += pulse.speed * effectiveDelta * 0.1; // Scale speed
      if (pulse.progress > 1) {
        pulse.progress = 0; // Loop
      }
    }
  });

  if (routes.length === 0) {
    return null;
  }

  return (
    <>
      {routes.map((route, idx) => {
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
        
        // Create geodesic arc
        const arcPoints = createGeodesicArc(fromLat, fromLon, fromAlt, toLat, toLon, toAlt, 50);
        const arcVector3 = arcPoints.map(([x, y, z]) => new Vector3(x, y, z));
        
        // Find current pulse position on arc
        const arcIndex = Math.floor(pulse.progress * (arcVector3.length - 1));
        const nextIndex = Math.min(arcIndex + 1, arcVector3.length - 1);
        const t = (pulse.progress * (arcVector3.length - 1)) % 1;
        
        const currentPoint = arcVector3[arcIndex].clone().lerp(arcVector3[nextIndex], t);
        const nextPoint = arcVector3[Math.min(nextIndex + 1, arcVector3.length - 1)];
        
        // Apply jitter (congestion effect)
        const jitterOffset = new Vector3(
          (Math.random() - 0.5) * pulse.jitter,
          (Math.random() - 0.5) * pulse.jitter,
          (Math.random() - 0.5) * pulse.jitter
        );
        const jitteredPos = currentPoint.clone().add(jitterOffset);
        
        // Direction for arrowhead
        const direction = nextPoint.clone().sub(currentPoint).normalize();
        
        return (
          <group key={route.id || idx}>
            {/* Static arc (base path) */}
            <Line
              points={arcPoints}
              color={pulse.color}
              lineWidth={pulse.thickness * 0.3}
              transparent
              opacity={0.3}
            />
            
            {/* Animated pulse */}
            <group position={jitteredPos}>
              {/* Pulse sphere */}
              <mesh>
                <sphereGeometry args={[0.03, 16, 16]} />
                <meshStandardMaterial
                  color={pulse.color}
                  emissive={pulse.color}
                  emissiveIntensity={3.0}
                  depthWrite={true}
                  depthTest={true}
                />
              </mesh>
              
              {/* Arrowhead pointing in direction of travel */}
              <Arrowhead direction={direction} color={pulse.color} />
            </group>
          </group>
        );
      })}
    </>
  );
}

