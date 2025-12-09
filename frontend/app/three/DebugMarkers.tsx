"use client";

import { useOrbitSim, type Satellite } from "../state/orbitStore";
import { Vector3 } from "three";

/**
 * Debug component to visualize satellite positions and route endpoints
 * This helps verify that arcs are starting/stopping at the correct positions
 * CRITICAL: Uses matched satellite positions (same logic as TrafficFlows)
 */
export function DebugMarkers() {
  const { satellites, routes } = useOrbitSim();
  
  // Only show in dev mode
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <>
      {/* Render satellite positions as small red spheres (debug only) */}
      {satellites.map((sat) => (
        <mesh key={`sat-debug-${sat.id}`} position={[sat.x, sat.y, sat.z]}>
          <sphereGeometry args={[0.0001, 6, 6]} />
          <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2.0} />
        </mesh>
      ))}
      
      {/* Render route endpoints as green (from) and blue (to) spheres */}
      {/* CRITICAL: Use matched satellite positions, NOT route's stored positions */}
      {routes.map((route, idx) => {
        if (satellites.length === 0) return null;
        
        // Find closest satellite to route's stored fromVec (same logic as TrafficFlows)
        let closestFromDist = Infinity;
        let fromSat: Satellite | null = null;
        for (const sat of satellites) {
          const dist = Math.sqrt(
            (sat.x - route.fromVec[0]) ** 2 +
            (sat.y - route.fromVec[1]) ** 2 +
            (sat.z - route.fromVec[2]) ** 2
          );
          if (dist < closestFromDist) {
            closestFromDist = dist;
            fromSat = sat;
          }
        }
        
        // Find closest satellite to route's stored toVec
        let closestToDist = Infinity;
        let toSat: Satellite | null = null;
        for (const sat of satellites) {
          const dist = Math.sqrt(
            (sat.x - route.toVec[0]) ** 2 +
            (sat.y - route.toVec[1]) ** 2 +
            (sat.z - route.toVec[2]) ** 2
          );
          if (dist < closestToDist) {
            closestToDist = dist;
            toSat = sat;
          }
        }
        
        // Use matched satellite positions
        if (fromSat === null || toSat === null) return null;
        
        const fromVec = new Vector3(fromSat.x, fromSat.y, fromSat.z);
        const toVec = new Vector3(toSat.x, toSat.y, toSat.z);
        
        return (
          <group key={`route-debug-${route.id || idx}`}>
            {/* Green sphere at route start - should overlap red sphere */}
            {/* Smaller and semi-transparent so red sphere is visible inside */}
            <mesh position={fromVec}>
              <sphereGeometry args={[0.0001, 6, 6]} />
              <meshStandardMaterial 
                color="#00ff00" 
                emissive="#00ff00" 
                emissiveIntensity={2.0}
                transparent
                opacity={0.5}
              />
            </mesh>
            {/* Blue sphere at route end - should overlap red sphere */}
            {/* Smaller and semi-transparent so red sphere is visible inside */}
            <mesh position={toVec}>
              <sphereGeometry args={[0.0001, 6, 6]} />
              <meshStandardMaterial 
                color="#0000ff" 
                emissive="#0000ff" 
                emissiveIntensity={2.0}
                transparent
                opacity={0.5}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

