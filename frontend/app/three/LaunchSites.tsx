"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, Vector3 } from "three";
import { latLngToVec3 } from "../lib/three/coordinateUtils";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useOrbitSim } from "../state/orbitStore";

export const LAUNCH_SITES = [
  { id: "capecanaveral", lat: 28.5623, lon: -80.5774, name: "Cape Canaveral", color: "#ff0000" }, // SLC-40, Florida - RED
  { id: "vandenberg", lat: 34.7420, lon: -120.5724, name: "Vandenberg", color: "#00ff00" }, // LC-576E, California - GREEN
  { id: "bocachica", lat: 25.9971, lon: -97.1554, name: "Boca Chica", color: "#0000ff" }, // Starbase, Texas - BLUE
];

interface LaunchSiteState {
  pulsePhase: number;
  isLaunching: boolean;
  isFailed: boolean;
  lastLaunchTime: number;
}

export function LaunchSites() {
  const sitesRef = useRef<Map<string, Mesh>>(new Map());
  const statesRef = useRef<Map<string, LaunchSiteState>>(new Map());
  const lastDeployedUnitsRef = useRef<Set<string>>(new Set());

  // Initialize states
  useEffect(() => {
    LAUNCH_SITES.forEach((site) => {
      statesRef.current.set(site.id, {
        pulsePhase: 0,
        isLaunching: false,
        isFailed: false,
        lastLaunchTime: 0,
      });
    });
  }, []);

  // Detect launches
  useEffect(() => {
    let lastDeployedHash = "";
    
    const unsubscribe = useOrbitalUnitsStore.subscribe((state) => {
      const deployedUnits = state.units.filter(u => u.status === "deployed" && u.deployedAt);
      const deployedHash = deployedUnits.map(u => u.id).join(",");
      
      if (deployedHash === lastDeployedHash) return;
      lastDeployedHash = deployedHash;
      
      const currentDeployedIds = new Set(deployedUnits.map(u => u.id));
      const newDeployments = deployedUnits.filter(u => !lastDeployedUnitsRef.current.has(u.id));

      newDeployments.forEach((unit) => {
        // Find launch site (use first one for now, could be based on unit location)
        const launchSite = LAUNCH_SITES[0];
        const state = statesRef.current.get(launchSite.id);
        if (state) {
          state.isLaunching = true;
          state.lastLaunchTime = Date.now();
          state.isFailed = false;
          // Reset pulse after 2 seconds
          setTimeout(() => {
            state.isLaunching = false;
          }, 2000);
        }
      });

      lastDeployedUnitsRef.current = currentDeployedIds;
    });

    return () => unsubscribe();
  }, []);

  // Get simulation time state - use separate selectors to avoid infinite loops
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);

  // Animate pulses
  useFrame((state, delta) => {
    const effectiveDelta = simPaused ? 0 : delta * simSpeed;
    statesRef.current.forEach((siteState, siteId) => {
      if (siteState.isLaunching) {
        siteState.pulsePhase += effectiveDelta * 5; // Fast pulse during launch
      } else {
        siteState.pulsePhase += effectiveDelta * 0.5; // Slow idle pulse
      }
      
      const mesh = sitesRef.current.get(siteId);
      if (mesh) {
        const pulse = Math.sin(siteState.pulsePhase) * 0.3 + 0.7;
        const scale = siteState.isLaunching ? 1.5 * pulse : 1.0 * pulse;
        mesh.scale.set(scale, scale, scale);
      }
    });
  });

  useEffect(() => {
    console.log(`[LaunchSites] Rendering ${LAUNCH_SITES.length} launch sites`);
  }, []);

  return (
    <>
      {LAUNCH_SITES.map((site) => {
        // MARKER PLACEMENT - HARD RULES
        const globeRadius = 1.0;
        const markerOffset = 0.002; // Small offset above surface
        const [x, y, z] = latLngToVec3(site.lat, site.lon, globeRadius + markerOffset);
        
        // Debug: log ALL launch sites for verification
        console.log(`[LaunchSites] ${site.name}: lat=${site.lat.toFixed(2)}°, lon=${site.lon.toFixed(2)}° -> xyz=[${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}]`);
        const state = statesRef.current.get(site.id);
        // All launch sites use the same color (orange)
        const color = state?.isFailed ? "#ff0000" : "#ff8800"; // Orange for all launch sites

        return (
          <mesh
            key={site.id}
            ref={(ref) => {
              if (ref) {
                sitesRef.current.set(site.id, ref);
                // MARKER PLACEMENT RULE: marker.lookAt(globeCenter) - required to prevent tilting
                const globeCenter = new Vector3(0, 0, 0);
                ref.lookAt(globeCenter);
                // Add userData for click detection
                ref.userData.siteId = site.id;
                ref.userData.siteName = site.name;
                ref.userData.siteType = "launch_site";
              }
            }}
            position={[x, y, z]}
            renderOrder={1000}
          >
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshStandardMaterial
              color={color}
              transparent={false}
              opacity={1.0}
              emissive={color}
              emissiveIntensity={8.0}
              depthWrite={true}
              depthTest={true}
            />
          </mesh>
        );
      })}
    </>
  );
}

