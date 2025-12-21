import { create } from "zustand";
import { Vector3 } from "three";
import { latLonAltToXYZ, createArcPoints } from "../lib/three/coordinateUtils";
import type { Satellite as SimSatellite } from "../store/simStore";
import type { RouterPolicy } from "../lib/ai/routerTypes";
import { calculateOrbitalPosition } from "../lib/orbitSim/orbitalMechanics";

export interface OrbitalState {
  altitudeRadius: number; // km
  inclination: number; // radians
  theta: number; // radians (current position in orbit)
  orbitalPeriod: number; // seconds
  launchTime: number; // timestamp when launched
}

export interface Satellite {
  x: number;
  y: number;
  z: number;
  id: string;
  congestion?: number;
  shell?: 1 | 2 | 3;
  // NEW: Orbital mechanics state
  orbitalState?: OrbitalState;
  // NEW: Pod type for coloring
  podType?: "compute" | "relay" | "storage";
  // NEW: Satellite class (A or B)
  satelliteClass?: "A" | "B";
}

export interface Route {
  fromVec: [number, number, number];
  toVec: [number, number, number];
  id: string;
  type?: "edge" | "core" | "orbit";
  // NEW: Route metrics for visual encoding
  latencyMs?: number;
  congestionIndex?: number;
  trafficMbps?: number;
  // NEW: Satellite IDs for filtering visible routes
  fromSatId?: string; // For orbit-to-orbit routes
  toSatId?: string; // For all routes with satellite endpoints
}

interface OrbitSimState {
  year: number;
  satellites: Satellite[];
  routes: Route[];
  futures: any[];
  simPaused: boolean;
  simSpeed: number; // 1 = normal, 2 = 2x, etc.
  simTime: number; // Accumulated simulation time in seconds
  showComputeRoutes: boolean; // Toggle for compute routes visualization (auto off)
  recompute: () => void;
  updateSatellites: (sats: SimSatellite[]) => void;
  updateRoutes: (policy: RouterPolicy | null, satellites: Satellite[]) => void;
  calculateRouteMetrics: (route: Route, fromSat: Satellite, toSat: Satellite) => { latencyMs: number; congestionIndex: number; trafficMbps: number };
  setSimPaused: (paused: boolean) => void;
  setSimSpeed: (speed: number) => void;
  updateSimTime: (delta: number) => void;
  setShowComputeRoutes: (show: boolean) => void;
}

