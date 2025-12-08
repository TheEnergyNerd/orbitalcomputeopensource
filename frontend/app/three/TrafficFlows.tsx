"use client";

import { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Vector3, Quaternion, Euler } from "three";
import { useOrbitSim, type Satellite } from "../state/orbitStore";
import { latLonAltToXYZ, createGeodesicArc, xyzToLatLonAlt } from "../lib/three/coordinateUtils";
import { 
  calculateRoutingBeamState,
  type PolicyType 
} from "../lib/orbitSim/routingBeamGeometry";

// Arrowhead component - properly aligned with direction
function Arrowhead({ direction, color }: { direction: Vector3, color: string }) {
  const arrowLength = 0.06;
  const arrowTip = direction.clone().multiplyScalar(arrowLength);
  
  // Use quaternion to align cone (+Y) with direction vector
  const up = new Vector3(0, 1, 0); // Cone points in +Y
  const quaternion = new Quaternion();
  quaternion.setFromUnitVectors(up, direction);
  
  // Convert quaternion to Euler (XYZ order)
  const euler = new Euler().setFromQuaternion(quaternion);
  
  return (
    <mesh
      position={arrowTip}
      rotation={[euler.x, euler.y, euler.z]}
    >
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
  id: string;
  routeId: string;
  progress: number;
  speed: number;
  color: string;
  thickness: number;
  jitter: number;
  jitterSeed?: number;
}

export function TrafficFlows() {
  const pulsesRef = useRef<Map<string, TrafficPulse>>(new Map());
  const routes = useOrbitSim((s) => s.routes);
  const allSatellites = useOrbitSim((s) => s.satellites); // CRITICAL: Get current satellite positions
  const [frame, setFrame] = useState(0); // Force re-render for smooth animation
  
  // Streaming spawn state (matches SatellitesOptimized logic)
  const spawnQueueRef = useRef<Array<{ id: string; x: number; y: number; z: number }>>([]);
  const spawnStartTimeRef = useRef<number>(performance.now());
  const spawnDurationRef = useRef<number>(500); // Match SatellitesOptimized

  // Get visible satellites using same streaming spawn logic as SatellitesOptimized
  const getVisibleSatellites = (): typeof allSatellites => {
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

  // Create pulses for each route
  useEffect(() => {
    // Get visible satellites inside effect to ensure we have latest spawn state
    const visibleSatellites = getVisibleSatellites();
    
    const newPulses = new Map<string, TrafficPulse>();
    
    routes.forEach((route, idx) => {
      const pulseId = `pulse_${route.id || idx}`;
      const existingPulse = pulsesRef.current.get(pulseId);
      
      // Calculate routing beam state from route data
      // Use actual values from route if available, otherwise calculate from distance
      const trafficMbps = route.trafficMbps || 100; // Default 100 Mbps
      const policy: PolicyType = (route.type === "orbit" ? "latency" : route.type === "core" ? "resilience" : "cost") as PolicyType;
      
      // CRITICAL: Calculate actual latency from route distance and shell properties
      let totalPathLatencyMs = route.latencyMs;
      if (!totalPathLatencyMs) {
        // Calculate from distance (speed of light)
        const fromVec = new Vector3(...route.fromVec);
        const toVec = new Vector3(...route.toVec);
        const distanceKm = fromVec.distanceTo(toVec) * 6371; // Convert normalized to km
        const speedOfLightKmPerMs = 299792.458 / 1000; // km/ms
        const baseLatency = distanceKm / speedOfLightKmPerMs;
        // Add shell altitude delay (assume MID-LEO: 65ms)
        const shellLatency = 65;
        totalPathLatencyMs = baseLatency + shellLatency;
      }
      
      // CRITICAL: Use actual congestion from route or calculate from shell states
      let congestionIndex = route.congestionIndex;
      if (congestionIndex === undefined) {
        // Calculate from shell congestion (use average of VISIBLE satellites in route)
        const fromSat = visibleSatellites.find(s => 
          Math.abs(s.x - route.fromVec[0]) < 0.01 &&
          Math.abs(s.y - route.fromVec[1]) < 0.01 &&
          Math.abs(s.z - route.fromVec[2]) < 0.01
        );
        const toSat = visibleSatellites.find(s =>
          Math.abs(s.x - route.toVec[0]) < 0.01 &&
          Math.abs(s.y - route.toVec[1]) < 0.01 &&
          Math.abs(s.z - route.toVec[2]) < 0.01
        );
        const avgCongestion = fromSat && toSat
          ? ((fromSat.congestion || 0) + (toSat.congestion || 0)) / 2
          : 0.3; // Default moderate congestion
        congestionIndex = avgCongestion;
      }
      
      const beamState = calculateRoutingBeamState(
        trafficMbps,
        policy,
        totalPathLatencyMs,
        congestionIndex
      );

      newPulses.set(pulseId, {
        id: pulseId,
        routeId: route.id || `route_${idx}`,
        progress: existingPulse?.progress || 0, // ALWAYS start at 0 (fromVec/source satellite)
        speed: beamState.speed,
        color: beamState.color,
        thickness: beamState.thickness,
        jitter: beamState.jitter,
        jitterSeed: existingPulse?.jitterSeed || Math.random() * 1000, // Stable seed
      });
    });

    // Remove pulses for routes that no longer exist
    pulsesRef.current.forEach((pulse, id) => {
      if (!newPulses.has(id)) {
        pulsesRef.current.delete(id);
      }
    });

    // Add new pulses
    newPulses.forEach((pulse, id) => {
      if (!pulsesRef.current.has(id)) {
        pulsesRef.current.set(id, pulse);
      }
    });
  }, [routes, allSatellites.length]); // Re-run when routes or satellite count changes

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);

  // Animate pulses - MUST run every frame
  const frameCount = useRef(0);
  useFrame((state, delta) => {
    frameCount.current++;
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;
    
    if (frameCount.current % 300 === 0) {
      // Log only occasionally
    }
    
    // CRITICAL: Update pulse progress smoothly - MUST update every frame
    if (!simPaused && effectiveDelta > 0 && pulsesRef.current.size > 0) {
      let updated = false;
      pulsesRef.current.forEach((pulse) => {
        // Smooth animation - speed varies with latency (inverse relationship)
        // Lower latency = faster movement (pulse.speed is already calculated as k / latency)
        const oldProgress = pulse.progress;
        pulse.progress += effectiveDelta * pulse.speed; // Speed already encodes latency (no extra multiplier)
        if (pulse.progress > 1) {
          pulse.progress = 0; // Loop back to start at satellite (fromVec)
        }
        // Ensure progress stays in valid range [0, 1]
        // Progress 0 = at fromVec (start satellite), Progress 1 = at toVec (end satellite)
        pulse.progress = Math.max(0, Math.min(1, pulse.progress));
        if (Math.abs(pulse.progress - oldProgress) > 0.0001) {
          updated = true;
        }
      });
      // Trigger re-render only when progress actually changes
      if (updated && frameCount.current % 2 === 0) { // Every other frame for smoothness
        setFrame(f => f + 1);
      }
    }
  });

  useEffect(() => {
      // Routes changed - update pulses
  }, [routes.length]);

  if (routes.length === 0) {
    return null;
  }

  return (
    <>
      {routes.map((route, idx) => {
        const pulse = Array.from(pulsesRef.current.values()).find(p => p.routeId === route.id || p.routeId === `route_${idx}`);
        if (!pulse) return null;

        // CRITICAL: Filter routes to only show those whose satellites are visible
        const visibleSatellites = getVisibleSatellites();
        const visibleSatIds = new Set(visibleSatellites.map(s => s.id));
        
        // Check if route starts from ground (data center) or orbit (satellite)
        const fromVecRadius = Math.sqrt(route.fromVec[0] ** 2 + route.fromVec[1] ** 2 + route.fromVec[2] ** 2);
        const isGroundToOrbit = fromVecRadius < 1.05;
        
        // For ground-to-orbit: check if destination satellite is visible
        // For orbit-to-orbit: check if both satellites are visible
        if (isGroundToOrbit) {
          // Ground-to-orbit: destination satellite must be visible
          if (!route.toSatId || !visibleSatIds.has(route.toSatId)) {
            return null;
          }
        } else {
          // Orbit-to-orbit: both satellites must be visible
          if (!route.fromSatId || !route.toSatId || 
              !visibleSatIds.has(route.fromSatId) || !visibleSatIds.has(route.toSatId)) {
            return null;
          }
        }
        
        // Find the actual satellite objects for position updates
        let fromSat: Satellite | undefined = undefined;
        let toSat: Satellite | undefined = undefined;
        
        if (isGroundToOrbit) {
          // Ground-to-orbit: find destination satellite
          toSat = visibleSatellites.find(s => s.id === route.toSatId);
          if (!toSat) return null;
        } else {
          // Orbit-to-orbit: find both satellites
          fromSat = visibleSatellites.find(s => s.id === route.fromSatId);
          toSat = visibleSatellites.find(s => s.id === route.toSatId);
          if (!fromSat || !toSat) return null;
        }
        
        let fromVec: Vector3;
        let toVec: Vector3;
        
        // CRITICAL: Use matched satellite positions, NOT route's stored positions
        if (isGroundToOrbit) {
          // Ground-to-orbit: fromVec is data center (use route's fromVec), toVec is matched satellite
          fromVec = new Vector3(route.fromVec[0], route.fromVec[1], route.fromVec[2]);
          toVec = new Vector3(toSat.x, toSat.y, toSat.z);
        } else {
          // Orbit-to-orbit: both endpoints are matched satellites
          // TypeScript guard: fromSat is guaranteed to be defined here (checked above)
          if (!fromSat) return null;
          fromVec = new Vector3(fromSat.x, fromSat.y, fromSat.z);
          toVec = new Vector3(toSat.x, toSat.y, toSat.z);
        }
        
        // Validate vectors are valid
        if (!fromVec || !toVec || fromVec.length() === 0 || toVec.length() === 0) {
          return null;
        }
        
        const fromRadius = fromVec.length();
        const toRadius = toVec.length();
        
        // Additional validation: ensure satellite is above Earth
        if (toRadius < 1.05) {
          return null;
        }
        
        // Convert to lat/lon/alt for geodesic calculation
        // Use the corrected xyzToLatLonAlt function for accurate conversion
        const [fromLat, fromLon, fromAltKm] = xyzToLatLonAlt(fromVec.x, fromVec.y, fromVec.z);
        const fromAlt = fromAltKm; // Already in km
        
        const [toLat, toLon, toAltKm] = xyzToLatLonAlt(toVec.x, toVec.y, toVec.z);
        const toAlt = toAltKm; // Already in km
        
        // Create geodesic arc that goes AROUND the globe (not through it)
        // Use the MINIMUM satellite radius to ensure arc stays at orbital level
        const minSatRadius = Math.min(fromRadius, toRadius);
        const maxSatRadius = Math.max(fromRadius, toRadius);
        
        // CRITICAL: Use minimum satellite radius for entire arc to prevent going through Earth
        // Ensure arc stays well above Earth surface (minimum 1.1 = 10% above Earth radius)
        const ARC_RADIUS = Math.max(1.1, minSatRadius); // Use actual satellite radius or 1.1 minimum
        
        // CRITICAL: Store exact CURRENT satellite positions BEFORE any conversion
        // Use the current positions we just looked up (fromVec/toVec), not the stale route positions
        const startEndpoint: [number, number, number] = [fromVec.x, fromVec.y, fromVec.z];
        const endEndpoint: [number, number, number] = [toVec.x, toVec.y, toVec.z];
        
        // Removed debug logging - was causing excessive console spam
        
        // CRITICAL: Pass exact XYZ coordinates directly to createGeodesicArc
        // This prevents rounding errors from XYZ -> lat/lon -> XYZ conversion
        // The function will use these exact coordinates for endpoints
        const arcPoints = createGeodesicArc(
          fromLat, fromLon, fromAlt, 
          toLat, toLon, toAlt, 
          50,
          startEndpoint, // Exact start XYZ
          endEndpoint    // Exact end XYZ
        );
        const points: [number, number, number][] = arcPoints;
        
        // CRITICAL: Verify and force endpoints to be exact
        const startDist = Math.sqrt(
          (points[0][0] - startEndpoint[0]) ** 2 +
          (points[0][1] - startEndpoint[1]) ** 2 +
          (points[0][2] - startEndpoint[2]) ** 2
        );
        const endDist = Math.sqrt(
          (points[points.length - 1][0] - endEndpoint[0]) ** 2 +
          (points[points.length - 1][1] - endEndpoint[1]) ** 2 +
          (points[points.length - 1][2] - endEndpoint[2]) ** 2
        );
        
        // DEBUG: Only log if endpoints are significantly mismatched (removed to reduce console noise)
        // Endpoint mismatches of < 0.02 are acceptable and will be corrected below
        
        // CRITICAL: Force endpoints to be exact (override any rounding errors)
        points[0] = [...startEndpoint] as [number, number, number]; // Create new array to avoid reference issues
        points[points.length - 1] = [...endEndpoint] as [number, number, number];
        
        // CRITICAL: Validate ONLY intermediate points are above Earth
        // NEVER modify endpoints - they must stay at exact satellite positions
        const ABSOLUTE_MIN_RADIUS = 1.1; // Earth is 1.0, so 1.1 is minimum safe (10% above)
        
        for (let i = 1; i < points.length - 1; i++) {
          const point = new Vector3(points[i][0], points[i][1], points[i][2]);
          const radius = point.length();
          
          // If intermediate point is too close to Earth, push it outward
          if (radius < ABSOLUTE_MIN_RADIUS) {
            const direction = point.normalize();
            const safeRadius = Math.max(ARC_RADIUS, ABSOLUTE_MIN_RADIUS);
            points[i] = [
              direction.x * safeRadius,
              direction.y * safeRadius,
              direction.z * safeRadius
            ];
          } else if (radius < ARC_RADIUS) {
            // Point is below arc radius but above minimum - push to arc radius
            const direction = point.normalize();
            points[i] = [
              direction.x * ARC_RADIUS,
              direction.y * ARC_RADIUS,
              direction.z * ARC_RADIUS
            ];
          }
        }
        
        // CRITICAL: Force endpoints AGAIN after validation to ensure they're exact
        // This is redundant but guarantees endpoints are NEVER modified
        points[0] = startEndpoint;
        points[points.length - 1] = endEndpoint;

        // Get position along arc for the moving pulse - smooth interpolation
        // Clamp progress to [0, 1] to ensure valid index
        // Progress 0 = start at fromVec (first satellite), Progress 1 = end at toVec (second satellite)
        const clampedProgress = Math.max(0, Math.min(1, pulse.progress));
        
        // When progress is 0, we're at the start satellite (fromVec)
        // When progress is 1, we're at the end satellite (toVec)
        // CRITICAL: Use matched satellite positions (fromVec/toVec), NOT route's stored positions
        if (clampedProgress <= 0) {
          // At start - use matched satellite position (fromVec), which is points[0]
          const basePos = new Vector3(points[0][0], points[0][1], points[0][2]); // Use first point (matched satellite)
          const nextPoint = new Vector3(...points[Math.min(1, points.length - 1)]);
          const direction = nextPoint.clone().sub(basePos).normalize();
          
          return (
            <group key={route.id || idx}>
              <Line points={points} color={pulse.color} lineWidth={pulse.thickness} transparent opacity={0.8} />
              <group position={basePos}>
                <Arrowhead direction={direction} color={pulse.color} />
              </group>
            </group>
          );
        }
        
        if (clampedProgress >= 1) {
          // At end - use matched satellite position (toVec), which is points[points.length - 1]
          const basePos = new Vector3(points[points.length - 1][0], points[points.length - 1][1], points[points.length - 1][2]); // Use last point (matched satellite)
          const prevPoint = new Vector3(...points[Math.max(0, points.length - 2)]);
          const direction = basePos.clone().sub(prevPoint).normalize();
          
          return (
            <group key={route.id || idx}>
              <Line points={points} color={pulse.color} lineWidth={pulse.thickness} transparent opacity={0.8} />
              <group position={basePos}>
                <Arrowhead direction={direction} color={pulse.color} />
              </group>
            </group>
          );
        }
        
        // Smooth interpolation between points instead of discrete jumps
        const exactIndex = clampedProgress * (points.length - 1);
        const pointIndex = Math.floor(exactIndex);
        const nextIndex = Math.min(pointIndex + 1, points.length - 1);
        const t = exactIndex - pointIndex;
        
        // Interpolate between two points for smooth movement
        const currentPoint = new Vector3(...points[pointIndex]);
        const nextPoint = new Vector3(...points[nextIndex]);
        const basePos = currentPoint.clone().lerp(nextPoint, t);
        
        // Calculate direction for arrowhead FIRST (from actual arc, not jittered position)
        // This ensures arrowhead always points along the arc
        const direction = nextPoint.clone().sub(currentPoint).normalize();
        
        // CRITICAL: Apply jitter to position based on congestion
        // Higher congestion = more jitter (unstable, shaky appearance)
        // Jitter is perpendicular to arc direction to maintain visual connection
        // REDUCED jitter to prevent excessive shaking - only show jitter for high congestion
        const jitterAmount = pulse.jitter; // Already calculated from congestion (congestionIndex² × maxOffset)
        
        // Only apply jitter if congestion is high (jitter > 0.05) and use smoother, slower oscillation
        let pos = basePos;
        if (jitterAmount > 0.05) {
          // Use slower, smoother oscillation to reduce shaking
          const jitterPhase = (pulse.progress * 2 + (pulse.jitterSeed || 0)) % (Math.PI * 2); // Slower: 2 instead of 10
          const jitterScale = Math.min(jitterAmount, 0.02); // Cap jitter at 0.02 to prevent excessive shaking
          
          // Calculate perpendicular direction for jitter (don't jitter along arc, jitter perpendicular)
          const arcDirection = nextPoint.clone().sub(currentPoint).normalize();
          const up = new Vector3(0, 1, 0);
          let perpendicular = arcDirection.clone().cross(up).normalize();
          if (perpendicular.length() < 0.1) {
            // If arc is vertical, use different perpendicular
            const right = new Vector3(1, 0, 0);
            perpendicular = arcDirection.clone().cross(right).normalize();
          }
          
          // Apply smooth jitter perpendicular to arc
          const jitterOffset = perpendicular.multiplyScalar(Math.sin(jitterPhase) * jitterScale);
          pos = basePos.clone().add(jitterOffset);
        }

        return (
          <group key={route.id || idx}>
            {/* Arc line - thickness encodes traffic load */}
            <Line
              points={points}
              color={pulse.color}
              lineWidth={pulse.thickness}
              transparent
              opacity={0.8}
            />
            {/* Moving pulse with arrowhead - flush with arc */}
            <group position={pos}>
              {/* Arrowhead pointing in direction of travel - use stable direction */}
              <Arrowhead direction={direction} color={pulse.color} />
            </group>
          </group>
        );
      })}
    </>
  );
}

