/**
 * Launch Arc Animation (Temporal Bezier)
 * Launches are animated bezier arcs over time, not static splines
 */

"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, CatmullRomCurve3, CubicBezierCurve3 } from "three";
import { Line } from "@react-three/drei";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useOrbitSim } from "../state/orbitStore";
import { latLonAltToXYZ } from "../lib/three/coordinateUtils";
import { LAUNCH_SITES } from "./LaunchSites";
import { 
  assignSatelliteToShell, 
  getAltitudeForShell,
  type ShellDistribution 
} from "../lib/orbitSim/deploymentSchedule";
import { 
  generateOrbitalState,
  getRandomInclination,
  calculateOrbitalPosition
} from "../lib/orbitSim/orbitalMechanics";
import { useOrbitSim, type Satellite } from "../state/orbitStore";

interface LaunchArc {
  id: string;
  launchSite: { lat: number; lon: number };
  targetShell: ShellDistribution;
  insertionPoint: Vector3;
  progress: number; // 0 to 1
  duration: number; // seconds
  startTime: number; // timestamp
  satsPerLaunch: number;
  curve: CatmullRomCurve3;
  completed: boolean;
}

const LAUNCH_SITES_LIST = [
  { lat: 28.5623, lon: -80.5774, name: "Cape Canaveral" }, // SLC-40
  { lat: 25.9971, lon: -97.1554, name: "Boca Chica" }, // SpaceX Starbase
  { lat: 5.2397, lon: -52.7686, name: "Kourou" }, // Guiana Space Centre
  { lat: 13.7333, lon: 80.2500, name: "India" }, // Sriharikota
  { lat: 39.5426, lon: 121.4558, name: "China" }, // Jiuquan
];

export function LaunchAnimationV2() {
  const launchesRef = useRef<Map<string, LaunchArc>>(new Map());
  const lastDeployedUnitsRef = useRef<Set<string>>(new Set());

  // Detect new deployments and create launch arcs
  useEffect(() => {
    const unsubscribe = useOrbitalUnitsStore.subscribe((state) => {
      const deployedUnits = state.units.filter(u => u.status === "deployed" && u.deployedAt);
      const currentDeployedIds = new Set(deployedUnits.map(u => u.id));
      
      const newDeployments = deployedUnits.filter(u => !lastDeployedUnitsRef.current.has(u.id));
      
      if (newDeployments.length > 0) {
        newDeployments.forEach((unit) => {
          if (unit.type === "leo_pod") {
            // Pick launch site
            const launchSiteIndex = unit.id.charCodeAt(0) % LAUNCH_SITES_LIST.length;
            const launchSite = LAUNCH_SITES_LIST[launchSiteIndex];
            
            // Assign to shell based on deployment schedule
            const shell = assignSatelliteToShell(
              launchesRef.current.size,
              deployedUnits.length
            );
            const altitude = getAltitudeForShell(shell);
            
            // Target insertion point (random position in shell)
            const targetLat = launchSite.lat + (Math.random() - 0.5) * 30;
            const targetLon = launchSite.lon + (Math.random() - 0.5) * 60;
            const [toX, toY, toZ] = latLonAltToXYZ(targetLat, targetLon, altitude);
            const insertionPoint = new Vector3(toX, toY, toZ);
            
            // Launch site position
            const [fromX, fromY, fromZ] = latLonAltToXYZ(launchSite.lat, launchSite.lon, 0);
            const from = new Vector3(fromX, fromY, fromZ);
            
            // Mid-arc point (high above Earth)
            const midPoint = from.clone().add(insertionPoint).multiplyScalar(0.5);
            const normal = from.clone().cross(insertionPoint).normalize();
            const arcHeight = 0.5; // Higher arc
            const midArc = midPoint.clone().add(normal.multiplyScalar(arcHeight));
            
            // Create bezier curve
            const curve = new CatmullRomCurve3([from, midArc, insertionPoint]);
            
            const launchDuration = 4 + Math.random() * 2; // 4-6 seconds
            const currentTime = useOrbitSim.getState().simTime;
            
            launchesRef.current.set(unit.id, {
              id: unit.id,
              launchSite,
              targetShell: shell,
              insertionPoint,
              progress: 0,
              duration: launchDuration,
              startTime: currentTime,
              satsPerLaunch: 60, // Starship capacity
              curve,
              completed: false,
            });
          }
        });
      }
      
      lastDeployedUnitsRef.current = currentDeployedIds;
    });
    
    return () => unsubscribe();
  }, []);

  // Animate launches and spawn satellites
  useFrame((state, delta) => {
    const { simPaused, simSpeed, simTime } = useOrbitSim.getState();
    if (simPaused) return;
    
    const effectiveDelta = delta * simSpeed;
    
    for (const [launchId, launch] of launchesRef.current.entries()) {
      // Update progress
      const elapsed = simTime - launch.startTime;
      launch.progress = Math.min(1, elapsed / launch.duration);
      
      // Check if launch completed
      if (launch.progress >= 1 && !launch.completed) {
        launch.completed = true;
        
        // Spawn satellites at insertion point
        // Note: This will be handled by OrbitalDataSync when it detects the deployment
        // We just mark the launch as completed here
        
        // Remove completed launch
        launchesRef.current.delete(launchId);
      }
    }
  });

  // Render launch arcs
  return (
    <>
      {Array.from(launchesRef.current.values()).map((launch) => {
        if (launch.progress <= 0) return null;
        
        // Generate trail points
        const numPoints = 30;
        const trailPoints: [number, number, number][] = [];
        
        for (let i = 0; i <= numPoints; i++) {
          const t = (i / numPoints) * launch.progress;
          const point = launch.curve.getPoint(t);
          trailPoints.push([point.x, point.y, point.z]);
        }
        
        // Current position
        const currentPos = launch.curve.getPoint(launch.progress);
        
        // Arc color based on target shell
        const shellColors = {
          "LEO-1": "#4a90e2", // Blue
          "LEO-2": "#f5a623", // Orange
          "LEO-3": "#bd10e0", // Purple
        };
        const arcColor = shellColors[launch.targetShell.shell] || "#ff6600";
        
        // Arc thickness based on payload mass (satsPerLaunch)
        const arcThickness = 4 + (launch.satsPerLaunch / 60) * 4; // 4-8 based on capacity
        
        return (
          <group key={launch.id}>
            {/* Launch trail arc */}
            {trailPoints.length > 1 && (
              <Line
                points={trailPoints}
                color={arcColor}
                lineWidth={arcThickness}
                transparent
                opacity={0.9}
              />
            )}
            
            {/* Launch vehicle (cone) */}
            <mesh position={currentPos}>
              <coneGeometry args={[0.1, 0.3, 12]} />
              <meshStandardMaterial
                color={arcColor}
                emissive={arcColor}
                emissiveIntensity={5.0}
                depthWrite={true}
                depthTest={true}
              />
            </mesh>
            
            {/* Explosion ring on insertion */}
            {launch.progress >= 0.95 && (
              <mesh position={launch.insertionPoint}>
                <ringGeometry args={[0.15, 0.2, 32]} />
                <meshStandardMaterial
                  color="#ffff00"
                  emissive="#ffff00"
                  emissiveIntensity={3.0}
                  transparent
                  opacity={1 - launch.progress}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

