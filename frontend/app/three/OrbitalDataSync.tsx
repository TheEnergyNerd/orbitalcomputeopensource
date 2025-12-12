"use client";

import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { useSimStore } from "../store/simStore";
import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim } from "../state/orbitStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import type { Satellite as SimSatellite } from "../store/simStore";
// deploymentSchedule.ts removed - getAltitudeForShell is available from satellitePositioning
import { 
  generateOrbitalState,
  getRandomInclination,
  calculateOrbitalPosition 
} from "../lib/orbitSim/orbitalMechanics";
import { assignSatelliteToShell } from "../lib/orbitSim/shellAssignment";
import { ORBIT_SHELLS } from "../lib/orbitSim/orbitShells";
import { 
  generateSatellitePosition,
  generateSatellitePositions,
  getShellFromAltitude,
  type ShellType
} from "../lib/orbitSim/satellitePositioning";

/**
 * Satellite naming schema: [CLASS]-[SHELL]-[DEPLOY_YEAR]-[SEQUENCE]
 * Example: A-LOW-2029-01472, B-SSO-2032-00304
 */
type SatelliteClass = "A" | "B";
type ShellName = "LOW" | "MID" | "HIGH" | "SSO";

// Track sequence numbers per year per shell per class
// Use shared counter (same as LaunchAnimation) via window object
const getSequenceCounters = (): Map<string, number> => {
  if (typeof window !== 'undefined' && (window as any).__satelliteSequenceCounters) {
    return (window as any).__satelliteSequenceCounters;
  }
  const counters = new Map<string, number>();
  if (typeof window !== 'undefined') {
    (window as any).__satelliteSequenceCounters = counters;
  }
  return counters;
};
const sequenceCounters = getSequenceCounters();

/**
 * Map shell type to naming schema shell name
 * Based on altitude ranges: LOW (<400km), MID (400-800km), HIGH (>=800km, not SSO), SSO (800-1000km)
 */
function getShellName(shellType: ShellType, altitude: number): ShellName {
  if (shellType === "SSO") return "SSO";
  if (altitude < 400) return "LOW";
  if (altitude < 800) return "MID";
  return "HIGH";
}

/**
 * Generate satellite ID in format: [CLASS]-[SHELL]-[DEPLOY_YEAR]-[SEQUENCE]
 */
function generateSatelliteId(
  satelliteClass: SatelliteClass,
  shellName: ShellName,
  deployYear: number,
  isRetired: boolean = false
): string {
  const key = `${satelliteClass}-${shellName}-${deployYear}`;
  const currentSeq = sequenceCounters.get(key) || 0;
  const nextSeq = currentSeq + 1;
  sequenceCounters.set(key, nextSeq);
  
  // Zero-pad sequence to 5 digits
  const sequenceStr = nextSeq.toString().padStart(5, '0');
  const id = `${satelliteClass}-${shellName}-${deployYear}-${sequenceStr}`;
  
  return isRetired ? `${id} [RET]` : id;
}

/**
 * Generate human-readable alias for satellite
 */
function generateSatelliteAlias(
  satelliteClass: SatelliteClass,
  shellName: ShellName,
  sequence: number
): string {
  const classDesc = satelliteClass === "A" ? "Starlink-Compute Hybrid" : "Sun-Slicer Inference";
  const shellDesc = shellName === "SSO" ? "Sun-Synchronous" : 
                    shellName === "LOW" ? "Low-LEO" :
                    shellName === "MID" ? "Mid-LEO" : "High-LEO";
  
  if (satelliteClass === "B") {
    return `${shellDesc} Inference Node ${sequence}`;
  } else {
    return `${shellDesc} Compute Node ${sequence}`;
  }
}

/**
 * Generate test satellites for visualization
 * Uses physically coherent positioning
 */
function generateTestSatellites(): SimSatellite[] {
  const satellites: SimSatellite[] = [];
  
  // Create a constellation of satellites in LEO
  const numSats = 20; // Generate 20 test satellites
  const shellType: ShellType = "LEO";
  
  // Generate positions using physically coherent positioning
  const positions = generateSatellitePositions(shellType, numSats);
  
  // Use current year for test satellites (default to 2025)
  const currentYear = 2025;
  const satelliteClass: SatelliteClass = "A"; // Test satellites are Class A
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    
    // Generate orbital state
    const orbitalState = generateOrbitalState(pos.alt, getRandomInclination());
    orbitalState.theta = pos.lon * (Math.PI / 180); // Set theta based on longitude
    
    // Map altitude to shell name for naming
    let namingShellName: ShellName;
    if (pos.alt >= 800 && pos.alt <= 1000) namingShellName = "SSO";
    else if (pos.alt < 400) namingShellName = "LOW";
    else if (pos.alt < 800) namingShellName = "MID";
    else namingShellName = "HIGH";
    
    // Generate satellite ID using the new naming schema
    const newSatelliteId = generateSatelliteId(
      satelliteClass,
      namingShellName,
      currentYear,
      false // not retired
    );
    
    satellites.push({
      id: newSatelliteId, // Use new naming schema
      lat: pos.lat,
      lon: pos.lon,
      alt_km: pos.alt,
      sunlit: true,
      utilization: Math.random() * 0.8,
      capacityMw: 0.003,
      nearestGatewayId: "test_gateway",
      latencyMs: 50 + Math.random() * 50,
    });
  }
  
  return satellites;
}

/**
 * Syncs simulation data to Three.js orbit store
 * Uses Zustand subscriptions with proper guards to avoid infinite loops
 */