export const useOrbitSim = create<OrbitSimState>((set, get) => ({
  year: 2025,
  satellites: [],
  routes: [],
  futures: [],
  simPaused: false,
  simSpeed: 1.0,
  simTime: 0,
  showComputeRoutes: false, // Auto off by default
  recompute: () => {
    // recompute sats → routes → futures → charts
    set((state) => ({ ...state }));
  },
  setSimPaused: (paused: boolean) => {
    set({ simPaused: paused });
  },
  setSimSpeed: (speed: number) => {
    set({ simSpeed: Math.max(0.1, Math.min(10, speed)) }); // Clamp between 0.1x and 10x
  },
  updateSimTime: (delta: number) => {
    const { simPaused, simSpeed } = get();
    if (!simPaused) {
      set((state) => ({ simTime: state.simTime + delta * simSpeed }));
    }
  },
  setShowComputeRoutes: (show: boolean) => {
    set({ showComputeRoutes: show });
  },
  updateSatellites: (sats: SimSatellite[]) => {
    const currentState = get();
    const currentSatellites = currentState.satellites;
    const hasDeployedSats = currentSatellites.some(s => s.id.startsWith("deployed_"));
    
    // CRITICAL: Never clear satellites if we have ANY satellites (not just deployed)
    // This prevents accidental clearing during component remounts
    if ((!sats || sats.length === 0) && currentSatellites.length > 0) {
      console.error(`[orbitStore] 🚨 BLOCKED: updateSatellites called with empty array but ${currentSatellites.length} satellites exist (${hasDeployedSats ? 'including deployed' : 'no deployed'}). Ignoring to prevent data loss.`);
      return;
    }
    
    if (!sats || sats.length === 0) {
      // Only allow clearing if there are truly no satellites
      if (currentSatellites.length === 0) {
        console.log("[orbitStore] updateSatellites called with empty array (no satellites to clear)");
        set({ satellites: [] });
      }
      return;
    }
    
    // CRITICAL: If we have ANY satellites and the new array has fewer, check for data loss
    if (currentSatellites.length > 0 && sats.length < currentSatellites.length) {
      const currentIds = new Set(currentSatellites.map(s => s.id));
      const newIds = new Set(sats.map(s => s.id));
      const missingIds = Array.from(currentIds).filter(id => !newIds.has(id));
      const deployedMissing = missingIds.filter(id => id.startsWith("deployed_"));
      
      // Block if we would lose ANY deployed satellites
      if (deployedMissing.length > 0) {
        console.error(`[orbitStore] 🚨 BLOCKED: Would lose ${deployedMissing.length} deployed satellites (${missingIds.length} total). Current: ${currentSatellites.length}, New: ${sats.length}. Ignoring update.`);
        return;
      }
      
      // Block if we would lose more than 10% of satellites (likely a bug)
      const lossPercentage = (missingIds.length / currentSatellites.length) * 100;
      if (lossPercentage > 10) {
        console.error(`[orbitStore] 🚨 BLOCKED: Would lose ${lossPercentage.toFixed(1)}% of satellites (${missingIds.length} of ${currentSatellites.length}). This likely indicates a bug. Ignoring update.`);
        return;
      }
    }
    
    const satellites: Satellite[] = sats.map((sat) => {
      // Use orbital state if available, otherwise calculate from lat/lon/alt
      // CRITICAL: Check for explicit x, y, z coordinates first (from generateSatellitePosition)
      let x: number, y: number, z: number;
      let orbitalState: OrbitalState | undefined;
      
      if ((sat as any).x !== undefined && (sat as any).y !== undefined && (sat as any).z !== undefined) {
        // Use explicit x, y, z coordinates (most reliable)
        x = (sat as any).x;
        y = (sat as any).y;
        z = (sat as any).z;
        orbitalState = (sat as any).orbitalState;
      } else if ((sat as any).orbitalState) {
        // Use orbital state to calculate position
        orbitalState = (sat as any).orbitalState;
        if (orbitalState) {
          [x, y, z] = calculateOrbitalPosition(
            orbitalState.altitudeRadius,
            orbitalState.inclination,
            orbitalState.theta
          );
        } else {
          // Fallback to lat/lon/alt if orbitalState is undefined
          [x, y, z] = latLonAltToXYZ(sat.lat, sat.lon, sat.alt_km);
        }
      } else {
        // Fallback to lat/lon/alt conversion
        [x, y, z] = latLonAltToXYZ(sat.lat, sat.lon, sat.alt_km);
      }
      
      // Determine shell from altitude
      let shell: 1 | 2 | 3 = 1;
      if (sat.alt_km >= 800) {
        shell = 3; // LEO-3
      } else if (sat.alt_km >= 500) {
        shell = 2; // LEO-2
      } else {
        shell = 1; // LEO-1
      }
      
      // Assign pod type based on satellite ID or random distribution
      // For now, use a simple hash-based assignment
      const podTypeHash = sat.id.charCodeAt(0) % 3;
      let podType: "compute" | "relay" | "storage" = "compute";
      if (podTypeHash === 1) podType = "relay";
      else if (podTypeHash === 2) podType = "storage";
      
      // Get satellite class from satellite data (if available)
      const satelliteClass = (sat as any).satelliteClass || ((sat as any).alt_km >= 800 ? "B" : "A"); // SSO orbits (800km+) are Class B
      
      return {
        x,
        y,
        z,
        id: sat.id,
        congestion: sat.utilization,
        shell,
        orbitalState,
        podType, // NEW: Add pod type for coloring
        satelliteClass, // NEW: Add satellite class (A or B)
      };
    });
    
    set({ satellites });
  },
  updateRoutes: (policy: RouterPolicy | null, satellites: Satellite[]) => {
    if (!policy || satellites.length === 0) {
      set({ routes: [] });
      return;
    }
    
    // CRITICAL: Filter out satellites with invalid positions
    // Only use satellites that have valid x, y, z coordinates and are above Earth
    const validSatellites = satellites.filter(sat => {
      if (sat.x === undefined || sat.y === undefined || sat.z === undefined) {
        return false;
      }
      const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
      // Ensure satellite is above Earth (radius > 1.0, ideally > 1.05 for safety)
      return radius > 1.05;
    });
    
    if (validSatellites.length < 2) {
      // Need at least 2 valid satellites to create routes
      set({ routes: [] });
      return;
    }
    
    const routes: Route[] = [];
    const jobTypes = ['realtime', 'interactive', 'batch', 'cold'] as const;
    
    // Get ground sites (data centers) for ground-to-orbit routes
    // Import useSimStore dynamically to avoid circular dependency
    const { useSimStore } = require("../store/simStore");
    const simState = useSimStore?.getState?.()?.state;
    const groundSites = simState?.groundSites || [];
    const dataCenters = groundSites.filter((s: any) => !s.type || s.type === "data_center");
    
    // Convert data centers to 3D positions
    const dataCenterPositions: Array<{ id: string; x: number; y: number; z: number; lat: number; lon: number }> = [];
    dataCenters.forEach((dc: any) => {
      const [x, y, z] = latLonAltToXYZ(dc.lat, dc.lon, 0);
      dataCenterPositions.push({ id: dc.id, x, y, z, lat: dc.lat, lon: dc.lon });
    });
    
    // Log data centers for debugging
    if (dataCenterPositions.length > 0) {
      // Silent - too verbose
    }
    
    jobTypes.forEach((jobType) => {
      const jobPolicy = policy.jobs[jobType];
      if (!jobPolicy) return;
      
      const orbitProb = jobPolicy.orbit || 0;
      if (orbitProb > 0 && validSatellites.length > 0) {
        // Reduced route count: 1 route per 20 satellites, max 15 per job type
        const baseRoutes = Math.floor(validSatellites.length / 20);
        const numRoutes = Math.min(Math.max(baseRoutes, 2), 15); // Min 2, max 15 per job type
        
        for (let i = 0; i < numRoutes; i++) {
          // 50% chance of ground-to-orbit route (increased from 30%), 50% orbit-to-orbit
          const isGroundToOrbit = Math.random() < 0.5 && dataCenterPositions.length > 0;
          
          if (isGroundToOrbit) {
            // Ground to orbit route - data center to satellite
            const dataCenter = dataCenterPositions[Math.floor(Math.random() * dataCenterPositions.length)];
            const toSat = validSatellites[Math.floor(Math.random() * validSatellites.length)];
            
            const toRadius = Math.sqrt(toSat.x ** 2 + toSat.y ** 2 + toSat.z ** 2);
            if (toRadius > 1.05) {
              // Calculate route metrics for ground-to-orbit routes
              const fromVec = new Vector3(dataCenter.x, dataCenter.y, dataCenter.z);
              const toVec = new Vector3(toSat.x, toSat.y, toSat.z);
              const distanceKm = fromVec.distanceTo(toVec) * 6371; // Convert normalized to km
              const speedOfLightKmPerMs = 299792.458 / 1000; // km/ms
              const baseLatency = distanceKm / speedOfLightKmPerMs;
              const shellLatency = 65; // LEO shell latency
              const latencyMs = baseLatency + shellLatency;
              
              // Calculate congestion from satellite
              const congestionIndex = toSat.congestion || 0.3;
              
              // Ground-to-orbit typically has lower traffic
              const trafficMbps = 50 + Math.random() * 100; // 50-150 Mbps
              
              routes.push({
                id: `route_${jobType}_ground_${i}`,
                fromVec: [dataCenter.x, dataCenter.y, dataCenter.z],
                toVec: [toSat.x, toSat.y, toSat.z],
                type: 'edge', // Ground to orbit is edge routing
                latencyMs,
                congestionIndex,
                trafficMbps,
                toSatId: toSat.id, // Store satellite ID for traffic share calculation
              });
            }
          } else {
            // Orbit to orbit route - ensure routes go to different shells for better distribution
            // Group satellites by shell
            const satellitesByShell = new Map<string | number, Array<typeof validSatellites[0]>>();
            validSatellites.forEach(sat => {
              const shell = sat.shell !== undefined ? sat.shell : "unknown";
              if (!satellitesByShell.has(shell)) {
                satellitesByShell.set(shell, []);
              }
              satellitesByShell.get(shell)!.push(sat);
            });
            
            // Try to create routes between different shells (70% chance)
            let from: typeof validSatellites[0];
            let to: typeof validSatellites[0];
            
            if (Math.random() < 0.7 && satellitesByShell.size > 1) {
              // Route between different shells
              const shells = Array.from(satellitesByShell.keys());
              const fromShell = shells[Math.floor(Math.random() * shells.length)];
              const toShell = shells.filter(s => s !== fromShell)[Math.floor(Math.random() * (shells.length - 1))];
              
              const fromShellSats = satellitesByShell.get(fromShell)!;
              const toShellSats = satellitesByShell.get(toShell)!;
              
              if (fromShellSats.length > 0 && toShellSats.length > 0) {
                from = fromShellSats[Math.floor(Math.random() * fromShellSats.length)];
                to = toShellSats[Math.floor(Math.random() * toShellSats.length)];
              } else {
                // Fallback to random if shell grouping failed
                from = validSatellites[Math.floor(Math.random() * validSatellites.length)];
                to = validSatellites[Math.floor(Math.random() * validSatellites.length)];
              }
            } else {
              // Random route (30% chance or if only one shell)
              from = validSatellites[Math.floor(Math.random() * validSatellites.length)];
              to = validSatellites[Math.floor(Math.random() * validSatellites.length)];
            }
            
            if (from.id !== to.id) {
              // CRITICAL: Validate positions before creating route
              const fromRadius = Math.sqrt(from.x ** 2 + from.y ** 2 + from.z ** 2);
              const toRadius = Math.sqrt(to.x ** 2 + to.y ** 2 + to.z ** 2);
              
              // Only create route if both satellites are above Earth
              if (fromRadius > 1.05 && toRadius > 1.05) {
                // Calculate route metrics for orbit-to-orbit routes
                const fromVec = new Vector3(from.x, from.y, from.z);
                const toVec = new Vector3(to.x, to.y, to.z);
                const distanceKm = fromVec.distanceTo(toVec) * 6371; // Convert normalized to km
                const speedOfLightKmPerMs = 299792.458 / 1000; // km/ms
                const baseLatency = distanceKm / speedOfLightKmPerMs;
                const shellLatency = 65; // LEO shell latency
                const latencyMs = baseLatency + shellLatency;
                
                // Calculate congestion from both satellites
                const congestionIndex = ((from.congestion || 0) + (to.congestion || 0)) / 2;
                
                // Orbit-to-orbit typically has higher traffic
                const trafficMbps = 100 + Math.random() * 200; // 100-300 Mbps
                
                routes.push({
                  id: `route_${jobType}_${i}`,
                  fromVec: [from.x, from.y, from.z],
                  toVec: [to.x, to.y, to.z],
                  type: 'orbit',
                  latencyMs,
                  congestionIndex,
                  trafficMbps,
                  fromSatId: from.id, // Store satellite IDs for filtering
                  toSatId: to.id,
                });
              }
            }
          }
        }
      }
    });
    
    set({ routes });
  },
  calculateRouteMetrics: (route: Route, fromSat: Satellite, toSat: Satellite) => {
    // Calculate distance
    const distanceKm = Math.sqrt(
      (fromSat.x - toSat.x) ** 2 +
      (fromSat.y - toSat.y) ** 2 +
      (fromSat.z - toSat.z) ** 2
    ) * 6371; // Convert normalized to km
    
    // Calculate latency: distance / speed of light + shell altitude delay
    const speedOfLightKmPerMs = 299792.458 / 1000; // km/ms
    const baseLatency = distanceKm / speedOfLightKmPerMs;
    const shellLatency = 65; // MID-LEO default
    const latencyMs = baseLatency + shellLatency;
    
    // Calculate congestion: average of both satellites
    const congestionIndex = ((fromSat.congestion || 0) + (toSat.congestion || 0)) / 2;
    
    // Estimate traffic based on route type
    const trafficMbps = route.type === 'orbit' ? 200 : 100;
    
    return { latencyMs, congestionIndex, trafficMbps };
  },
}));

