"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Vector3, CatmullRomCurve3 } from "three";
import { latLonAltToXYZ, createGeodesicArc, xyzToLatLonAlt } from "../lib/three/coordinateUtils";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim, type Satellite } from "../state/orbitStore";
import { LAUNCH_SITES } from "./LaunchSites";
import { generateOrbitalState, getRandomInclination } from "../lib/orbitSim/orbitalMechanics";
import { generateSatellitePosition, getShellFromAltitude, type ShellType } from "../lib/orbitSim/satellitePositioning";

interface Launch {
  id: string;
  from: Vector3;
  to: Vector3;
  curve: CatmullRomCurve3;
  progress: number;
  duration: number;
  startTime: number;
  phase: "rise" | "arc" | "insertion";
  shell: 1 | 2 | 3;
  completed?: boolean; // Track if satellites have been spawned
}

export function LaunchAnimation() {
  const launchesRef = useRef<Map<string, Launch>>(new Map());
  const lastDeployedUnitsRef = useRef<Set<string>>(new Set());

  // Detect new deployments and create launch animations
  useEffect(() => {
    
    const unsubscribe = useOrbitalUnitsStore.subscribe((state) => {
      const allUnits = state.units;
      const deployedUnits = allUnits.filter(u => u.status === "deployed" && u.deployedAt);
      const currentDeployedIds = new Set(deployedUnits.map(u => u.id));
      
      // Debug: log only when new deployments detected
      
      // Find NEW deployments (ones we haven't seen before)
      const newDeployments = deployedUnits.filter(u => !lastDeployedUnitsRef.current.has(u.id));

      if (newDeployments.length > 0) {
        newDeployments.forEach((unit) => {
        if (unit.type === "leo_pod") {
          // Orange arcs should come from Texas (Boca Chica)
          // Find Texas launch site (Boca Chica)
          const texasSite = LAUNCH_SITES.find(site => site.id === "bocachica");
          // Use Texas for all launches (orange arcs)
          const launchSite = texasSite || LAUNCH_SITES[0]; // Fallback to first site if Texas not found
          const [fromX, fromY, fromZ] = latLonAltToXYZ(launchSite.lat, launchSite.lon, 0);
          const from = new Vector3(fromX, fromY, fromZ);

          // Target orbit position (550km altitude, spread around launch site)
          // Use same random seed as satellite placement for consistency, but spread out more
          const randomSeed = unit.id.charCodeAt(0);
          // Spread satellites more widely around the globe
          const latOffset = ((randomSeed % 100) / 100 - 0.5) * 60; // ±30 degrees latitude
          const lonOffset = (((randomSeed * 7) % 100) / 100 - 0.5) * 120; // ±60 degrees longitude
          const targetLat = Math.max(-85, Math.min(85, launchSite.lat + latOffset));
          const targetLon = (launchSite.lon + lonOffset + 180) % 360 - 180; // Normalize to [-180, 180]
          const [toX, toY, toZ] = latLonAltToXYZ(targetLat, targetLon, 550);
          const to = new Vector3(toX, toY, toZ);
          
          // Create great-circle arc that stays above Earth's surface
          // Use geodesic arc calculation to ensure all points stay above Earth
          const fromLat = launchSite.lat;
          const fromLon = launchSite.lon;
          const fromAlt = 0; // Ground level
          const toAlt = 550; // Target altitude in km
          
          // Generate points along a geodesic arc that stays above Earth
          const arcPoints = createGeodesicArc(fromLat, fromLon, fromAlt, targetLat, targetLon, toAlt, 30);
          const curvePoints = arcPoints.map(([x, y, z]) => new Vector3(x, y, z));
          
          // Ensure first point is exactly at launch site and last is at target
          curvePoints[0] = from;
          curvePoints[curvePoints.length - 1] = to;
          
          const curve = new CatmullRomCurve3(curvePoints);

          const currentSimTime = useOrbitSim.getState().simTime;
          const duration = 3000 + Math.random() * 2000; // 3-5 seconds in milliseconds
          launchesRef.current.set(unit.id, {
            id: unit.id,
            from,
            to,
            curve,
            progress: 0,
            duration: duration,
            startTime: currentSimTime, // Use sim time directly (already in seconds)
            phase: "rise",
            shell: 1, // LEO-1
          });
        }
      });
      }

      // Update tracked deployments
      lastDeployedUnitsRef.current = currentDeployedIds;
    });

    // Also check immediately on mount - don't create launches for existing units
    // Only track them so we don't create duplicate launches
    const initialState = useOrbitalUnitsStore.getState();
    const initialDeployed = initialState.units.filter(u => u.status === "deployed" && u.deployedAt);
    initialDeployed.forEach(u => lastDeployedUnitsRef.current.add(u.id));

    return () => unsubscribe();
  }, []);

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);
  const simTime = useOrbitSim((s) => s.simTime);

  // Animate launches
  const frameCount = useRef(0);
  useFrame((state, delta) => {
    frameCount.current++;
    const toRemove: string[] = [];
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;

    // Log only occasionally

    launchesRef.current.forEach((launch, id) => {
      // Use simulation time - startTime is already in simTime units (seconds)
      const elapsed = simTime - launch.startTime;
      if (elapsed < 0) {
        // Launch hasn't started yet
        return;
      }

      // Duration is in milliseconds, convert to seconds
      const durationSeconds = launch.duration / 1000;
      launch.progress = Math.min(elapsed / durationSeconds, 1);
      
      // Ensure launch starts at from position (progress=0) and ends at to position (progress=1)
      if (launch.progress <= 0) {
        launch.progress = 0; // Start at launch site
      } else if (launch.progress >= 1) {
        launch.progress = 1; // End at orbit
      }

      // Phase transitions
      if (launch.progress < 0.3) {
        launch.phase = "rise";
      } else if (launch.progress < 0.7) {
        launch.phase = "arc";
      } else {
        launch.phase = "insertion";
      }

      if (launch.progress >= 1 && !launch.completed) {
        // Launch completed - spawn satellites at insertion point using physically coherent positioning
        launch.completed = true;
        
        // Launch Impact Blink: Flash at insertion point
        const insertionPoint = launch.to;
        // Trigger visual blink effect (would be handled by VisualEffects component)
        // For now, we'll emit a custom event that can be caught by other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('launch-impact', {
            detail: { position: insertionPoint, launchId: launch.id }
          }));
        }
        const [lat, lon, alt] = xyzToLatLonAlt(insertionPoint.x, insertionPoint.y, insertionPoint.z);
        
        // Determine shell type from altitude
        const shellType = getShellFromAltitude(alt);
        
        // Get existing satellites for angular spacing
        const currentSats = useOrbitSim.getState().satellites;
        const existingPositions = currentSats.map(sat => {
          const [satLat, satLon, satAlt] = xyzToLatLonAlt(sat.x, sat.y, sat.z);
          return {
            lat: satLat,
            lon: satLon,
            shell: getShellFromAltitude(satAlt) as ShellType,
          };
        });
        
        // Spawn 60 satellites per launch (Starship capacity)
        const satsPerLaunch = 60;
        const newSats: Satellite[] = [];
        
        for (let i = 0; i < satsPerLaunch; i++) {
          // Generate position using physically coherent positioning
          const position = generateSatellitePosition(shellType, existingPositions);
          
          if (position) {
            // Create orbital state for this satellite
            const orbitalState = generateOrbitalState(position.alt, getRandomInclination());
            orbitalState.theta = position.lon * (Math.PI / 180);
            
            // Determine satellite class and shell name for naming
            const timeline = useSimulationStore.getState().timeline;
            const currentYear = timeline && timeline.length > 0 ? timeline[timeline.length - 1]?.year || 2025 : 2025;
            const isSSO = shellType === "SSO" || (position.alt >= 800 && position.alt <= 1000);
            const satelliteClass = (currentYear >= 2030 && isSSO) ? "B" : "A";
            
            // Map shellType to naming schema shell name
            type ShellName = "LOW" | "MID" | "HIGH" | "SSO";
            let namingShellName: ShellName;
            if (shellType === "SSO") namingShellName = "SSO";
            else if (position.alt < 400) namingShellName = "LOW";
            else if (position.alt < 800) namingShellName = "MID";
            else namingShellName = "HIGH";
            
            // Generate satellite ID using the new schema
            // Use a module-level counter shared across launches
            const key = `${satelliteClass}-${namingShellName}-${currentYear}`;
            const currentSeq = (window as any).__satelliteSequenceCounters?.get(key) || 0;
            const nextSeq = currentSeq + 1;
            if (!(window as any).__satelliteSequenceCounters) {
              (window as any).__satelliteSequenceCounters = new Map<string, number>();
            }
            (window as any).__satelliteSequenceCounters.set(key, nextSeq);
            const sequenceStr = nextSeq.toString().padStart(5, '0');
            const satelliteId = `${satelliteClass}-${namingShellName}-${currentYear}-${sequenceStr}`;
            
            newSats.push({
              x: position.x,
              y: position.y,
              z: position.z,
              id: satelliteId,
              congestion: 0,
              shell: launch.shell,
              orbitalState,
            });
            
            // Add to existing positions for next satellite
            existingPositions.push({
              lat: position.lat,
              lon: position.lon,
              shell: shellType,
            });
          }
        }
        
        // Add all satellites to orbit store
        if (newSats.length > 0) {
          useOrbitSim.setState({
            satellites: [...currentSats, ...newSats],
          });
        }
        
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => launchesRef.current.delete(id));
  });

  return (
    <>
      {Array.from(launchesRef.current.values()).map((launch) => {
        const pos = launch.curve.getPoint(launch.progress);
        const scale = launch.phase === "insertion" ? 0.01 * (1 - launch.progress * 0.5) : 0.02;
        const opacity = launch.phase === "insertion" ? 1 - (launch.progress - 0.7) * 3.33 : 1;

        // Create trail points showing the path traveled - ALWAYS start at launch site (from)
        const trailPoints: [number, number, number][] = [];
        // Always include the start point (launch site)
        trailPoints.push([launch.from.x, launch.from.y, launch.from.z]);
        
        const numTrailPoints = Math.max(10, Math.floor(launch.progress * 50));
        for (let i = 1; i <= numTrailPoints; i++) {
          const t = (i / numTrailPoints) * launch.progress;
          const trailPos = launch.curve.getPoint(t);
          trailPoints.push([trailPos.x, trailPos.y, trailPos.z]);
        }
        
        // Ensure current position is included if progress > 0
        if (launch.progress > 0) {
          trailPoints.push([pos.x, pos.y, pos.z]);
        }

        return (
          <group key={launch.id}>
            {/* Launch trail arc - show the path from launch site to current position */}
            {launch.progress > 0.01 && trailPoints.length > 1 && (
              <Line
                points={trailPoints}
                color="#ff6600"
                lineWidth={8}
                transparent
                opacity={1.0}
              />
            )}
            {/* Launch vehicle (cone) - starts at launch site, moves to orbit */}
            <mesh position={pos} scale={scale}>
              <coneGeometry args={[0.08, 0.25, 12]} />
              <meshStandardMaterial
                color="#ff6600"
                transparent
                opacity={opacity}
                emissive="#ff6600"
                emissiveIntensity={5.0}
                depthWrite={true}
                depthTest={true}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