export function OrbitalDataSync() {
  // Hooks must be called at top level, not inside useEffect
  const updateStartTimeRef = useRef<number>(0);
  const isUpdatingRef = useRef<boolean>(false);
  const updateQueueRef = useRef<Array<() => void>>([]);
  
  // Safety timeout: if isUpdating flag is stuck for more than 5 seconds, reset it
  useEffect(() => {
    const checkStuckFlag = () => {
      if (isUpdatingRef.current && updateStartTimeRef.current > 0) {
        const stuckTime = Date.now() - updateStartTimeRef.current;
        if (stuckTime > 5000) {
          console.error(`[OrbitalDataSync] 🚨 Safety timeout: isUpdating flag stuck for ${stuckTime}ms, resetting`);
          isUpdatingRef.current = false;
          updateStartTimeRef.current = 0;
        }
      }
    };
    const interval = setInterval(checkStuckFlag, 1000);
    return () => clearInterval(interval);
  }, []);
  
  useEffect(() => {
    // Removed verbose logging
    let lastSatellites: string = "";
    let lastRouterPolicy: string = "";
    let updateTimeout: NodeJS.Timeout | null = null;
    
    // Throttle subscriptions to prevent excessive updates
    let lastSubscriptionTime = 0;
    const SUBSCRIPTION_THROTTLE_MS = 100; // Max once per 100ms
    
    // Initial sync on mount - check for real data or use test data
    const initialSync = () => {
      // CRITICAL: Check if we already have ANY satellites before doing anything
      // This prevents clearing satellites on component remount
      const currentOrbitSats = useOrbitSim.getState().satellites;
      
      if (currentOrbitSats.length > 0) {
        const hasDeployedSats = currentOrbitSats.some(s => s.id.startsWith("deployed_"));
        console.log(`[OrbitalDataSync] ⏭️ Skipping initial sync: ${currentOrbitSats.length} satellites already exist${hasDeployedSats ? ' (including deployed)' : ''}`);
        return;
      }
      
      const simState = useSimStore.getState();
      let satellites = simState.state?.satellites;
      
      // If no real data, generate test data (only if no satellites exist)
      if (!satellites || satellites.length === 0) {
        // Only generate test satellites if we truly have none
        if (currentOrbitSats.length === 0) {
          // Generate a few test satellites to show something initially
          // Removed verbose logging
          satellites = generateTestSatellites().slice(0, 20); // Generate 20 test satellites for initial view
        } else {
          // Removed verbose logging
          return;
        }
        
        // Also populate simStore with test data so GroundSites can see it
        useSimStore.setState({
          state: {
            ...simState.state,
            satellites,
            groundSites: [
              // Data Centers
              {
                id: "nova_hub",
                label: "Northern Virginia Hyperscale",
                lat: 39.02,
                lon: -77.48,
                powerMw: 100,
                coolingMw: 20,
                jobsRunning: 10,
                carbonIntensity: 0.3,
                energyPrice: 50,
                type: "data_center",
              },
              {
                id: "dfw_hub",
                label: "Dallas–Fort Worth Hyperscale",
                lat: 32.92,
                lon: -96.96,
                powerMw: 150,
                coolingMw: 30,
                jobsRunning: 15,
                carbonIntensity: 0.25,
                energyPrice: 45,
                type: "data_center",
              },
              {
                id: "phx_hub",
                label: "Phoenix Hyperscale",
                lat: 33.45,
                lon: -112.07,
                powerMw: 120,
                coolingMw: 25,
                jobsRunning: 12,
                carbonIntensity: 0.35,
                energyPrice: 55,
                type: "data_center",
              },
              // Launch Sites
              {
                id: "cape_canaveral",
                label: "Cape Canaveral",
                lat: 28.5623,
                lon: -80.5774,
                powerMw: 0,
                coolingMw: 0,
                jobsRunning: 0,
                carbonIntensity: 0,
                energyPrice: 0,
                type: "launch_site",
              },
              {
                id: "boca_chica",
                label: "Boca Chica",
                lat: 25.9971,
                lon: -97.1554,
                powerMw: 0,
                coolingMw: 0,
                jobsRunning: 0,
                carbonIntensity: 0,
                energyPrice: 0,
                type: "launch_site",
              },
              {
                id: "vandenberg",
                label: "Vandenberg",
                lat: 34.7420,
                lon: -120.5724,
                powerMw: 0,
                coolingMw: 0,
                jobsRunning: 0,
                carbonIntensity: 0,
                energyPrice: 0,
                type: "launch_site",
              },
            ] as any,
            workload: {
              jobsPending: 0,
              jobsRunningOrbit: 0,
              jobsRunningGround: 0,
              jobsCompleted: 0,
            } as any,
            metrics: {
              totalGroundPowerMw: 370,
              totalOrbitalPowerMw: 0.15,
              avgLatencyMs: 60,
              orbitSharePercent: 30,
              totalJobsRunning: 37,
              energyCostGround: 18500,
              energyCostOrbit: 0,
              carbonGround: 111,
              carbonOrbit: 0,
            } as any,
            events: [],
            time: new Date().toISOString(),
          } as any,
        });
      }
      
      // Always sync satellites, even if hash matches (for initial load)
      if (satellites && satellites.length > 0) {
        const satHash = satellites.map(s => s.id).join(",");
        lastSatellites = satHash;
        const { updateSatellites } = useOrbitSim.getState();
        updateSatellites(satellites);
      }
    };
    
    // Run initial sync immediately and also after a short delay to ensure it happens
    initialSync();
    
    const timeoutId = setTimeout(() => {
      // Removed verbose logging
      initialSync();
      
      // Verify data is in store (logging removed)
      setTimeout(() => {
        // Removed verbose logging
      }, 200);
    }, 500);
    
    // Subscribe to sim store state changes
    const unsubscribeSim = useSimStore.subscribe((state) => {
      const satellites = state.state?.satellites;
      if (!satellites || isUpdatingRef.current) {
        if (isUpdatingRef.current) {
          console.log(`[OrbitalDataSync] ⏸️ SimStore subscription: Skipping - isUpdating flag is true`);
        }
        return;
      }
      
      const satHash = satellites.map(s => s.id).join(",");
      if (satHash === lastSatellites) {
        // Hash unchanged - skip silently to reduce log spam
        return;
      }
      
      // CRITICAL: Only sync from simStore if orbit store has FEWER satellites
      // This prevents overwriting newly deployed satellites
      const orbitState = useOrbitSim.getState();
      const currentOrbitSats = orbitState.satellites;
      
      // CRITICAL FIX: NEVER overwrite orbitStore if it has ANY satellites
      // This prevents simStore from clearing satellites during component remounts
      // The orbitStore is the source of truth for all satellites
      if (currentOrbitSats.length > 0) {
        // Update hash to prevent repeated checks, but NEVER sync
        lastSatellites = satHash;
        // Log only occasionally to avoid spam
        if (Math.random() < 0.01) {
          const hasDeployedSats = currentOrbitSats.some(s => s.id.startsWith("deployed_"));
          console.log(`[OrbitalDataSync] 🛡️ Blocked simStore sync: ${currentOrbitSats.length} satellites exist${hasDeployedSats ? ' (including deployed)' : ''}`);
        }
        return;
      }
      
      // Only sync from simStore if:
      // 1. OrbitStore has NO deployed satellites (user hasn't deployed anything)
      // 2. SimStore has MORE satellites (external update from backend)
      // 3. The hash has changed (new data)
      // 4. We won't lose any satellites (critical check)
      // 5. We're not currently processing unit updates
      const hasDeployedSats = currentOrbitSats.some(s => s.id.startsWith("deployed_"));
      if (satellites.length > currentOrbitSats.length && !hasDeployedSats && satellites.length >= currentOrbitSats.length && !isUpdatingRef.current) {
        lastSatellites = satHash;
        isUpdatingRef.current = true;
        
        console.log(`[OrbitalDataSync] ✅ Syncing from simStore: ${currentOrbitSats.length} → ${satellites.length} satellites`);
        const { updateSatellites } = useOrbitSim.getState();
        updateSatellites(satellites);
        
        // Reset flag after update completes
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
        });
      } else {
        // Update hash but don't sync (prevent repeated checks)
        lastSatellites = satHash;
        if (hasDeployedSats && Math.random() < 0.01) {
          console.log(`[OrbitalDataSync] 🛡️ Blocked simStore sync: ${currentOrbitSats.length} deployed satellites exist, isUpdating=${isUpdatingRef.current}`);
        }
        // Update hash even if we don't sync, to prevent repeated checks
        lastSatellites = satHash;
      }
    });

    // Generate test routes if no policy exists
    const generateTestRoutes = () => {
      const orbitState = useOrbitSim.getState();
      const { satellites } = orbitState;
      console.log(`[OrbitalDataSync] generateTestRoutes called: ${satellites.length} satellites in store`);
      
      if (satellites.length > 0) {
        // Create test routes - fewer routes, more from data centers
        const testRoutes: any[] = [];
        // Reduced routes: 1 route per 20 satellites, min 3, max 20 (reduced for performance)
        const numRoutes = Math.min(Math.max(Math.floor(satellites.length / 20), 3), 20);
        
        // Get data centers for ground-to-orbit routes
        const simState = useSimStore.getState().state;
        const groundSites = simState?.groundSites || [];
        const dataCenters = groundSites.filter((s: any) => !s.type || s.type === "data_center");
        
        // Convert data centers to 3D positions
        const { latLonAltToXYZ } = require("../lib/three/coordinateUtils");
        const dataCenterPositions: Array<{ id: string; x: number; y: number; z: number }> = [];
        dataCenters.forEach((dc: any) => {
          const [x, y, z] = latLonAltToXYZ(dc.lat, dc.lon, 0);
          dataCenterPositions.push({ id: dc.id, x, y, z });
        });
        let attempts = 0;
        // CRITICAL: Filter out satellites with invalid positions
        const validSatellites = satellites.filter(sat => {
          if (sat.x === undefined || sat.y === undefined || sat.z === undefined) {
            return false;
          }
          const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
          // Ensure satellite is above Earth (radius > 1.0, ideally > 1.05 for safety)
          return radius > 1.05;
        });
        
        if (validSatellites.length < 2) {
          console.log(`[OrbitalDataSync] Cannot generate routes: need at least 2 valid satellites, got ${validSatellites.length}`);
          return;
        }
        
        while (testRoutes.length < numRoutes && attempts < numRoutes * 5) {
          attempts++;
          
          // 50% chance of ground-to-orbit route, 50% orbit-to-orbit
          const isGroundToOrbit = Math.random() < 0.5 && dataCenterPositions.length > 0;
          
          if (isGroundToOrbit) {
            // Ground to orbit route - data center to satellite
            const dataCenter = dataCenterPositions[Math.floor(Math.random() * dataCenterPositions.length)];
            const toSat = validSatellites[Math.floor(Math.random() * validSatellites.length)];
            
            const toRadius = Math.sqrt(toSat.x ** 2 + toSat.y ** 2 + toSat.z ** 2);
            if (toRadius > 1.05) {
              // Calculate route metrics
              const fromVec = new Vector3(dataCenter.x, dataCenter.y, dataCenter.z);
              const toVec = new Vector3(toSat.x, toSat.y, toSat.z);
              const distanceKm = fromVec.distanceTo(toVec) * 6371;
              const speedOfLightKmPerMs = 299792.458 / 1000;
              const baseLatency = distanceKm / speedOfLightKmPerMs;
              const shellLatency = 65;
              const latencyMs = baseLatency + shellLatency;
              const congestionIndex = toSat.congestion || 0.3;
              const trafficMbps = 50 + Math.random() * 100;
              
              testRoutes.push({
                fromVec: [dataCenter.x, dataCenter.y, dataCenter.z],
                toVec: [toSat.x, toSat.y, toSat.z],
                id: `test_route_ground_${testRoutes.length}`,
                type: 'edge',
                latencyMs,
                congestionIndex,
                trafficMbps,
                toSatId: toSat.id, // Store satellite ID for filtering
              });
            }
          } else {
            // Orbit to orbit route
            const fromIdx = Math.floor(Math.random() * validSatellites.length);
            const toIdx = Math.floor(Math.random() * validSatellites.length);
            const from = validSatellites[fromIdx];
            const to = validSatellites[toIdx];
            
            if (from && to && from.id !== to.id) {
              // CRITICAL: Validate positions before creating route
              const fromRadius = Math.sqrt(from.x ** 2 + from.y ** 2 + from.z ** 2);
              const toRadius = Math.sqrt(to.x ** 2 + to.y ** 2 + to.z ** 2);
              
              // Only create route if both satellites are above Earth
              if (fromRadius > 1.05 && toRadius > 1.05) {
                // Calculate route metrics
                const fromVec3 = new Vector3(from.x, from.y, from.z);
                const toVec3 = new Vector3(to.x, to.y, to.z);
                const distanceKm = fromVec3.distanceTo(toVec3) * 6371;
                const speedOfLightKmPerMs = 299792.458 / 1000;
                const baseLatency = distanceKm / speedOfLightKmPerMs;
                const shellLatency = 65;
                const latencyMs = baseLatency + shellLatency;
                const congestionIndex = ((from.congestion || 0) + (to.congestion || 0)) / 2;
                const trafficMbps = 100 + Math.random() * 200;
                
                testRoutes.push({
                  fromVec: [from.x, from.y, from.z],
                  toVec: [to.x, to.y, to.z],
                  id: `test_route_${testRoutes.length}`,
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
        
        console.log(`[OrbitalDataSync] Generated ${testRoutes.length} test routes from ${satellites.length} satellites`);
        useOrbitSim.setState({ routes: testRoutes });
        
        // Verify routes were set
        setTimeout(() => {
          const verifyState = useOrbitSim.getState();
          console.log(`[OrbitalDataSync] Verification: ${verifyState.routes.length} routes in store`);
        }, 100);
      } else {
        console.log(`[OrbitalDataSync] Cannot generate routes: ${satellites.length} satellites (store state:`, orbitState, ')');
      }
    };
    
    // Subscribe to router policy changes
    const unsubscribeRouter = useSimulationStore.subscribe((state) => {
      const routerPolicy = state.config.routerPolicy;
      if (isUpdatingRef.current) return;
      
      const policyHash = routerPolicy ? JSON.stringify(routerPolicy) : "";
      if (policyHash === lastRouterPolicy) return;
      
      lastRouterPolicy = policyHash;
      isUpdatingRef.current = true;
      
      // CRITICAL: Update routes INSTANTLY when policy changes (no delay)
      // This ensures sliders instantly shift routing composition
      const { satellites, updateRoutes } = useOrbitSim.getState();
      const validSatellites = satellites.filter(sat => {
        if (sat.x === undefined || sat.y === undefined || sat.z === undefined) {
          return false;
        }
        const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
        return radius > 1.05; // Above Earth
      });
      
      if (routerPolicy && validSatellites.length >= 2) {
        updateRoutes(routerPolicy, validSatellites);
      } else if (validSatellites.length >= 2) {
        // Generate test routes if no policy
        generateTestRoutes();
      }
      isUpdatingRef.current = false;
    });
    
    // FORCE route regeneration to use new coordinate system
    // Clear existing routes and regenerate with current satellite positions
    setTimeout(() => {
      const { satellites, updateRoutes } = useOrbitSim.getState();
      const routerPolicy = useSimulationStore.getState().config.routerPolicy;
      const validSatellites = satellites.filter(sat => {
        if (sat.x === undefined || sat.y === undefined || sat.z === undefined) {
          return false;
        }
        const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
        return radius > 1.05;
      });
      
      if (routerPolicy && validSatellites.length >= 2) {
        updateRoutes(routerPolicy, validSatellites);
      } else if (validSatellites.length >= 2) {
        generateTestRoutes();
      }
    }, 100);
    
    // FORCE route generation - run immediately and keep retrying
    const forceGenerateRoutes = () => {
      const orbitState = useOrbitSim.getState();
      const { satellites, routes } = orbitState;
      // Removed verbose logging
      
      if (satellites.length > 0) {
        // Generate routes directly
        const testRoutes: any[] = [];
        const numRoutes = Math.min(15, satellites.length); // Reduced from 20 for performance
        for (let i = 0; i < numRoutes; i++) {
          const fromIdx = Math.floor(Math.random() * satellites.length);
          const toIdx = Math.floor(Math.random() * satellites.length);
          const from = satellites[fromIdx];
          const to = satellites[toIdx];
          
          if (from && to && from.id !== to.id && from.x !== undefined && to.x !== undefined) {
            testRoutes.push({
              fromVec: [from.x, from.y, from.z],
              toVec: [to.x, to.y, to.z],
              id: `force_route_${i}`,
              type: 'orbit',
            });
          }
        }
        
        // Removed verbose logging
        useOrbitSim.setState({ routes: testRoutes });
        
        // Verify
        setTimeout(() => {
          const verify = useOrbitSim.getState();
          // Removed verbose logging
        }, 50);
      } else {
        console.log(`[OrbitalDataSync] No satellites yet, will retry...`);
      }
    };
    
    // Run immediately and keep retrying
    forceGenerateRoutes();
    
    // Keep retrying every 500ms until routes exist
    const forceInterval = setInterval(() => {
      const { routes, satellites } = useOrbitSim.getState();
      // Only log every 5 seconds to reduce noise
      if (Math.random() < 0.1) {
        // 10% chance to log
      }
      if (routes.length === 0 && satellites.length > 0) {
        forceGenerateRoutes();
      }
    }, 500);
    
    // Generate test routing policy changes to trigger arrows
    const generateTestPolicy = () => {
      const testPolicy = {
        jobs: {
          realtime: { orbit: Math.random() * 0.5 + 0.3 }, // 30-80% orbit
          interactive: { orbit: Math.random() * 0.4 + 0.2 },
          batch: { orbit: Math.random() * 0.3 + 0.1 },
          cold: { orbit: Math.random() * 0.2 },
        },
      };
      useSimulationStore.setState((state) => ({
        config: {
          ...state.config,
          routerPolicy: testPolicy as any,
        },
      }));
      // Silent - too verbose
    };
    
    // Generate policy changes IMMEDIATELY and frequently
    generateTestPolicy(); // Run immediately
    setTimeout(() => generateTestPolicy(), 2000);
    setTimeout(() => generateTestPolicy(), 5000);
    const policyInterval = setInterval(() => {
      generateTestPolicy();
    }, 8000); // Every 8 seconds
    
    // REMOVED: Automatic test launches - launches should only happen when user presses deploy
    // Launches will be created via OrbitalUnitsStore when user deploys units (1, 5, or 10 years)

    // Helper to process queued updates
    const processNextUpdate = () => {
      if (updateQueueRef.current.length === 0) {
        isUpdatingRef.current = false;
        updateStartTimeRef.current = 0;
        return;
      }
      
      const nextUpdate = updateQueueRef.current.shift();
      if (nextUpdate) {
        nextUpdate();
      }
    };
    
    // Process update function - extracted to avoid recursion
    const processUnitsUpdate = (state: ReturnType<typeof useOrbitalUnitsStore.getState>) => {
      // CRITICAL: Get existing satellites FIRST before setting update flag
      // This ensures we have a snapshot of current state
      const existingSatsSnapshot = useOrbitSim.getState().satellites;
      const existingSatIdsSnapshot = new Set(existingSatsSnapshot.map(s => s.id));
      const snapshotCount = existingSatsSnapshot.length;
      
      // Only proceed if we're not already updating
      if (isUpdatingRef.current) {
        updateQueueRef.current.push(() => processUnitsUpdate(state));
        return;
      }
      
      isUpdatingRef.current = true;
      updateStartTimeRef.current = Date.now();
      
      const deployedUnits = state.units.filter(u => u.status === "deployed" && u.deployedAt);
      
      // CRITICAL: Get existing satellites from orbitStore (source of truth), not simStore
      const orbitStoreSats = useOrbitSim.getState().satellites;
      
      // CRITICAL: Verify we haven't lost satellites since snapshot
      if (orbitStoreSats.length < snapshotCount) {
        console.error(`[OrbitalDataSync] 🚨 CRITICAL: Satellites lost between snapshot and update! Snapshot: ${snapshotCount}, Current: ${orbitStoreSats.length}. Aborting.`);
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
          updateStartTimeRef.current = 0;
          processNextUpdate();
        });
        return;
      }
      
      // Check if we've already processed these units
      const existingDeployedIds = new Set(
        orbitStoreSats
          .filter(s => s.id.startsWith("deployed_"))
          .map(s => {
            // Extract unit ID from satellite ID: deployed_${unit.id}_sat
            const match = s.id.match(/deployed_(.+?)_sat$/);
            return match ? match[1] : s.id;
          })
      );
      
      // Only process if there are new deployments
      const newDeployments = deployedUnits.filter(u => !existingDeployedIds.has(u.id));
      
      if (newDeployments.length === 0) {
        // No new deployments - reset flag and return
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
          updateStartTimeRef.current = 0;
          processNextUpdate();
        });
        return;
      }
      
      // Create satellites for deployed units
      const newSats: SimSatellite[] = [];
      const LAUNCH_SITES = [
        { lat: 28.5623, lon: -80.5774 }, // Cape Canaveral SLC-40
        { lat: 25.9971, lon: -97.1554 }, // Boca Chica (SpaceX)
        { lat: 34.7420, lon: -120.5724 }, // Vandenberg LC-576E
      ];
      
      // Calculate current congestion and satellite counts per shell for shell assignment
      // Note: deploymentSchedule.ts was removed - using direct shell assignment instead
      const currentCongestion: Record<string, number> = {
        "VLEO": 0.3,
        "MID-LEO": 0.4,
        "SSO": 0.2,
        "MEO": 0.1,
      };
      const currentSatsPerShell: Record<string, number> = {
        "VLEO": 0,
        "MID-LEO": 0,
        "SSO": 0,
        "MEO": 0,
      };
      
      // Count existing satellites per shell from orbitStore
      orbitStoreSats.forEach(sat => {
        // Get altitude from orbitalState or estimate from position
        let alt = 550; // Default
        if (sat.orbitalState?.altitudeRadius) {
          alt = sat.orbitalState.altitudeRadius;
        } else {
          const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
          alt = (radius - 1) * 6371; // Convert normalized radius to km
        }
        
        if (alt >= 5000) {
          currentSatsPerShell["MEO"]++;
        } else if (alt >= 900) {
          currentSatsPerShell["SSO"]++;
        } else if (alt >= 500) {
          currentSatsPerShell["MID-LEO"]++;
        } else {
          currentSatsPerShell["VLEO"]++;
        }
      });
      
      // Get existing satellite positions for angular spacing enforcement from orbitStore
      const existingPositions = orbitStoreSats.map(sat => {
        // Get position from satellite data
        let lat = 0, lon = 0, alt = 550;
        if (sat.orbitalState) {
          // Estimate from orbital state (simplified)
          alt = sat.orbitalState.altitudeRadius;
          // Use theta to estimate longitude
          lon = (sat.orbitalState.theta * 180) / Math.PI;
        } else {
          // Estimate from xyz position
          const radius = Math.sqrt(sat.x ** 2 + sat.y ** 2 + sat.z ** 2);
          alt = (radius - 1) * 6371;
          // Estimate lat/lon from xyz (simplified)
          lat = Math.asin(sat.z / radius) * (180 / Math.PI);
          lon = Math.atan2(sat.y, sat.x) * (180 / Math.PI);
        }
        return {
          lat,
          lon,
          shell: getShellFromAltitude(alt) as ShellType,
        };
      });
      
      // Get current year and strategy for Class B assignment
      const currentYear = useSimulationStore.getState().timeline.length > 0
        ? useSimulationStore.getState().timeline[useSimulationStore.getState().timeline.length - 1]?.year || 2025
        : 2025;
      // Get strategy from current plan or default to BALANCED
      const currentStrategy = "BALANCED"; // Default strategy
      
      // Calculate Class B share based on strategy (from satelliteClasses.ts)
      const getClassBShare = (strategy: string, year: number): number => {
        if (year < 2030) return 0;
        switch (strategy) {
          case "CARBON": return 0.7;
          case "COST": return 0.5;
          case "LATENCY": return 0.25;
          case "BALANCED":
          default: return 0.5;
        }
      };
      
      const classBShare = getClassBShare(currentStrategy, currentYear);
      const shouldBeClassB = (index: number, total: number) => {
        if (currentYear < 2030) return false;
        if (classBShare === 0) return false;
        // Assign Class B based on share (e.g., if share is 0.5, every other satellite is Class B)
        const step = Math.floor(1 / classBShare);
        return step > 0 && (index % step) === 0;
      };
      
      // Only log Class B assignment for first few satellites
      let loggedClassB = false;
      
      newDeployments.forEach((unit, unitIndex) => {
        if (unit.type === "leo_pod") {
          // Determine if this should be Class B BEFORE shell assignment
          const targetClassB = shouldBeClassB(unitIndex, newDeployments.length);
          
          // If targeting Class B, force SSO shell assignment
          let shell: ReturnType<typeof assignSatelliteToShell>;
          if (targetClassB && currentYear >= 2030) {
            // Force SSO for Class B satellites
            const ssoShell = ORBIT_SHELLS.find(s => s.id === "SSO");
            if (ssoShell) {
              shell = ssoShell;
              // Removed verbose logging
            } else {
              // Fallback: use normal assignment but log warning
              shell = assignSatelliteToShell(currentCongestion, currentSatsPerShell);
              console.warn(`[OrbitalDataSync] ⚠️ SSO shell not found, using normal assignment`);
            }
          } else {
            // Normal shell assignment for Class A
            shell = assignSatelliteToShell(currentCongestion, currentSatsPerShell);
          }
          
          // Map shell ID to ShellType
          let shellType: ShellType = "LEO";
          if (shell.id === "MEO") {
            shellType = "MEO";
          } else if (shell.id === "GEO") {
            shellType = "GEO";
          } else if (shell.id === "SSO") {
            shellType = "SSO";
          }
          
          // Generate satellite position using physically coherent positioning
          const position = generateSatellitePosition(shellType, existingPositions);
          
          if (position) {
            // Generate orbital state for this position
            const orbitalState = generateOrbitalState(position.alt, getRandomInclination());
            // Set theta based on longitude
            orbitalState.theta = position.lon * (Math.PI / 180);
            
            // Determine Class B: must be year >= 2030 AND (targeted as Class B OR in SSO shell)
            const isSSO = shellType === "SSO" || (position.alt >= 600 && position.alt <= 800); // SSO is 600-800km
            const satelliteClass = (currentYear >= 2030 && (targetClassB || isSSO)) ? "B" : "A";
            
            // Log Class B assignment only for first Class B satellite
            if (satelliteClass === "B" && !loggedClassB) {
              console.log(`[OrbitalDataSync] 🛰️ Class B satellite created: year=${currentYear}, shellType=${shellType}, alt=${position.alt.toFixed(0)}km`);
              loggedClassB = true;
            }
            
            // Map shellType to naming schema shell name
            let namingShellName: ShellName;
            if (shellType === "SSO") namingShellName = "SSO";
            else if (position.alt < 400) namingShellName = "LOW";
            else if (position.alt < 800) namingShellName = "MID";
            else namingShellName = "HIGH";
            
            // Generate satellite ID using the new schema
            const newSatelliteId = generateSatelliteId(
              satelliteClass,
              namingShellName,
              currentYear,
              false // not retired
            );
            
            // Create SimSatellite object (without satelliteClass/orbitalState - those are added in updateSatellites)
            const simSat: SimSatellite = {
              id: newSatelliteId, // Use the new naming schema
              lat: position.lat,
              lon: position.lon,
              alt_km: position.alt,
              sunlit: true,
              utilization: 0.5,
              capacityMw: 0.1, // 100kW = 0.1MW
              nearestGatewayId: "test_gateway",
              latencyMs: 50,
            };
            // Store satelliteClass and orbitalState as extra properties that will be used in updateSatellites
            (simSat as any).satelliteClass = satelliteClass;
            (simSat as any).orbitalState = orbitalState;
            newSats.push(simSat);
            
            // Add to existing positions for next satellite
            existingPositions.push({
              lat: position.lat,
              lon: position.lon,
              shell: shellType,
            });
          } else {
            console.warn(`[OrbitalDataSync] ⚠️ Failed to generate position for unit ${unit.id}`);
          }
        } else if (unit.type === "geo_hub" && unit.position) {
          // GEO hub = 1 satellite at GEO altitude
          newSats.push({
            id: `deployed_${unit.id}`,
            lat: unit.position.lat,
            lon: unit.position.lon,
            alt_km: 35786, // GEO altitude
            sunlit: true,
            utilization: 0.7,
            capacityMw: 1.0,
            nearestGatewayId: "test_gateway",
            latencyMs: 120,
          });
        }
      });
      
      // CRITICAL: Only update if we have new satellites to add
      // Get current satellites from orbitStore (source of truth)
      const currentOrbitSats = useOrbitSim.getState().satellites;
      const existingSatIds = new Set(currentOrbitSats.map(s => s.id));
      const trulyNewSats = newSats.filter(s => !existingSatIds.has(s.id));
      
      if (trulyNewSats.length > 0) {
        // Removed verbose logging
        
        // CRITICAL: Get fresh state RIGHT BEFORE updating to ensure we have all satellites
        const freshOrbitState = useOrbitSim.getState();
        const freshOrbitSats = freshOrbitState.satellites;
        
        // Convert orbitStore satellites back to SimSatellite format for updateSatellites
        // CRITICAL: Preserve x, y, z coordinates directly to avoid conversion errors
        const existingSimSats: SimSatellite[] = freshOrbitSats.map(sat => {
          // Preserve x, y, z if available (most reliable)
          let x = sat.x, y = sat.y, z = sat.z;
          let lat = 0, lon = 0, alt = 550;
          
          if (x !== undefined && y !== undefined && z !== undefined) {
            // Use existing xyz coordinates - most reliable
            const radius = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
            alt = (radius - 1) * 6371;
            lat = Math.asin(z / radius) * (180 / Math.PI);
            lon = Math.atan2(y, x) * (180 / Math.PI);
          } else if (sat.orbitalState) {
            // Fallback to orbital state
            alt = sat.orbitalState.altitudeRadius;
            lon = (sat.orbitalState.theta * 180) / Math.PI;
            // Calculate xyz from orbital state
            const [calcX, calcY, calcZ] = require("../lib/orbitSim/orbitalMechanics").calculateOrbitalPosition(
              sat.orbitalState.altitudeRadius,
              sat.orbitalState.inclination,
              sat.orbitalState.theta
            );
            x = calcX;
            y = calcY;
            z = calcZ;
          } else {
            // Last resort: estimate from position
            const radius = Math.sqrt((sat.x || 0) ** 2 + (sat.y || 0) ** 2 + (sat.z || 0) ** 2);
            if (radius > 0.1) {
              alt = (radius - 1) * 6371;
              lat = Math.asin((sat.z || 0) / radius) * (180 / Math.PI);
              lon = Math.atan2(sat.y || 0, sat.x || 0) * (180 / Math.PI);
            }
            x = sat.x || 0;
            y = sat.y || 0;
            z = sat.z || 0;
          }
          
          return {
            id: sat.id,
            lat,
            lon,
            alt_km: alt,
            sunlit: true,
            utilization: sat.congestion || 0.5,
            capacityMw: 0.1,
            nearestGatewayId: "test_gateway",
            latencyMs: 50,
            satelliteClass: sat.satelliteClass as any,
            orbitalState: sat.orbitalState as any,
            // CRITICAL: Preserve xyz coordinates directly
            x,
            y,
            z,
          } as any;
        });
        
        // Ensure we don't duplicate satellites
        const existingIds = new Set(existingSimSats.map(s => s.id));
        const uniqueNewSats = trulyNewSats.filter(s => !existingIds.has(s.id));
        
        const allSats = [...existingSimSats, ...uniqueNewSats];
        
        // CRITICAL: Verify we're not losing satellites by count
        if (allSats.length < freshOrbitSats.length) {
          console.error(`[OrbitalDataSync] 🚨 ERROR: Would lose satellites! Current: ${freshOrbitSats.length}, New: ${allSats.length}. Aborting update.`);
          // Don't process update - keep existing satellites and reset flag
          requestAnimationFrame(() => {
            isUpdatingRef.current = false;
            updateStartTimeRef.current = 0;
            processNextUpdate();
          });
          return;
        }
        
        // CRITICAL: Verify all existing satellite IDs are preserved
        const existingSatIds = new Set(freshOrbitSats.map(s => s.id));
        const newSatIds = new Set(allSats.map(s => s.id));
        const missingIds = Array.from(existingSatIds).filter(id => !newSatIds.has(id));
        if (missingIds.length > 0) {
          const deployedMissing = missingIds.filter(id => id.startsWith("deployed_"));
          console.error(`[OrbitalDataSync] 🚨 ERROR: Would lose ${missingIds.length} satellites (${deployedMissing.length} deployed): ${missingIds.slice(0, 10).join(", ")}${missingIds.length > 10 ? "..." : ""}. Aborting update.`);
          // Don't process update - keep existing satellites and reset flag
          requestAnimationFrame(() => {
            isUpdatingRef.current = false;
            updateStartTimeRef.current = 0;
            processNextUpdate();
          });
          return;
        }
        
        // Removed verbose logging
        
        // CRITICAL: Final verification before update
        const finalOrbitState = useOrbitSim.getState();
        const finalOrbitSats = finalOrbitState.satellites;
        const finalExistingIds = new Set(finalOrbitSats.map(s => s.id));
        const finalNewIds = new Set(allSats.map(s => s.id));
        const finalMissingIds = Array.from(finalExistingIds).filter(id => !finalNewIds.has(id));
        
        if (finalMissingIds.length > 0 && finalMissingIds.some(id => id.startsWith("deployed_"))) {
          console.error(`[OrbitalDataSync] 🚨 CRITICAL: Would lose ${finalMissingIds.length} satellites including deployed ones! Aborting update.`);
          console.error(`[OrbitalDataSync] Missing IDs: ${finalMissingIds.slice(0, 10).join(", ")}`);
          // Don't process update - keep existing satellites and reset flag
          requestAnimationFrame(() => {
            isUpdatingRef.current = false;
            updateStartTimeRef.current = 0;
            processNextUpdate();
          });
          return;
        }
        
        // CRITICAL: Final check before update - get absolute latest state
        const preUpdateState = useOrbitSim.getState();
        const preUpdateSats = preUpdateState.satellites;
        const preUpdateIds = new Set(preUpdateSats.map(s => s.id));
        const allSatsIds = new Set(allSats.map(s => s.id));
        const preUpdateMissing = Array.from(preUpdateIds).filter(id => !allSatsIds.has(id));
        
        if (preUpdateMissing.length > 0 && preUpdateMissing.some(id => id.startsWith("deployed_"))) {
          console.error(`[OrbitalDataSync] 🚨 CRITICAL: Pre-update check failed! Would lose ${preUpdateMissing.length} deployed satellites. Aborting.`);
          // Don't process update - keep existing satellites
          requestAnimationFrame(() => {
            isUpdatingRef.current = false;
            processNextUpdate();
          });
          return;
        }
        
        // CRITICAL: Update orbit store directly - this is the source of truth for deployed satellites
        // DO NOT update simStore - this prevents the subscription from overwriting our satellites
        const { updateSatellites } = useOrbitSim.getState();
        
        // Removed verbose logging
        updateSatellites(allSats);
        
        // CRITICAL: Verify after update to catch any loss
        requestAnimationFrame(() => {
          const postUpdateState = useOrbitSim.getState();
          const postUpdateSats = postUpdateState.satellites;
          if (postUpdateSats.length < preUpdateSats.length) {
            console.error(`[OrbitalDataSync] 🚨 CRITICAL: Satellites LOST after update! Before: ${preUpdateSats.length}, After: ${postUpdateSats.length}`);
            const lostIds = preUpdateSats.filter(s => !postUpdateSats.some(p => p.id === s.id)).map(s => s.id);
            console.error(`[OrbitalDataSync] Lost satellite IDs: ${lostIds.slice(0, 10).join(", ")}${lostIds.length > 10 ? "..." : ""}`);
            
            // CRITICAL: If satellites were lost, try to restore them
            // This should never happen, but if it does, we need to recover
            if (lostIds.length > 0 && lostIds.some(id => id.startsWith("deployed_"))) {
              console.error(`[OrbitalDataSync] 🚨 Attempting to restore lost satellites...`);
              // Restore from preUpdateSats
              const restoreSats = preUpdateSats.filter(s => lostIds.includes(s.id));
              if (restoreSats.length > 0) {
                // Convert back to SimSatellite format and restore
                const restoreSimSats: SimSatellite[] = restoreSats.map(sat => ({
                  id: sat.id,
                  lat: 0,
                  lon: 0,
                  alt_km: 550,
                  sunlit: true,
                  utilization: sat.congestion || 0.5,
                  capacityMw: 0.1,
                  nearestGatewayId: "test_gateway",
                  latencyMs: 50,
                  satelliteClass: sat.satelliteClass as any,
                  orbitalState: sat.orbitalState as any,
                  x: sat.x,
                  y: sat.y,
                  z: sat.z,
                } as any));
                
                // Merge with current satellites
                const currentSats = postUpdateSats.map(sat => ({
                  id: sat.id,
                  lat: 0,
                  lon: 0,
                  alt_km: 550,
                  sunlit: true,
                  utilization: sat.congestion || 0.5,
                  capacityMw: 0.1,
                  nearestGatewayId: "test_gateway",
                  latencyMs: 50,
                  satelliteClass: sat.satelliteClass as any,
                  orbitalState: sat.orbitalState as any,
                  x: sat.x,
                  y: sat.y,
                  z: sat.z,
                } as any));
                
                const allRestoredSats = [...currentSats, ...restoreSimSats];
                const { updateSatellites } = useOrbitSim.getState();
                updateSatellites(allRestoredSats);
                console.error(`[OrbitalDataSync] ✅ Restored ${restoreSats.length} lost satellites`);
              }
            }
          } else {
            // Removed verbose logging
          }
        });
        
        // Update hash to prevent subscription from trying to sync
        const newHash = allSats.map(s => s.id).join(",");
        lastSatellites = newHash;
        
        // Process next queued update or reset flag
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
          updateStartTimeRef.current = 0;
          processNextUpdate();
        });
      } else {
        // No truly new satellites - reset flag
        requestAnimationFrame(() => {
          isUpdatingRef.current = false;
          updateStartTimeRef.current = 0;
          processNextUpdate();
        });
      }
    };
    
    // Subscribe to deployed units and add satellites for them
    const unsubscribeUnits = useOrbitalUnitsStore.subscribe((state) => {
      // Throttle subscriptions
      const now = Date.now();
      if (now - lastSubscriptionTime < SUBSCRIPTION_THROTTLE_MS) {
        return;
      }
      lastSubscriptionTime = now;
      
      // If already updating, queue this update
      if (isUpdatingRef.current) {
        updateQueueRef.current.push(() => processUnitsUpdate(state));
        return;
      }
      
      processUnitsUpdate(state);
    });
    
    // Cleanup function - unsubscribe from all stores and clear intervals
    return () => {
      clearTimeout(timeoutId);
      clearInterval(forceInterval);
      clearInterval(policyInterval);
      unsubscribeSim();
      unsubscribeRouter();
      unsubscribeUnits();
      // Removed verbose logging
    };
  }, []);

  return null; // This is just a sync component
}

