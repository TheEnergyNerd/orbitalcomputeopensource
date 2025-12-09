"use client";

import { useEffect } from "react";
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
import { 
  generateSatellitePosition,
  generateSatellitePositions,
  getShellFromAltitude,
  type ShellType
} from "../lib/orbitSim/satellitePositioning";

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
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    
    // Generate orbital state
    const orbitalState = generateOrbitalState(pos.alt, getRandomInclination());
    orbitalState.theta = pos.lon * (Math.PI / 180); // Set theta based on longitude
    
    satellites.push({
      id: `test_sat_${i}`,
      lat: pos.lat,
      lon: pos.lon,
      alt_km: pos.alt,
      // CRITICAL: Include x, y, z coordinates explicitly
      x: pos.x,
      y: pos.y,
      z: pos.z,
      sunlit: true,
      utilization: Math.random() * 0.8,
      capacityMw: 0.003,
      nearestGatewayId: "test_gateway",
      latencyMs: 50 + Math.random() * 50,
      orbitalState: orbitalState as any,
    });
  }
  
  return satellites;
}

/**
 * Syncs simulation data to Three.js orbit store
 * Uses Zustand subscriptions with proper guards to avoid infinite loops
 */
export function OrbitalDataSync() {
  useEffect(() => {
    console.log("[OrbitalDataSync] Component mounted - starting sync");
    let lastSatellites: string = "";
    let lastRouterPolicy: string = "";
    let isUpdating = false;
    
    // Initial sync on mount - check for real data or use test data
    const initialSync = () => {
      const simState = useSimStore.getState();
      let satellites = simState.state?.satellites;
      
      // If no real data, generate test data
      if (!satellites || satellites.length === 0) {
        // Generate a few test satellites to show something initially
        console.log("[OrbitalDataSync] No real data, generating 20 test satellites");
        satellites = generateTestSatellites().slice(0, 20); // Generate 20 test satellites for initial view
        
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
      console.log("[OrbitalDataSync] Running delayed initial sync");
      initialSync();
      
      // Verify data is in store
      setTimeout(() => {
        const orbitState = useOrbitSim.getState();
        console.log("[OrbitalDataSync] Final verification:", {
          satelliteCount: orbitState.satellites.length,
          routeCount: orbitState.routes.length,
          simPaused: orbitState.simPaused,
          simSpeed: orbitState.simSpeed,
          simTime: orbitState.simTime,
        });
      }, 200);
    }, 500);
    
    // Subscribe to sim store state changes
    const unsubscribeSim = useSimStore.subscribe((state) => {
      const satellites = state.state?.satellites;
      if (!satellites || isUpdating) return;
      
      const satHash = satellites.map(s => s.id).join(",");
      if (satHash === lastSatellites) return;
      
      // CRITICAL: Only sync from simStore if orbit store has FEWER satellites
      // This prevents overwriting newly deployed satellites
      const orbitState = useOrbitSim.getState();
      const currentOrbitSats = orbitState.satellites;
      
      // Only update if simStore has MORE satellites than orbit store
      // This means simStore got updated from an external source (backend, etc.)
      // If orbit store has more, it means we just deployed satellites - don't overwrite!
      if (satellites.length > currentOrbitSats.length) {
        lastSatellites = satHash;
        isUpdating = true;
        
        const { updateSatellites } = useOrbitSim.getState();
        updateSatellites(satellites);
        
        // Reset flag after update completes
        requestAnimationFrame(() => {
          isUpdating = false;
        });
      } else {
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
        // Reduced routes: 1 route per 15 satellites, min 3, max 30
        const numRoutes = Math.min(Math.max(Math.floor(satellites.length / 15), 3), 30);
        
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
      if (isUpdating) return;
      
      const policyHash = routerPolicy ? JSON.stringify(routerPolicy) : "";
      if (policyHash === lastRouterPolicy) return;
      
      lastRouterPolicy = policyHash;
      isUpdating = true;
      
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
      isUpdating = false;
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
      console.log(`[OrbitalDataSync] FORCE route gen: ${satellites.length} sats, ${routes.length} routes`);
      
      if (satellites.length > 0) {
        // Generate routes directly
        const testRoutes: any[] = [];
        const numRoutes = Math.min(20, satellites.length);
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
        
        console.log(`[OrbitalDataSync] FORCE generated ${testRoutes.length} routes`);
        useOrbitSim.setState({ routes: testRoutes });
        
        // Verify
        setTimeout(() => {
          const verify = useOrbitSim.getState();
          console.log(`[OrbitalDataSync] VERIFY: ${verify.routes.length} routes now in store`);
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
      console.log(`[OrbitalDataSync] Generated test routing policy`);
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

    // Subscribe to deployed units and add satellites for them
    const unsubscribeUnits = useOrbitalUnitsStore.subscribe((state) => {
      // Prevent race condition with useSimStore subscription
      if (isUpdating) return;
      
      const deployedUnits = state.units.filter(u => u.status === "deployed" && u.deployedAt);
      const simState = useSimStore.getState().state;
      const existingSats = simState?.satellites || [];
      
      // Check if we've already processed these units
      const currentDeployedIds = new Set(deployedUnits.map(u => u.id));
      const existingDeployedIds = new Set(
        existingSats
          .filter(s => s.id.startsWith("deployed_"))
          .map(s => s.id.replace("deployed_", "").replace("_sat", ""))
      );
      
      // Only process if there are new deployments
      const newDeployments = deployedUnits.filter(u => !existingDeployedIds.has(u.id));
      if (newDeployments.length === 0) return;
      
      // Create satellites for deployed units
      const newSats: SimSatellite[] = [];
      
      if (newDeployments.length > 0) {
        console.log(`[OrbitalDataSync] 📡 Processing ${newDeployments.length} new deployed units (total units: ${state.units.length})`);
      }
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
      
      // Count existing satellites per shell
      existingSats.forEach(sat => {
        if (sat.alt_km >= 5000) {
          currentSatsPerShell["MEO"]++;
        } else if (sat.alt_km >= 900) {
          currentSatsPerShell["SSO"]++;
        } else if (sat.alt_km >= 500) {
          currentSatsPerShell["MID-LEO"]++;
        } else {
          currentSatsPerShell["VLEO"]++;
        }
      });
      
      // Get existing satellite positions for angular spacing enforcement
      const existingPositions = existingSats.map(sat => ({
        lat: sat.lat,
        lon: sat.lon,
        shell: getShellFromAltitude(sat.alt_km) as ShellType,
      }));
      
      newDeployments.forEach((unit, unitIndex) => {
        if (unit.type === "leo_pod") {
          // Assign to shell using multi-objective scoring
          const shell = assignSatelliteToShell(currentCongestion, currentSatsPerShell);
          
          // Map shell ID to ShellType
          let shellType: ShellType = "LEO";
          if (shell.shell === "MEO" || shell.id === "MEO") {
            shellType = "MEO";
          } else if (shell.shell === "GEO" || shell.id === "GEO") {
            shellType = "GEO";
          }
          
          // Generate satellite position using physically coherent positioning
          const position = generateSatellitePosition(shellType, existingPositions);
          
          if (position) {
            // Generate orbital state for this position
            const orbitalState = generateOrbitalState(position.alt, getRandomInclination());
            // Set theta based on longitude
            orbitalState.theta = position.lon * (Math.PI / 180);
            
            // Create satellite with orbital state AND xyz coordinates
            // For now, all satellites are Class A (Class B available from 2030)
            const currentYear = useSimulationStore.getState().timeline.length > 0
              ? useSimulationStore.getState().timeline[useSimulationStore.getState().timeline.length - 1]?.year || 2025
              : 2025;
            const satelliteClass = currentYear >= 2030 && Math.random() < 0.3 ? "B" : "A"; // 30% Class B after 2030 (placeholder)
            
            newSats.push({
              id: `deployed_${unit.id}_sat`,
              lat: position.lat,
              lon: position.lon,
              alt_km: position.alt,
              // CRITICAL: Include x, y, z coordinates so satellites persist
              x: position.x,
              y: position.y,
              z: position.z,
              sunlit: true,
              utilization: 0.5,
              capacityMw: 0.1, // 100kW = 0.1MW
              nearestGatewayId: "test_gateway",
              latencyMs: 50,
              // Store orbital state
              orbitalState: orbitalState as any,
              // Store satellite class
              satelliteClass: satelliteClass as any,
            });
            
            // Add to existing positions for next satellite
            existingPositions.push({
              lat: position.lat,
              lon: position.lon,
              shell: shellType,
            });
            
            console.log(`[OrbitalDataSync] 🚀 Created satellite for unit ${unit.id} in shell ${shellType} at ${position.alt.toFixed(0)}km, lat=${position.lat.toFixed(1)}°, lon=${position.lon.toFixed(1)}°`);
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
      
      // Combine existing satellites with deployed unit satellites
      // Remove old deployed satellites and add new ones
      const filteredExisting = existingSats.filter(s => !s.id.startsWith("deployed_"));
      const allSats = [...filteredExisting, ...newSats];
      
      // Always update if we have new satellites or if count changed
      if (newSats.length > 0 || allSats.length !== existingSats.length) {
        console.log(`[OrbitalDataSync] 🚀 Adding ${newSats.length} new satellites (total: ${allSats.length}, was: ${existingSats.length})`);
        
        // Set updating flag to prevent race condition
        isUpdating = true;
        
        // CRITICAL: Update orbit store directly - this is the source of truth for deployed satellites
        // DO NOT update simStore - this prevents the subscription from overwriting our satellites
        // The orbit store is the authoritative source for deployed satellites
        const { updateSatellites } = useOrbitSim.getState();
        updateSatellites(allSats);
        console.log(`[OrbitalDataSync] ✅ Synced ${allSats.length} satellites to orbit store (NOT updating simStore to prevent overwrite)`);
        
        // Update hash to prevent subscription from trying to sync
        const newHash = allSats.map(s => s.id).join(",");
        lastSatellites = newHash;
        
        // Reset flag immediately since we're not updating simStore
        setTimeout(() => {
          isUpdating = false;
        }, 100);
      }
    });
    
    // Cleanup function - unsubscribe from all stores and clear intervals
    return () => {
      clearTimeout(timeoutId);
      clearInterval(forceInterval);
      clearInterval(policyInterval);
      unsubscribeSim();
      unsubscribeRouter();
      unsubscribeUnits();
      console.log("[OrbitalDataSync] Component unmounting - cleaned up all subscriptions");
    };
  }, []);

  return null; // This is just a sync component
}

