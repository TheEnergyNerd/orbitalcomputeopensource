"use client";

import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { useSimStore } from "../store/simStore";
import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { getGlobalViewer } from "../hooks/useCesiumViewer";
import { getOrbitalComputeKw } from "../lib/sim/orbitConfig";

// Helper function to generate sun-synchronous orbital positions
// Sun-synchronous orbits maintain constant solar illumination (~98° inclination)
function generateSunSyncOrbitPosition(
  unitId: string,
  satelliteIndex: number,
  totalSatellites: number,
  timeOffset: number = 0
): { lat: number; lon: number; alt: number } {
  // Sun-synchronous orbit parameters
  const altitude = 700; // km - typical sun-sync altitude (600-800 km range)
  const inclination = 98.0; // degrees - sun-synchronous inclination (retrograde)
  const earthRadius = 6371.0; // km
  
  // Use unit ID hash to ensure consistent positions for the same unit
  let hash = 0;
  for (let i = 0; i < unitId.length; i++) {
    hash = ((hash << 5) - hash) + unitId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Distribute satellites evenly across orbital planes
  const numPlanes = Math.ceil(Math.sqrt(totalSatellites));
  const planeIndex = satelliteIndex % numPlanes;
  const satInPlane = Math.floor(satelliteIndex / numPlanes);
  const satsPerPlane = Math.ceil(totalSatellites / numPlanes);
  
  // Longitude of ascending node (spread planes evenly)
  const longitudeOfAscendingNode = (planeIndex / numPlanes) * 360 + (hash % 180);
  
  // Mean anomaly (position within the orbit)
  const meanAnomaly = (satInPlane / satsPerPlane) * 360 + (hash % 60);
  
  // Calculate orbital period (seconds) for circular orbit
  const mu = 398600.4418; // km^3/s^2 (Earth's gravitational parameter)
  const semiMajorAxis = earthRadius + altitude; // km
  const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu); // seconds
  
  // Animate orbital motion based on time
  const currentTime = (Date.now() / 1000 + timeOffset) % orbitalPeriod;
  const meanAnomalyNow = (meanAnomaly + (currentTime / orbitalPeriod) * 360) % 360;
  
  // Convert mean anomaly to true anomaly (for circular orbit, they're equal)
  const trueAnomaly = meanAnomalyNow;
  const trueAnomalyRad = trueAnomaly * Math.PI / 180;
  const inclinationRad = inclination * Math.PI / 180;
  const lonAscNodeRad = longitudeOfAscendingNode * Math.PI / 180;
  
  // Convert orbital elements to geodetic coordinates
  // Using simplified spherical Earth model
  // Latitude from inclination and true anomaly
  const lat = Math.asin(Math.sin(trueAnomalyRad) * Math.sin(inclinationRad)) * 180 / Math.PI;
  
  // Longitude from longitude of ascending node and argument of latitude
  const argLat = Math.atan2(
    Math.tan(trueAnomalyRad) * Math.cos(inclinationRad),
    Math.cos(trueAnomalyRad)
  );
  let lon = (longitudeOfAscendingNode + argLat * 180 / Math.PI) % 360;
  if (lon > 180) lon -= 360;
  
  return {
    lat,
    lon,
    alt: altitude
  };
}

// Set Cesium Ion token and base URL
if (typeof window !== "undefined") {
  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  }
  (window as any).CESIUM_BASE_URL = "/cesium/";
}

export default function SandboxGlobe({ viewerRef }: { viewerRef?: React.MutableRefObject<Cesium.Viewer | null> }) {
  const internalViewerRef = useRef<Cesium.Viewer | null>(null);
  const actualViewerRef = viewerRef || internalViewerRef;
  const state = useSimStore((s) => s.state);
  const { orbitalComputeUnits, groundDCReduction, isMostlySpaceMode, simState } = useSandboxStore();
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const jobFlowRef = useRef<Cesium.Entity[]>([]);
  const pulseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isSurgeActive, setIsSurgeActive] = useState(false);
  const deployedUnitsRef = useRef<Set<string>>(new Set());
  const animationRefs = useRef<Map<string, { startTime: number; entity: Cesium.Entity }>>(new Map());
  const deployedPodSatellitesRef = useRef<Map<string, { unitId: string; entityIds: string[] }>>(new Map());
  const [countryLinesLoaded, setCountryLinesLoaded] = useState(false);
  const cameraInitializedRef = useRef(false);
  const mostlySpaceModeCameraFlewRef = useRef(false);
  const launchArcsRef = useRef<Cesium.Entity[]>([]);
  const lastLaunchCountRef = useRef(0);
  
  // Memory management: Track all intervals, timeouts, and animation frames for cleanup
  const activeIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const activeTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const activeAnimationFramesRef = useRef<Set<number>>(new Set());
  const lastMemoryCleanupRef = useRef<number>(0);
  const entityCreationTimesRef = useRef<Map<string, number>>(new Map()); // Track when entities were created
  const entityTypeCountsRef = useRef<Map<string, number>>(new Map()); // Track entity types
  const memoryHistoryRef = useRef<Array<{ time: number; usedMB: number; entities: number }>>([]); // Track memory over time
  const entityCreationLogRef = useRef<Array<{ time: number; type: string; id: string }>>([]); // Log entity creations
  const entityRemovalLogRef = useRef<Array<{ time: number; type: string; id: string }>>([]); // Log entity removals
  
  // Rate limiter for entity creation
  const entityCreationRateLimiterRef = useRef<{ count: number; resetTime: number }>({ count: 0, resetTime: Date.now() });
  const MAX_ENTITIES_PER_SECOND = 20; // Hard limit on entity creation rate
  
  // Wrapper functions to track intervals/timeouts/animation frames
  const trackedSetInterval = (callback: () => void, delay: number): NodeJS.Timeout => {
    const id = setInterval(() => {
      callback();
    }, delay);
    activeIntervalsRef.current.add(id);
    return id;
  };
  
  const trackedSetTimeout = (callback: () => void, delay: number): NodeJS.Timeout => {
    const id = setTimeout(() => {
      activeTimeoutsRef.current.delete(id);
      callback();
    }, delay);
    activeTimeoutsRef.current.add(id);
    return id;
  };
  
  const trackedRequestAnimationFrame = (callback: () => void): number => {
    const id = requestAnimationFrame(() => {
      activeAnimationFramesRef.current.delete(id);
      callback();
    });
    activeAnimationFramesRef.current.add(id);
    return id;
  };
  
  // Helper function to add entity and track creation time
  const addTrackedEntity = (entities: Cesium.EntityCollection, entityOptions: Cesium.Entity.ConstructorOptions): Cesium.Entity | null => {
    const now = Date.now();
    const limiter = entityCreationRateLimiterRef.current;
    
    // Reset counter if a second has passed
    if (now - limiter.resetTime > 1000) {
      limiter.count = 0;
      limiter.resetTime = now;
    }
    
    // Rate limit: if we're creating too many entities, skip this one
    if (limiter.count >= MAX_ENTITIES_PER_SECOND) {
      // Only warn occasionally to avoid spam
      if (limiter.count === MAX_ENTITIES_PER_SECOND) {
        console.warn(`[MemoryDebug] ⚠️ Rate limit exceeded: ${limiter.count} entities created in last second, skipping further entity creation`);
      }
      return null; // Don't create the entity
    }
    
    limiter.count++;
    
    const entity = entities.add(entityOptions);
    const entityId = entity.id as string;
    
    if (entityId) {
      entityCreationTimesRef.current.set(entityId, now);
      
      // Track entity type
      const entityType = (entity as any)._entityType || 'unknown';
      const typeCount = entityTypeCountsRef.current.get(entityType) || 0;
      entityTypeCountsRef.current.set(entityType, typeCount + 1);
      
      // Log entity creation (keep last 100)
      entityCreationLogRef.current.push({ time: now, type: entityType, id: entityId });
      if (entityCreationLogRef.current.length > 100) {
        entityCreationLogRef.current.shift();
      }
      
      // Log if creating many entities quickly
      const recentCreations = entityCreationLogRef.current.filter(e => now - e.time < 1000);
      if (recentCreations.length > 10) {
        console.warn(`[MemoryDebug] ⚠️ Creating entities rapidly: ${recentCreations.length} in last second`);
        // Trigger aggressive cleanup if creating too fast
        if (recentCreations.length > 30) {
          console.error(`[MemoryDebug] 🚨 EMERGENCY: Creating ${recentCreations.length} entities/sec - triggering emergency cleanup`);
          setTimeout(() => performMemoryCleanup(), 100);
        }
      }
    }
    return entity;
  };
  
  // Helper function to remove entity and track removal
  const removeTrackedEntity = (entities: Cesium.EntityCollection, entity: Cesium.Entity) => {
    const entityId = entity.id as string;
    const entityType = (entity as any)._entityType || 'unknown';
    const now = Date.now();
    
    try {
      entities.remove(entity);
      
      if (entityId) {
        entityCreationTimesRef.current.delete(entityId);
        
        // Update type count
        const typeCount = entityTypeCountsRef.current.get(entityType) || 0;
        if (typeCount > 0) {
          entityTypeCountsRef.current.set(entityType, typeCount - 1);
        }
        
        // Log entity removal (keep last 100)
        entityRemovalLogRef.current.push({ time: now, type: entityType, id: entityId });
        if (entityRemovalLogRef.current.length > 100) {
          entityRemovalLogRef.current.shift();
        }
      }
    } catch (e) {
      // Entity already removed
    }
  };
  
  // Comprehensive memory cleanup function with debugging
  const performMemoryCleanup = () => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed()) return;
    
    try {
      const entities = viewer.entities;
      const now = Date.now();
      const MAX_ENTITY_AGE_MS = 300000; // 5 minutes - remove entities older than this
      const MAX_ENTITIES = 80; // Aggressive limit
      
      // Get all entities
      const allEntities = Array.from(entities.values);
      const entityCount = allEntities.length;
      
      // Enhanced memory debugging
      const memoryInfo = (performance as any).memory;
      if (memoryInfo) {
        const usedMB = memoryInfo.usedJSHeapSize / 1048576;
        const totalMB = memoryInfo.totalJSHeapSize / 1048576;
        const limitMB = memoryInfo.jsHeapSizeLimit / 1048576;
        const usagePercent = (usedMB / limitMB) * 100;
        
        // Log entity breakdown for debugging
        const entityBreakdown: Record<string, number> = {};
        allEntities.forEach(entity => {
          const id = entity.id as string;
          if (id) {
            const prefix = id.split('_')[0] + '_' + (id.split('_')[1] || '');
            entityBreakdown[prefix] = (entityBreakdown[prefix] || 0) + 1;
          }
        });
        
        // Track memory history (keep last 20 snapshots)
        memoryHistoryRef.current.push({ time: now, usedMB, entities: entityCount });
        if (memoryHistoryRef.current.length > 20) {
          memoryHistoryRef.current.shift();
        }
        
        // Calculate memory growth rate
        let memoryGrowthRate = 0;
        if (memoryHistoryRef.current.length >= 2) {
          const oldest = memoryHistoryRef.current[0];
          const newest = memoryHistoryRef.current[memoryHistoryRef.current.length - 1];
          const timeDiff = (newest.time - oldest.time) / 1000; // seconds
          if (timeDiff > 0) {
            memoryGrowthRate = (newest.usedMB - oldest.usedMB) / timeDiff; // MB per second
          }
        }
        
        // Calculate entity creation/removal rates
        const recentCreations = entityCreationLogRef.current.filter(e => now - e.time < 5000).length;
        const recentRemovals = entityRemovalLogRef.current.filter(e => now - e.time < 5000).length;
        
        // Only log warnings for high memory usage - disable verbose logging
        if (usagePercent > 80 || memoryGrowthRate > 5 || entityCount > 100) {
          console.warn(`[MemoryDebug] High memory: ${usedMB.toFixed(1)}MB (${usagePercent.toFixed(1)}%), Entities: ${entityCount}, Growth: ${memoryGrowthRate >= 0 ? '+' : ''}${memoryGrowthRate.toFixed(2)}MB/s`);
        }
        
        // Warn if memory is getting critical
        if (usagePercent > 85) {
          console.warn(`[MemoryDebug] ⚠️ CRITICAL: Memory usage at ${usagePercent.toFixed(1)}% (${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB)`);
          console.warn(`[MemoryDebug] Entity breakdown:`, entityBreakdown);
          console.warn(`[MemoryDebug] Active timers: intervals=${activeIntervalsRef.current.size}, timeouts=${activeTimeoutsRef.current.size}, frames=${activeAnimationFramesRef.current.size}`);
          console.warn(`[MemoryDebug] Launch arcs: ${launchArcsRef.current.length}, Active launches: ${activeLaunchesRef.current.length}, Job flows: ${jobFlowRef.current.length}`);
          console.warn(`[MemoryDebug] Deployed pod satellites: ${deployedPodSatellitesRef.current.size}, Animation refs: ${animationRefs.current.size}`);
          console.warn(`[MemoryDebug] Aggressively cleaning up entities...`);
        }
        
        // Log before OOM to help diagnose
        if (usagePercent > 90) {
          console.error(`[MemoryDebug] 🚨 PRE-OOM: Memory at ${usagePercent.toFixed(1)}% - System may crash soon!`);
          console.error(`[MemoryDebug] Top entity prefixes:`, Object.entries(entityBreakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => `${type}:${count}`)
            .join(', '));
          console.error(`[MemoryDebug] Top entity types:`, Object.entries(Object.fromEntries(entityTypeCountsRef.current))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => `${type}:${count}`)
            .join(', '));
          console.error(`[MemoryDebug] Recent entity creations (last 10):`, entityCreationLogRef.current.slice(-10));
          console.error(`[MemoryDebug] Memory history:`, memoryHistoryRef.current.map(h => `${h.usedMB.toFixed(1)}MB@${((now - h.time)/1000).toFixed(0)}s`).join(' → '));
          
          // Analyze what's taking up space
          const largeEntityTypes = Object.entries(Object.fromEntries(entityTypeCountsRef.current))
            .filter(([_, count]) => count > 10)
            .sort((a, b) => b[1] - a[1]);
          if (largeEntityTypes.length > 0) {
            console.error(`[MemoryDebug] Large entity type groups (>10 entities):`, largeEntityTypes);
          }
        }
      }
      
      // If we have too many entities, aggressively clean up
      if (entityCount > MAX_ENTITIES) {
        // Sort entities by creation time (oldest first)
        const entitiesWithAge = allEntities.map(entity => ({
          entity,
          age: entityCreationTimesRef.current.get(entity.id as string) || 0,
          id: entity.id as string,
        })).sort((a, b) => a.age - b.age);
        
        // Remove oldest entities (keep launch sites, country outlines, and recent entities)
        let removed = 0;
        const targetRemoval = entityCount - MAX_ENTITIES;
        
        for (const { entity, id } of entitiesWithAge) {
          if (removed >= targetRemoval) break;
          
          // Preserve important entities
          if (id && (
            id.startsWith('launch_site_') ||
            id.startsWith('country_outline_') ||
            id.startsWith('deployed_pod_') ||
            id.startsWith('deployed_server_farm_') ||
            id.startsWith('deployed_geo_hub_')
          )) {
            continue;
          }
          
          // Remove old entity
          try {
            entities.remove(entity);
            entityCreationTimesRef.current.delete(id);
            removed++;
          } catch (e) {
            // Entity already removed
          }
        }
      }
      
      // Clean up old entities based on age
      allEntities.forEach(entity => {
        const entityId = entity.id as string;
        if (!entityId) return;
        
        const creationTime = entityCreationTimesRef.current.get(entityId);
        if (!creationTime) return;
        
        // Skip important entities
        if (entityId.startsWith('launch_site_') || 
            entityId.startsWith('country_outline_') ||
            entityId.startsWith('deployed_pod_') ||
            entityId.startsWith('deployed_server_farm_') ||
            entityId.startsWith('deployed_geo_hub_')) {
          return;
        }
        
        // Remove entities older than MAX_ENTITY_AGE_MS
        if (now - creationTime > MAX_ENTITY_AGE_MS) {
          try {
            entities.remove(entity);
            entityCreationTimesRef.current.delete(entityId);
          } catch (e) {
            // Entity already removed
          }
        }
      });
      
      // Clean up completed launch animations
      const completedLaunches = activeLaunchesRef.current.filter(launch => {
        const elapsed = now - launch.startTime;
        return elapsed > launch.durationMs + 5000; // 5 seconds after completion
      });
      
      completedLaunches.forEach(launch => {
        const arcId = `launch_arc_${launch.id}`;
        const podId = `launch_pod_${launch.id}`;
        // REMOVED: dotId - cosmetic traffic removed
        
        try {
          const arcEntity = entities.getById(arcId);
          const podEntity = entities.getById(podId);
          
          if (arcEntity) entities.remove(arcEntity);
          if (podEntity) entities.remove(podEntity);
          if (dotEntity) entities.remove(dotEntity);
          
          entityCreationTimesRef.current.delete(arcId);
          entityCreationTimesRef.current.delete(podId);
          entityCreationTimesRef.current.delete(dotId);
        } catch (e) {
          // Already removed
        }
      });
      
      activeLaunchesRef.current = activeLaunchesRef.current.filter(launch => {
        const elapsed = now - launch.startTime;
        return elapsed <= launch.durationMs + 5000;
      });
      
      // Clean up old job flow entities
      if (jobFlowRef.current.length > 5) {
        const toRemove = jobFlowRef.current.splice(0, jobFlowRef.current.length - 5);
        toRemove.forEach(entity => {
          try {
            entities.remove(entity);
            if (entity.id) entityCreationTimesRef.current.delete(entity.id as string);
          } catch (e) {
            // Already removed
          }
        });
      }
      
      // Clean up old launch arcs
      const oldArcs = launchArcsRef.current.filter(arc => {
        const arcId = arc.id as string;
        if (!arcId) return false;
        const creationTime = entityCreationTimesRef.current.get(arcId);
        if (!creationTime) return false;
        return now - creationTime > 300000; // 5 minutes
      });
      
      oldArcs.forEach(arc => {
        try {
          entities.remove(arc);
          const arcId = arc.id as string;
          if (arcId) entityCreationTimesRef.current.delete(arcId);
        } catch (e) {
          // Already removed
        }
      });
      
      launchArcsRef.current = launchArcsRef.current.filter(arc => {
        const arcId = arc.id as string;
        if (!arcId) return true;
        const creationTime = entityCreationTimesRef.current.get(arcId);
        if (!creationTime) return true;
        return now - creationTime <= 300000;
      });
      
      // Clean up old deployed pod satellites (keep only recent ones)
      const maxDeployedSatellites = 30;
      if (deployedPodSatellitesRef.current.size > maxDeployedSatellites) {
        const entries = Array.from(deployedPodSatellitesRef.current.entries());
        const toRemove = entries.slice(0, entries.length - maxDeployedSatellites);
        
        toRemove.forEach(([unitId, podData]) => {
          podData.entityIds.forEach(entityId => {
            try {
              const entity = entities.getById(entityId);
              if (entity) entities.remove(entity);
              entityCreationTimesRef.current.delete(entityId);
            } catch (e) {
              // Already removed
            }
          });
          deployedPodSatellitesRef.current.delete(unitId);
        });
      }
      
      // Clean up old animation refs
      const maxAnimationRefs = 10;
      if (animationRefs.current.size > maxAnimationRefs) {
        const entries = Array.from(animationRefs.current.entries());
        const toRemove = entries.slice(0, entries.length - maxAnimationRefs);
        
        toRemove.forEach(([id, data]) => {
          try {
            entities.remove(data.entity);
            entityCreationTimesRef.current.delete(id);
          } catch (e) {
            // Already removed
          }
        });
        
        toRemove.forEach(([id]) => animationRefs.current.delete(id));
      }
      
      lastMemoryCleanupRef.current = now;
    } catch (e) {
      // Ignore cleanup errors
    }
  };
  
  // Launch animation system
  interface LaunchEvent {
    id: string;
    startLat: number;
    startLng: number;
    targetLat: number;
    targetLng: number;
    t: number; // 0 → 1 animation progress
    durationMs: number;
    startTime: number;
    currentPos?: Cesium.Cartesian3; // Current position for callback
  }
  
  const activeLaunchesRef = useRef<LaunchEvent[]>([]);
  const lastOrbitalShareRef = useRef<number>(-1); // Initialize to -1 to detect first load
  const lastPodsInOrbitRef = useRef<number>(-1); // Initialize to -1 to detect first load
  const lastLaunchesNeededRef = useRef<number>(-1); // Track launchesNeeded for animation triggers
  const lastLaunchSpawnTimeRef = useRef<number>(0); // Track last launch spawn time for cooldown
  const launchAnimationFrameRef = useRef<number | null>(null);
  const animationLoopStartedRef = useRef<boolean>(false);
  const initialSpawnDoneRef = useRef<boolean>(false);
  
  // Fixed launch sites
  const LAUNCH_SITES = [
    { lat: 28.5623, lng: -80.5774, name: "Cape Canaveral" }, // SLC-40
    { lat: 25.9971, lng: -97.1554, name: "Boca Chica" }, // SpaceX Starbase
    { lat: 34.7420, lng: -120.5724, name: "Vandenberg" }, // LC-576E
    { lat: 5.2397, lng: -52.7686, name: "Kourou" }, // Guiana Space Centre
  ];

  // Periodic memory snapshot - runs every 5 seconds for detailed tracking
  useEffect(() => {
    const snapshotInterval = trackedSetInterval(() => {
      const viewer = actualViewerRef.current || getGlobalViewer();
      if (!viewer || viewer.isDestroyed()) return;
      
      const memoryInfo = (performance as any).memory;
      if (memoryInfo) {
        const usedMB = memoryInfo.usedJSHeapSize / 1048576;
        const totalMB = memoryInfo.totalJSHeapSize / 1048576;
        const limitMB = memoryInfo.jsHeapSizeLimit / 1048576;
        const usagePercent = (usedMB / limitMB) * 100;
        const entities = viewer.entities;
        const entityCount = entities.values.length;
        
        // Detailed snapshot
        const snapshot = {
          time: Date.now(),
          memory: {
            usedMB: usedMB.toFixed(1),
            totalMB: totalMB.toFixed(1),
            limitMB: limitMB.toFixed(1),
            usagePercent: usagePercent.toFixed(1),
          },
          entities: {
            total: entityCount,
            byType: Object.fromEntries(entityTypeCountsRef.current),
            creationRate: entityCreationLogRef.current.filter(e => Date.now() - e.time < 5000).length,
            removalRate: entityRemovalLogRef.current.filter(e => Date.now() - e.time < 5000).length,
          },
          refs: {
            intervals: activeIntervalsRef.current.size,
            timeouts: activeTimeoutsRef.current.size,
            animationFrames: activeAnimationFramesRef.current.size,
            launchArcs: launchArcsRef.current.length,
            activeLaunches: activeLaunchesRef.current.length,
            jobFlows: jobFlowRef.current.length,
            deployedPodSatellites: deployedPodSatellitesRef.current.size,
            animationRefs: animationRefs.current.size,
          },
        };
        
        // Log snapshot if memory is high or growing
        if (usagePercent > 70 || entityCount > 50) {
          console.log(`[MemorySnapshot]`, snapshot);
        }
      }
    }, 5000); // Every 5 seconds
    
    return () => {
      if (snapshotInterval) {
        clearInterval(snapshotInterval);
        activeIntervalsRef.current.delete(snapshotInterval);
      }
    };
  }, [actualViewerRef]);

  // Periodic memory cleanup - runs every 30 seconds
  useEffect(() => {
    const cleanupInterval = trackedSetInterval(() => {
      performMemoryCleanup();
    }, 30000); // Every 30 seconds
    
    // Also run cleanup immediately
    performMemoryCleanup();
    
    return () => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        activeIntervalsRef.current.delete(cleanupInterval);
      }
    };
  }, [actualViewerRef]);
  
  // Comprehensive cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all tracked intervals
      activeIntervalsRef.current.forEach(id => {
        try {
          clearInterval(id);
        } catch (e) {
          // Ignore
        }
      });
      activeIntervalsRef.current.clear();
      
      // Clear all tracked timeouts
      activeTimeoutsRef.current.forEach(id => {
        try {
          clearTimeout(id);
        } catch (e) {
          // Ignore
        }
      });
      activeTimeoutsRef.current.clear();
      
      // Cancel all tracked animation frames
      activeAnimationFramesRef.current.forEach(id => {
        try {
          cancelAnimationFrame(id);
        } catch (e) {
          // Ignore
        }
      });
      activeAnimationFramesRef.current.clear();
      
      // Clear launch animation frame
      if (launchAnimationFrameRef.current !== null) {
        try {
          cancelAnimationFrame(launchAnimationFrameRef.current);
        } catch (e) {
          // Ignore
        }
        launchAnimationFrameRef.current = null;
      }
      
      // Clear pulse interval
      if (pulseIntervalRef.current) {
        try {
          clearInterval(pulseIntervalRef.current);
        } catch (e) {
          // Ignore
        }
        pulseIntervalRef.current = null;
      }
      
      // Clear all refs
      activeLaunchesRef.current = [];
      jobFlowRef.current = [];
      launchArcsRef.current = [];
      deployedPodSatellitesRef.current.clear();
      animationRefs.current.clear();
      entityCreationTimesRef.current.clear();
      deployedUnitsRef.current.clear();
      
      // Final memory cleanup
      performMemoryCleanup();
    };
  }, []);
  
  // Listen for surge events
  useEffect(() => {
    const handleSurgeEvent = () => {
      setIsSurgeActive(true);
      trackedSetTimeout(() => setIsSurgeActive(false), 5000);
    };
    window.addEventListener("surge-event" as any, handleSurgeEvent);
    return () => window.removeEventListener("surge-event" as any, handleSurgeEvent);
  }, []);

  // Ensure country outlines are added to the shared viewer
  useEffect(() => {
    // Timeout to prevent infinite loading - mark as loaded after 3 seconds
    const timeout = setTimeout(() => {
      if (!countryLinesLoaded) {
        console.warn("[SandboxGlobe] Country borders timeout - marking as loaded");
        setCountryLinesLoaded(true);
      }
    }, 3000);

    // Try to load country borders when viewer is available
    const tryLoadBorders = () => {
      // Prefer the shared global viewer managed by useCesiumViewer
      let viewer = actualViewerRef.current;
      if (!viewer || viewer.isDestroyed()) {
        viewer = getGlobalViewer();
        if (viewer && !viewer.isDestroyed()) {
          actualViewerRef.current = viewer;
        }
      }

      if (!viewer) {
        // Retry after a short delay if viewer not ready
        setTimeout(tryLoadBorders, 200);
        return;
      }

      if (viewer.isDestroyed()) return;

      // Check if already loaded
      try {
        const existing = viewer.dataSources.getByName("country_outlines");
        if (existing && existing.length > 0) {
          console.log("[SandboxGlobe] Country outlines already exist");
          setCountryLinesLoaded(true);
          clearTimeout(timeout);
          return;
        }
      } catch (e) {
        // Continue to load
      }

      // Use the same ensureCountryOutlines function from CesiumGlobe
      const ensureCountryOutlines = async () => {
        if (!viewer || viewer.isDestroyed()) {
          setCountryLinesLoaded(true); // Mark as loaded even if failed
          return null;
        }

        if ((viewer as any)._countryOutlinePromise) {
          const promise = (viewer as any)._countryOutlinePromise;
          promise.then(() => {
            setCountryLinesLoaded(true);
            clearTimeout(timeout);
          }).catch(() => {
            setCountryLinesLoaded(true);
            clearTimeout(timeout);
          });
          return promise;
        }

        const COUNTRY_GEOJSON_URL =
          "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";

        const promise = (async () => {
          try {
            const dataSource = await Cesium.GeoJsonDataSource.load(COUNTRY_GEOJSON_URL, {
              stroke: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.5),
              fill: Cesium.Color.TRANSPARENT,
              strokeWidth: 1.2,
            });
            dataSource.name = "country_outlines";
            viewer.dataSources.add(dataSource);
            (viewer as any)._countryOutlineSource = dataSource;
            console.log("[SandboxGlobe] Country outlines loaded successfully");
            setCountryLinesLoaded(true);
            clearTimeout(timeout);
            return dataSource;
          } catch (error) {
            console.warn("[SandboxGlobe] GeoJSON outlines failed, using fallback:", error);
            // Fallback: simple outlines
            try {
              const outlines = [
                [-125, 49, -66, 49, -66, 25, -125, 25, -125, 49],
                [-140, 83, -52, 83, -52, 42, -140, 42, -140, 83],
                [-118, 32, -86, 32, -86, 14, -118, 14, -118, 32],
                [-10, 71, 40, 71, 40, 35, -10, 35, -10, 71],
              ];
              outlines.forEach((coords, idx) => {
                addTrackedEntity(viewer.entities, {
                  id: `country_outline_${idx}`,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(coords),
                    width: 1,
                    material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.4),
                  },
                });
              });
              console.log("[SandboxGlobe] Fallback country outlines added");
            } catch (fallbackError) {
              console.warn("[SandboxGlobe] Fallback also failed:", fallbackError);
            }
            setCountryLinesLoaded(true);
            clearTimeout(timeout);
            return null;
          }
        })();

        (viewer as any)._countryOutlinePromise = promise;
        return promise;
      };

      ensureCountryOutlines();
    };

    // Start trying to load
    tryLoadBorders();

    return () => {
      clearTimeout(timeout);
    };
  }, [actualViewerRef.current, countryLinesLoaded]);

  // Configure shared viewer for sandbox (viewer is created by useCesiumViewer hook)
  useEffect(() => {
    // Mounted, checking for viewer

    // Wait for viewer to be ready - use interval to check periodically
    let retryCount = 0;
    const maxRetries = 50; // 5 seconds max

    const checkViewer = () => {
      let viewer = actualViewerRef.current;
      if (!viewer || viewer.isDestroyed()) {
        viewer = getGlobalViewer();
        if (viewer && !viewer.isDestroyed()) {
          actualViewerRef.current = viewer;
        }
      }

      if (!viewer) {
        retryCount++;
        if (retryCount < maxRetries) {
          // Retry after a short delay if viewer not ready
          setTimeout(checkViewer, 100);
        } else {
          console.warn("[SandboxGlobe] Viewer not ready after max retries");
        }
        return;
      }

      if (viewer.isDestroyed()) {
        console.warn("[SandboxGlobe] Viewer is destroyed");
        return;
      }

      // Configuring viewer for sandbox mode

      // Configure viewer settings for sandbox
      // Only set initial view once on first mount
      try {
        if (!cameraInitializedRef.current) {
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(-100, 40, 15000000),
          });
          cameraInitializedRef.current = true;
        }

        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a2332");
        viewer.scene.globe.enableLighting = false;
        viewer.scene.skyBox = undefined;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#000000");
        viewer.scene.fog.enabled = false;
        viewer.scene.globe.showGroundAtmosphere = false;
        viewer.scene.globe.showWaterEffect = false;
        
        // Disable scroll wheel zoom - allow page scrolling instead
        viewer.scene.screenSpaceCameraController.enableZoom = false;
        
        // Disable depth testing against terrain for performance
        viewer.scene.globe.depthTestAgainstTerrain = false;
        
        // ALWAYS ensure globe is visible - set multiple times to ensure it sticks
        viewer.scene.globe.show = true;
        
        // Force multiple renders to ensure globe shows
        setTimeout(() => {
          if (!viewer.isDestroyed()) {
            viewer.scene.globe.show = true;
            viewer.scene.requestRender();
          }
        }, 100);
        setTimeout(() => {
          if (!viewer.isDestroyed()) {
            viewer.scene.globe.show = true;
            viewer.scene.requestRender();
          }
        }, 500);

        if (viewer.scene.globe.imageryLayers.length > 0) {
          viewer.scene.globe.imageryLayers.get(0).alpha = 0.15;
        }

        // Force initial render - requestRenderMode might prevent initial render
        viewer.scene.requestRender();
        
        // Also ensure canvas is visible
        const container = document.getElementById("cesium-globe-container");
        if (container) {
          const canvas = container.querySelector("canvas");
          if (canvas) {
            (canvas as HTMLElement).style.display = "block";
            (canvas as HTMLElement).style.visibility = "visible";
            (canvas as HTMLElement).style.opacity = "1";
            (canvas as HTMLElement).style.width = "100%";
            (canvas as HTMLElement).style.height = "100%";
            (canvas as HTMLElement).style.position = "absolute";
            (canvas as HTMLElement).style.top = "0";
            (canvas as HTMLElement).style.left = "0";
            (canvas as HTMLElement).style.zIndex = "0";
            // Canvas styles applied
          }
        }
        
        // Force multiple renders to ensure it shows
        setTimeout(() => {
          if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 100);
        setTimeout(() => {
          if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 500);
        setTimeout(() => {
          if (!viewer.isDestroyed()) viewer.scene.requestRender();
        }, 1000);
        
        // Watchdog: Periodically check and fix container/widget dimensions
        // Also use ResizeObserver for immediate detection
        const containerEl = document.getElementById("cesium-globe-container");
        let resizeObserver: ResizeObserver | null = null;
        let mutationObserver: MutationObserver | null = null;
        
        if (containerEl) {
          // ResizeObserver: Watch for size changes
          resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { height, width } = entry.contentRect;
              const viewportHeight = window.innerHeight;
              const viewportWidth = window.innerWidth;
              
              // If container collapsed significantly OR viewport itself is suspiciously small, fix immediately
              // Check if viewport is suspiciously small (likely a layout bug)
              const isViewportSuspicious = viewportHeight < 400 || viewportWidth < 400;
              const isContainerCollapsed = height < viewportHeight * 0.5 || width < viewportWidth * 0.5;
              
              if (isContainerCollapsed || isViewportSuspicious) {
                // Use screen dimensions as fallback if viewport is suspicious
                const targetHeight = isViewportSuspicious ? window.screen.height : viewportHeight;
                const targetWidth = isViewportSuspicious ? window.screen.width : viewportWidth;
                
                // ResizeObserver detected container collapse - fixing silently
                const el = entry.target as HTMLElement;
                // Use !important via setProperty to override any conflicting styles
                el.style.setProperty('height', `${targetHeight}px`, 'important');
                el.style.setProperty('width', `${targetWidth}px`, 'important');
                el.style.setProperty('min-height', `${targetHeight}px`, 'important');
                el.style.setProperty('min-width', `${targetWidth}px`, 'important');
                el.style.setProperty('position', 'fixed', 'important');
                el.style.setProperty('top', '0', 'important');
                el.style.setProperty('left', '0', 'important');
                el.style.setProperty('right', '0', 'important');
                el.style.setProperty('bottom', '0', 'important');
                
                // Force Cesium resize
                if (!viewer.isDestroyed()) {
                  setTimeout(() => {
                    viewer.resize();
                    viewer.scene.requestRender();
                  }, 50);
                }
              }
            }
          });
          resizeObserver.observe(containerEl);
          
          // MutationObserver: Watch for style attribute changes that might collapse it
          mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const el = mutation.target as HTMLElement;
                const height = el.offsetHeight || el.clientHeight;
                const width = el.offsetWidth || el.clientWidth;
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                
                // If style changed and container is now collapsed, fix it
                if (height < viewportHeight * 0.5 || width < viewportWidth * 0.5) {
                  // MutationObserver detected container collapse - fixing silently
                  el.style.setProperty('height', `${viewportHeight}px`, 'important');
                  el.style.setProperty('width', `${viewportWidth}px`, 'important');
                  el.style.setProperty('min-height', `${viewportHeight}px`, 'important');
                  el.style.setProperty('min-width', `${viewportWidth}px`, 'important');
                  
                  if (!viewer.isDestroyed()) {
                    setTimeout(() => {
                      viewer.resize();
                      viewer.scene.requestRender();
                    }, 50);
                  }
                }
              }
            }
          });
          mutationObserver.observe(containerEl, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: false,
            subtree: false,
          });
        }
        
        // Continuous render loop to keep globe visible (less frequent to reduce GPU load)
        const renderInterval = setInterval(() => {
          if (viewer.isDestroyed()) {
            clearInterval(renderInterval);
            return;
          }
          // Force render periodically to keep globe visible (reduced frequency to prevent memory issues)
          try {
            viewer.scene.requestRender();
          } catch (e) {
            // Ignore render errors to prevent crashes
          }
        }, 2000); // Every 2 seconds (reduced from 500ms to prevent memory issues)
        
        const watchdogInterval = setInterval(() => {
          if (viewer.isDestroyed()) {
            clearInterval(watchdogInterval);
            clearInterval(renderInterval);
            if (resizeObserver) resizeObserver.disconnect();
            if (mutationObserver) mutationObserver.disconnect();
            return;
          }
          
      // ALWAYS ensure globe is visible - force it every check
      viewer.scene.globe.show = true;
      
      // Ensure globe base color is set
      if (!viewer.scene.globe.baseColor) {
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a2332");
      }
      
      // Ensure canvas is visible
      const viewerCanvas = viewer.canvas;
      if (viewerCanvas) {
        if (viewerCanvas.style.display === "none") {
          viewerCanvas.style.display = "block";
        }
        if (viewerCanvas.style.visibility === "hidden") {
          viewerCanvas.style.visibility = "visible";
        }
        if (viewerCanvas.style.opacity === "0") {
          viewerCanvas.style.opacity = "1";
        }
      }
      
      // Ensure imagery layers are visible
      if (viewer.scene.globe.imageryLayers.length === 0) {
        // Default imagery should already be added by Cesium, but ensure it's there
        // Don't try to add it manually as it may cause issues
      }
          
          const widget = (viewer as any).cesiumWidget;
          const widgetContainer = widget?.container as HTMLElement | null;
          const container = document.getElementById("cesium-globe-container");
          const canvas = container?.querySelector("canvas") as HTMLCanvasElement | null;
          
          let needsFix = false;
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          // Fix React Container if it's collapsed (should be full viewport)
          if (container) {
            const containerHeight = container.offsetHeight || container.clientHeight;
            const containerWidth = container.offsetWidth || container.clientWidth;
            
            // Check if viewport itself is suspiciously small (likely a layout bug)
            // Only flag as suspicious if very small (< 200px) to avoid false positives
            const isViewportSuspicious = viewportHeight < 200 || viewportWidth < 200;
            const isContainerCollapsed = containerHeight < viewportHeight * 0.3 || containerWidth < viewportWidth * 0.3;
            
            // If container is collapsed OR viewport is suspicious, fix it
            // Only log if container is actually collapsed (not just suspicious viewport)
            if (isContainerCollapsed || isViewportSuspicious) {
              // Use screen dimensions as fallback if viewport is suspicious
              const targetHeight = isViewportSuspicious ? window.screen.height : viewportHeight;
              const targetWidth = isViewportSuspicious ? window.screen.width : viewportWidth;
              
              // Only log if container is actually collapsed, not just viewport suspicious
              if (isContainerCollapsed) {
                console.warn("[SandboxGlobe] React Container collapsed, fixing...", {
                  containerHeight,
                  containerWidth,
                  viewportHeight,
                  viewportWidth,
                });
              }
              container.style.setProperty('height', `${targetHeight}px`, 'important');
              container.style.setProperty('width', `${targetWidth}px`, 'important');
              container.style.setProperty('min-height', `${targetHeight}px`, 'important');
              container.style.setProperty('min-width', `${targetWidth}px`, 'important');
              container.style.setProperty('position', 'fixed', 'important');
              container.style.setProperty('top', '0', 'important');
              container.style.setProperty('left', '0', 'important');
              container.style.setProperty('right', '0', 'important');
              container.style.setProperty('bottom', '0', 'important');
              needsFix = true;
            }
          }
          
          // Fix widget container height if it's 0 or too small
          if (widgetContainer) {
            const widgetHeight = widgetContainer.offsetHeight || widgetContainer.clientHeight;
            const widgetWidth = widgetContainer.offsetWidth || widgetContainer.clientWidth;
            
            if (widgetHeight === 0 || widgetHeight < viewportHeight * 0.5) {
              // Widget container height is too small - fixing silently
              widgetContainer.style.height = `${viewportHeight}px`;
              widgetContainer.style.width = `${viewportWidth}px`;
              widgetContainer.style.position = "relative";
              widgetContainer.style.overflow = "hidden";
              needsFix = true;
            }
          }
          
          // Ensure canvas is visible and properly sized - ALWAYS enforce
          if (canvas) {
            const canvasHeight = canvas.height || canvas.clientHeight;
            const canvasWidth = canvas.width || canvas.clientWidth;
            
            // Always enforce visibility
            if (canvas.style.display === "none" || canvas.style.visibility === "hidden" || canvas.style.opacity === "0") {
              canvas.style.setProperty('display', 'block', 'important');
              canvas.style.setProperty('visibility', 'visible', 'important');
              canvas.style.setProperty('opacity', '1', 'important');
              needsFix = true;
            }
            
            // Always enforce size
            if (canvasHeight < viewportHeight * 0.9 || canvasWidth < viewportWidth * 0.9) {
              canvas.width = viewportWidth;
              canvas.height = viewportHeight;
              canvas.style.setProperty('width', '100%', 'important');
              canvas.style.setProperty('height', '100%', 'important');
              canvas.style.setProperty('position', 'absolute', 'important');
              canvas.style.setProperty('top', '0', 'important');
              canvas.style.setProperty('left', '0', 'important');
              needsFix = true;
            }
          }
          
          // Always ensure container is full size
          if (container) {
            container.style.setProperty('position', 'fixed', 'important');
            container.style.setProperty('top', '0', 'important');
            container.style.setProperty('left', '0', 'important');
            container.style.setProperty('right', '0', 'important');
            container.style.setProperty('bottom', '0', 'important');
            container.style.setProperty('width', `${viewportWidth}px`, 'important');
            container.style.setProperty('height', `${viewportHeight}px`, 'important');
            container.style.setProperty('z-index', '0', 'important');
          }
          
          // Force render and resize if any fixes were applied
          if (needsFix) {
            viewer.scene.requestRender();
            // Also force a resize event to trigger Cesium's internal resize
            setTimeout(() => {
              if (!viewer.isDestroyed()) {
                viewer.resize();
                viewer.scene.requestRender();
              }
            }, 100);
          }
        }, 2000); // Check every 2 seconds (less frequent)
        
        return () => {
          clearInterval(watchdogInterval);
          clearInterval(renderInterval);
          if (resizeObserver) resizeObserver.disconnect();
          if (mutationObserver) mutationObserver.disconnect();
        };
        
        // Viewer configuration complete
      } catch (error) {
        console.error("[SandboxGlobe] Error configuring viewer:", error);
      }
    };

    // Start checking immediately and also after a delay
    checkViewer();
    const delayedCheck = setTimeout(checkViewer, 500);
    
    return () => {
      clearTimeout(delayedCheck);
    };
  }, []); // Run once on mount, not dependent on ref

  // Earth cooling effect based on carbon reduction
  useEffect(() => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed() || !state) return;
    
    // Calculate carbon reduction percentage
    const orbitShare = orbitalComputeUnits / (orbitalComputeUnits + (100 - groundDCReduction));
    const carbonReduction = orbitShare; // 0-1
    
    // Adjust globe color: cooler (more blue) as carbon decreases
    // Base color is #1a2332, shift towards blue as carbon reduces
    const baseColor = Cesium.Color.fromCssColorString("#1a2332");
    const coolColor = Cesium.Color.fromCssColorString("#1a2a3a"); // Slightly bluer
    const finalColor = Cesium.Color.lerp(baseColor, coolColor, carbonReduction, new Cesium.Color());
    
    viewer.scene.globe.baseColor = finalColor;
  }, [actualViewerRef, orbitalComputeUnits, groundDCReduction, state]);


  // Track last rendered satellite IDs to prevent unnecessary recreations
  const lastRenderedSatIdsRef = useRef<Set<string>>(new Set());
  const lastStateHashRef = useRef<string>('');

  // Update visualization based on sandbox state
  useEffect(() => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed() || !state) return;
    const entities = viewer.entities;

    // Create a hash of the state to detect actual changes
    const stateHash = JSON.stringify({
      satelliteCount: state.satellites?.length || 0,
      groundSiteCount: state.groundSites?.length || 0,
      orbitalUnits: orbitalComputeUnits,
      groundDC: groundDCReduction,
      // Include first few satellite IDs to detect if satellites actually changed
      firstSatIds: state.satellites?.slice(0, 5).map(s => s.id).join(',') || '',
    });
    
    // Skip if state hasn't actually changed
    if (stateHash === lastStateHashRef.current) {
      return; // Skip render if state unchanged
    }
    
    lastStateHashRef.current = stateHash;

    // Don't clear all entities - preserve country outlines, deployed units, and data sources
    // Remove only ground sites, backend satellites, and job flows from entities collection
    // BUT: Only remove entities that are NOT in our tracked set (to avoid removing and recreating)
    const entitiesToRemove: Cesium.Entity[] = [];
    const currentSatIds = new Set<string>();
    
    // First, collect IDs of satellites we want to keep
    // Use same aggressive sampling as below
    if (state.satellites && state.satellites.length > 0) {
      const MAX_SATS = 10; // Match the limit used below
      const sampleRate = Math.max(1, Math.floor(state.satellites.length / MAX_SATS));
      const sampledSats = state.satellites.filter((_, idx) => idx % sampleRate === 0).slice(0, MAX_SATS);
      sampledSats.forEach(sat => currentSatIds.add(sat.id));
    }
    
    entities.values.forEach((entity: Cesium.Entity) => {
      const id = entity.id as string;
      // Preserve: country outlines, deployed unit satellites, launch animations, and satellites we want to keep
      if (id && 
          !id.startsWith("country_outline_") && 
          !id.startsWith("deployment_") && 
          !id.startsWith("deployment_ring_") &&
          !id.startsWith("deployed_pod_") &&
          !id.startsWith("deployed_server_farm_") &&
          !id.startsWith("deployed_geo_hub_") &&
          !id.startsWith("launch_arc_") &&
          !id.startsWith("launch_pod_") &&
          // REMOVED: launch_dot filter - cosmetic traffic removed
          !id.startsWith("launch_site_") &&
          !currentSatIds.has(id) && // Don't remove satellites we want to keep
          !lastRenderedSatIdsRef.current.has(id)) { // Don't remove satellites we just rendered
        entitiesToRemove.push(entity);
      }
    });
    
    // Only remove if we have entities to remove (avoid unnecessary operations)
    if (entitiesToRemove.length > 0) {
      // Removed excessive logging
      entitiesToRemove.forEach(e => removeTrackedEntity(entities, e));
    }
    jobFlowRef.current = [];
    
    // Ensure country outlines data source is still present
    if (viewer.dataSources) {
      const existingOutlines = viewer.dataSources.getByName("country_outlines");
      if (!existingOutlines || existingOutlines.length === 0) {
        // Country outlines were removed, try to re-add them
        // Country outlines missing, re-adding
        setTimeout(() => {
          const addCountryOutlines = () => {
            const COUNTRY_GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
            Cesium.GeoJsonDataSource.load(COUNTRY_GEOJSON_URL, {
              stroke: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(1.0),
              fill: Cesium.Color.TRANSPARENT,
              strokeWidth: 3.0,
            }).then((dataSource) => {
              if (viewer && !viewer.isDestroyed()) {
                dataSource.name = "country_outlines";
                viewer.dataSources.add(dataSource);
                // Country outlines re-added successfully
              }
            }).catch(() => {
              // Fallback outlines
              const outlines = [
                [-125, 49, -66, 49, -66, 25, -125, 25, -125, 49],
                [-140, 83, -52, 83, -52, 42, -140, 42, -140, 83],
                [-118, 32, -86, 32, -86, 14, -118, 14, -118, 32],
                [-10, 71, 40, 71, 40, 35, -10, 35, -10, 71],
              ];
              outlines.forEach((coords, idx) => {
                entities.add({
                  id: `country_outline_${idx}`,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(coords),
                    width: 2.5,
                    material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.8),
                  },
                });
              });
            });
          };
          addCountryOutlines();
        }, 100);
      }
    }

    // Calculate orbit share
    const totalCompute = orbitalComputeUnits + (100 - groundDCReduction);
    const orbitShare = totalCompute > 0 ? (orbitalComputeUnits / totalCompute) : 0;

    // Ground sites - fade based on reduction
    const visibleGroundSites = state.groundSites.filter((_, idx) => {
      const reductionFactor = groundDCReduction / 100;
      return idx >= state.groundSites.length * reductionFactor;
    });

    visibleGroundSites.forEach((site) => {
      const opacity = isMostlySpaceMode ? 0.2 : 0.9;
      // Surge event: make North America sites red
      const isNorthAmerica = site.lat > 25 && site.lat < 50 && site.lon > -130 && site.lon < -65;
      const siteColor = isSurgeActive && isNorthAmerica 
        ? Cesium.Color.fromCssColorString("#ff0000")
        : Cesium.Color.fromCssColorString("#00ff88");
      
      const groundEntity = entities.add({
        id: site.id,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
        point: {
          pixelSize: isMostlySpaceMode ? 15 : isSurgeActive && isNorthAmerica ? 30 : 20,
          color: siteColor.withAlpha(opacity),
          outlineColor: isSurgeActive && isNorthAmerica ? Cesium.Color.fromCssColorString("#ff6b35") : Cesium.Color.WHITE,
          outlineWidth: isMostlySpaceMode ? 1 : isSurgeActive && isNorthAmerica ? 5 : 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: site.label,
          font: "16px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.WHITE.withAlpha(opacity),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        },
      });
      
      // Mark entity type for click detection
      (groundEntity as any)._entityType = "ground";
    });

    // Orbital satellites - render all of them (no limit for now)
    const deployedUnits = getDeployedUnits();

    // Create persistent satellite entities for deployed units
    // LEO pods: Each pod = 50 satellites
    // Server farms: Each farm = 1 large satellite at GEO altitude
    // GEO hubs: Each hub = 1 satellite at GEO altitude
    // Processing deployed units
    deployedUnits.forEach((unit) => {
      if (unit.status === "deployed" && unit.deployedAt) {
        // Creating satellites for deployed unit
        if (unit.type === "leo_pod") {
          // Check if we've already created satellites for this unit
          if (!deployedPodSatellitesRef.current.has(unit.id)) {
          const entityIds: string[] = [];
          // Each LEO pod = 50 satellites
          const satellitesPerPod = 1; // Reduced to 1 to prevent memory issues (was 2, originally 50)
          
          // Generate consistent seed from unit ID for reproducible positions
          let seed = 0;
          for (let j = 0; j < unit.id.length; j++) {
            seed = ((seed << 5) - seed) + unit.id.charCodeAt(j);
            seed = seed & seed;
          }
          
          // Use a simple seeded random function for consistent positioning
          const seededRandom = (index: number) => {
            const x = Math.sin((seed + index) * 12.9898) * 43758.5453;
            return x - Math.floor(x);
          };
          
          for (let i = 0; i < satellitesPerPod; i++) {
            const podSatId = `deployed_pod_${unit.id}_sat_${i}`;
            
            // Spread satellites evenly across orbital planes and positions
            // Use unit ID hash to ensure each pod has unique distribution
            const planeIndex = Math.floor(i / 10); // 5 orbital planes (10 sats each)
            const satInPlane = i % 10;
            
            // Distribute across longitude (orbital planes)
            const longitudeOfAscendingNode = (planeIndex / 5) * 360 + (seed % 180);
            
            // Distribute across mean anomaly (position in orbit)
            const meanAnomaly = (satInPlane / 10) * 360 + (seed % 60);
            
            // Convert to lat/lon using simplified orbital mechanics
            // LEO altitude ~550km, inclination ~53 degrees (Starlink-like)
            const altitude = 550; // km
            const inclination = 53; // degrees
            const inclinationRad = inclination * Math.PI / 180;
            const meanAnomalyRad = meanAnomaly * Math.PI / 180;
            const lonAscNodeRad = longitudeOfAscendingNode * Math.PI / 180;
            
            // Calculate latitude from inclination and mean anomaly
            const lat = Math.asin(Math.sin(meanAnomalyRad) * Math.sin(inclinationRad)) * 180 / Math.PI;
            
            // Calculate longitude from longitude of ascending node and argument of latitude
            const argLat = Math.atan2(
              Math.tan(meanAnomalyRad) * Math.cos(inclinationRad),
              Math.cos(meanAnomalyRad)
            );
            let lon = (longitudeOfAscendingNode + argLat * 180 / Math.PI) % 360;
            if (lon > 180) lon -= 360;
            
            const alt = altitude;
            
            const podSatEntity = entities.add({
              id: podSatId,
              position: Cesium.Cartesian3.fromDegrees(lon, lat, alt * 1000),
              point: {
                pixelSize: 8,
                color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.9), // Cyan for deployed LEO pods
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.NONE,
                scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
              },
            });
            
            // Mark as deployed pod satellite for click detection
            (podSatEntity as any)._entityType = "satellite";
            (podSatEntity as any)._satelliteId = podSatId;
            (podSatEntity as any)._deployedUnitId = unit.id;
            (podSatEntity as any)._unitType = unit.type;
            
            entityIds.push(podSatId);
          }
          deployedPodSatellitesRef.current.set(unit.id, { unitId: unit.id, entityIds });
          // Created satellites for LEO pod
        } else {
          // Update existing LEO pod satellites - animate their orbital motion
          const podData = deployedPodSatellitesRef.current.get(unit.id);
          if (podData) {
            // Update positions with time-based animation
            const timeOffset = Date.now() / 1000;
            const satellitesPerPod = 1; // Reduced to 1 to prevent memory issues (was 2, originally 50) // Same as creation
            podData.entityIds.forEach((podSatId, i) => {
              const orbitPos = generateSunSyncOrbitPosition(unit.id, i, satellitesPerPod, timeOffset);
              const existingEntity = entities.getById(podSatId);
              if (existingEntity) {
                try {
                  existingEntity.position = new Cesium.ConstantPositionProperty(
                    Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000)
                  );
                } catch (e) {
                  // If update fails, ignore
                }
              }
            });
          }
        }
      } else if (unit.type === "server_farm") {
          // Server farms: Create multiple satellites in sun-synchronous orbits
          // Each server farm = 10 satellites (reduced from 50 to prevent memory issues)
          const satellitesPerFarm = 1; // Reduced to 1 to prevent memory issues (was 2, originally 10)
          
          if (!deployedPodSatellitesRef.current.has(unit.id)) {
            const entityIds: string[] = [];
            for (let i = 0; i < satellitesPerFarm; i++) {
              const farmSatId = `deployed_server_farm_${unit.id}_sat_${i}`;
              // Generate sun-synchronous orbital position
              const orbitPos = generateSunSyncOrbitPosition(unit.id, i, satellitesPerFarm);
              
              const farmSatEntity = entities.add({
                id: farmSatId,
                position: Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000),
                point: {
                      pixelSize: 6,
                      color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.9), // Green for deployed server farms
                      outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 1,
                  heightReference: Cesium.HeightReference.NONE,
                  scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
                },
              });
              
              // Mark as deployed server farm satellite for click detection
              (farmSatEntity as any)._entityType = "satellite";
              (farmSatEntity as any)._satelliteId = farmSatId;
              (farmSatEntity as any)._deployedUnitId = unit.id;
              (farmSatEntity as any)._unitType = unit.type;
              
              entityIds.push(farmSatId);
            }
            deployedPodSatellitesRef.current.set(unit.id, { unitId: unit.id, entityIds });
            // Created satellites in sun-sync orbits for server farm
          } else {
            // Update existing server farm satellites - animate their orbital motion
            const farmData = deployedPodSatellitesRef.current.get(unit.id);
            if (farmData) {
              // Use current time to animate orbital motion
              const timeOffset = Date.now() / 1000;
              farmData.entityIds.forEach((farmSatId, i) => {
                // Generate updated sun-synchronous orbital position with time offset
                const orbitPos = generateSunSyncOrbitPosition(unit.id, i, satellitesPerFarm, timeOffset);
                const existingEntity = entities.getById(farmSatId);
                if (existingEntity) {
                  // Update position to follow orbital motion
                  try {
                    existingEntity.position = new Cesium.ConstantPositionProperty(
                      Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000)
                    );
                  } catch (e) {
                    // If update fails, remove and recreate
                    entities.remove(existingEntity);
                    const newEntity = entities.add({
                      id: farmSatId,
                      position: Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000),
                      point: {
                        pixelSize: 6,
                        color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.9), // Green for deployed server farms
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 1,
                        heightReference: Cesium.HeightReference.NONE,
                        scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
                      },
                    });
                    (newEntity as any)._entityType = "satellite";
                    (newEntity as any)._satelliteId = farmSatId;
                    (newEntity as any)._deployedUnitId = unit.id;
                    (newEntity as any)._unitType = unit.type;
                  }
                } else {
                  // Entity doesn't exist, recreate it
                  const orbitPos = generateSunSyncOrbitPosition(unit.id, i, satellitesPerFarm);
                  const newEntity = entities.add({
                    id: farmSatId,
                    position: Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000),
                    point: {
                      pixelSize: 6,
                      color: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.9), // Green for deployed server farms
                      outlineColor: Cesium.Color.WHITE,
                      outlineWidth: 1,
                      heightReference: Cesium.HeightReference.NONE,
                      scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
                    },
                  });
                  (newEntity as any)._entityType = "satellite";
                  (newEntity as any)._satelliteId = farmSatId;
                  (newEntity as any)._deployedUnitId = unit.id;
                  (newEntity as any)._unitType = unit.type;
                }
              });
            }
          }
        } else if (unit.type === "geo_hub") {
          // GEO hubs: Create 1 entity on the ground (like ground sites)
          const unitSatId = `deployed_geo_hub_${unit.id}`;
          if (!deployedPodSatellitesRef.current.has(unit.id)) {
            const entityIds: string[] = [];
            // Use a random position on the ground (distributed globally)
            const geoLat = (Math.random() - 0.5) * 120; // -60 to +60 degrees latitude
            const geoLon = Math.random() * 360 - 180; // -180 to +180 degrees longitude
            
            const geoHubEntity = entities.add({
              id: unitSatId,
              position: Cesium.Cartesian3.fromDegrees(geoLon, geoLat, 0),
              point: {
                pixelSize: 12,
                color: Cesium.Color.fromCssColorString("#9b59b6").withAlpha(0.9), // Purple for GEO hubs
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // On the ground
                scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
              },
            });
            
            // Mark as ground entity for click detection
            (geoHubEntity as any)._entityType = "ground";
            (geoHubEntity as any)._satelliteId = unitSatId;
            (geoHubEntity as any)._deployedUnitId = unit.id;
            (geoHubEntity as any)._unitType = unit.type;
            
            entityIds.push(unitSatId);
            deployedPodSatellitesRef.current.set(unit.id, { unitId: unit.id, entityIds });
            // Created ground entity for GEO hub
          }
        }
      }
    });
    
    // Total deployed unit satellites tracked
    
    // Clean up satellites for units that are no longer deployed
    const currentDeployedIds = new Set(deployedUnits.filter(u => u.status === "deployed").map(u => u.id));
    deployedPodSatellitesRef.current.forEach((podData, unitId) => {
      if (!currentDeployedIds.has(unitId)) {
        // Remove all satellite entities for this unit
        podData.entityIds.forEach(entityId => {
          const entity = entities.getById(entityId);
          if (entity) entities.remove(entity);
        });
        deployedPodSatellitesRef.current.delete(unitId);
      }
    });

    // Hard cap satellite count to prevent memory issues
    // Aggressively limit to prevent OOM
    const MAX_SATS = 10; // Reduced from 20 to 10
    
    // Safety check: ensure state.satellites exists and is an array
    if (!state || !state.satellites || !Array.isArray(state.satellites) || state.satellites.length === 0) {
      return; // Don't render if no satellites
    }
    
    // Aggressively sample satellites - only show a tiny fraction
    // If we have 8991 satellites, sample every 900th to get ~10
    const sampleRate = Math.max(1, Math.floor(state.satellites.length / MAX_SATS));
    let sampledSats = state.satellites.filter((_, idx) => idx % sampleRate === 0).slice(0, MAX_SATS);
    
    // Track which satellites we're about to render
    const newSatIds = new Set(sampledSats.map(s => s.id));
    
    // Only log if we're actually changing the satellite set
    const existingSatIds = new Set(Array.from(entities.values)
      .filter(e => (e as any)._entityType === 'satellite' && !(e.id as string)?.startsWith('deployed_'))
      .map(e => e.id as string));
    
    const idsChanged = newSatIds.size !== existingSatIds.size || 
      Array.from(newSatIds).some(id => !existingSatIds.has(id));
    
    if (idsChanged && process.env.NODE_ENV === 'development') {
      // Only log in dev mode and throttle
      const logKey = `${sampledSats.length}-${state.satellites.length}`;
      if (!(window as any).__lastSatLog || (window as any).__lastSatLog !== logKey) {
        (window as any).__lastSatLog = logKey;
        console.log(`[MemoryDebug] Rendering ${sampledSats.length} of ${state.satellites.length} satellites`);
      }
      
      // If we're trying to create too many new satellites, reduce the target
      const newSatellitesToCreate = sampledSats.filter(s => !existingSatIds.has(s.id)).length;
      if (newSatellitesToCreate > MAX_SATS) {
        // Further limit: only create first MAX_SATS that don't exist
        const limitedSats = sampledSats.filter(s => !existingSatIds.has(s.id)).slice(0, MAX_SATS);
        // Update sampledSats to only include existing + limited new ones
        const existingSats = sampledSats.filter(s => existingSatIds.has(s.id));
        sampledSats = [...existingSats, ...limitedSats].slice(0, MAX_SATS);
      }
    }
    
    // Update last rendered set
    lastRenderedSatIdsRef.current = newSatIds;
    
    // Process satellites incrementally - only a few per render to respect rate limiter
    // Separate existing (update) vs new (create) satellites
    const existingSats: typeof sampledSats = [];
    const newSats: typeof sampledSats = [];
    
    sampledSats.forEach(sat => {
      const existing = entities.getById(sat.id);
      if (existing) {
        existingSats.push(sat);
      } else {
        newSats.push(sat);
      }
    });
    
    // Always update existing satellites (no rate limit on updates)
    existingSats.forEach((sat) => {
      // Use static color - no sun position logic
      const color = Cesium.Color.fromCssColorString("#ffd700").withAlpha(0.9);
      const size = isMostlySpaceMode ? 6 : 4 + sat.utilization * 2;
      const position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000);
      const existingEntity = entities.getById(sat.id);
      
      if (existingEntity) {
        // Update existing entity position (satellites move with accelerated time)
        try {
          existingEntity.position = new Cesium.ConstantPositionProperty(position);
          if (existingEntity.point) {
            existingEntity.point.color = new Cesium.ConstantProperty(color);
            existingEntity.point.pixelSize = new Cesium.ConstantProperty(size);
            existingEntity.point.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE);
          }
        } catch (e) {
          // If update fails, skip - don't recreate to avoid rate limit issues
          console.warn(`[MemoryDebug] Failed to update satellite ${sat.id}, skipping`);
        }
      }
    });
    
    // Process new satellites incrementally (respecting rate limiter)
    // Only create a few new satellites per render to prevent overwhelming the rate limiter
    const MAX_NEW_PER_RENDER = 2; // Reduced from 5 to 2 to prevent memory issues
    const newSatsToCreate = newSats.slice(0, MAX_NEW_PER_RENDER);
    
    newSatsToCreate.forEach((sat) => {
      const color = Cesium.Color.fromCssColorString("#ffd700").withAlpha(0.9);
      const size = isMostlySpaceMode ? 6 : 4 + sat.utilization * 2;
      const position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000);
      
      // Create new entity using tracked function (may return null if rate limited)
      const satEntity = addTrackedEntity(entities, {
        id: sat.id,
        position: position,
        point: {
          pixelSize: size,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: isMostlySpaceMode ? 3 : 2,
          heightReference: Cesium.HeightReference.NONE,
          scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
        },
      });
      
      // Only mark if entity was created (not rate limited)
      if (satEntity) {
        (satEntity as any)._entityType = "satellite";
        (satEntity as any)._satelliteId = sat.id;
      }
      // If rate limited, skip this satellite (it will be created on next render if rate allows)
    });
    
    // If we have more new satellites to create, schedule incremental creation
    // But only if we're not already at MAX_SATS
    if (newSats.length > MAX_NEW_PER_RENDER && sampledSats.length < MAX_SATS) {
      // Don't log every time - too noisy
      // Schedule next batch after rate limiter resets (2 seconds - longer delay)
      const timeoutId = setTimeout(() => {
        const viewer = actualViewerRef.current || getGlobalViewer();
        if (viewer && !viewer.isDestroyed()) {
          // Trigger a re-render to process next batch
          viewer.scene.requestRender();
        }
      }, 2000); // Wait 2 seconds for rate limiter to reset
      activeTimeoutsRef.current.add(timeoutId);
    }

    // Job flows - more orbital flows as orbit share increases
    const numOrbitalFlows = Math.floor(orbitShare * 10);
    const numGroundFlows = Math.floor((1 - orbitShare) * 5);

    // Orbital job flows (upward arcs)
    if (visibleGroundSites.length > 0 && state.satellites.length > 0) {
      for (let i = 0; i < numOrbitalFlows; i++) {
        const site = visibleGroundSites[i % visibleGroundSites.length];
        const sat = state.satellites[i % state.satellites.length];
        const flowId = `orbital_flow_${i}`;
        
        // Check if flow already exists, update it instead of creating new
        const existingFlow = entities.getById(flowId);
        if (existingFlow) {
          if (existingFlow.polyline) {
            existingFlow.polyline.positions = new Cesium.ConstantProperty([
              Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
              Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
            ]);
          }
          if (!jobFlowRef.current.includes(existingFlow)) {
            jobFlowRef.current.push(existingFlow);
          }
        } else {
          // Enhanced visual data-flow beams with glow effect
          const orbitalPath = entities.add({
            id: flowId,
            polyline: {
              positions: [
                Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 0),
                Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
              ],
              width: 4,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.7),
              }),
            },
          });
          jobFlowRef.current.push(orbitalPath);
        }
      }
    }

    // Ground job flows (fade as orbit share increases)
    if (visibleGroundSites.length > 1) {
      for (let i = 0; i < numGroundFlows; i++) {
        const site1 = visibleGroundSites[i % visibleGroundSites.length];
        const site2 = visibleGroundSites[(i + 1) % visibleGroundSites.length];
        const flowId = `ground_flow_${i}`;
        
        // Check if flow already exists, update it instead of creating new
        const existingFlow = entities.getById(flowId);
        if (existingFlow) {
          if (existingFlow.polyline) {
            existingFlow.polyline.positions = new Cesium.ConstantProperty([
              Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
              Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
            ]);
            existingFlow.polyline.material = new Cesium.ColorMaterialProperty(
              Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.3 * (1 - orbitShare))
            );
          }
          if (!jobFlowRef.current.includes(existingFlow)) {
            jobFlowRef.current.push(existingFlow);
          }
        } else {
          const groundPath = entities.add({
            id: flowId,
            polyline: {
              positions: [
                Cesium.Cartesian3.fromDegrees(site1.lon, site1.lat, 0),
                Cesium.Cartesian3.fromDegrees(site2.lon, site2.lat, 0),
              ],
              material: Cesium.Color.fromCssColorString("#00ff88").withAlpha(0.3 * (1 - orbitShare)),
              width: 2,
              clampToGround: true,
            },
          });
          jobFlowRef.current.push(groundPath);
        }
      }
    }

    // Animate job flows
    let pulsePhase = 0;
    if (pulseIntervalRef.current) {
      clearInterval(pulseIntervalRef.current);
    }
    // Limit job flow entities to prevent memory issues (reduced to 5, disable animation)
    if (jobFlowRef.current.length > 5) {
      // Remove oldest entities
      const toRemove = jobFlowRef.current.splice(0, jobFlowRef.current.length - 5);
      toRemove.forEach(entity => {
        try {
          viewer.entities.remove(entity);
        } catch (e) {
          // Ignore errors
        }
      });
    }
    
    // Disable job flow animation to save memory
    // pulseIntervalRef.current = setInterval(() => {
    //   pulsePhase += 0.1;
    //   jobFlowRef.current.slice(0, 5).forEach((entity, idx) => {
    //     if (entity.polyline) {
    //       const alpha = 0.4 + Math.sin(pulsePhase + idx * 0.5) * 0.3;
    //       const currentColor = entity.polyline.material as Cesium.ColorMaterialProperty;
    //       if (currentColor) {
    //         entity.polyline.material = currentColor.color?.getValue()?.withAlpha(alpha) || 
    //           Cesium.Color.fromCssColorString("#00d4ff").withAlpha(alpha);
    //       }
    //     }
    //   });
    // }, 200);

    // Mostly Space Mode: Zoom out and show halo lattice
    // Only fly once when entering mostly space mode, not on every render
    if (isMostlySpaceMode && !mostlySpaceModeCameraFlewRef.current) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-100, 40, 20000000),
        duration: 2.0,
      });
      mostlySpaceModeCameraFlewRef.current = true;
    } else if (!isMostlySpaceMode) {
      // Reset flag when exiting mostly space mode
      mostlySpaceModeCameraFlewRef.current = false;
    }

    // Disable orbital mesh visualization to prevent memory issues
    // Remove existing mesh if it exists
    const existingMesh = entities.getById("orbital_mesh");
    if (existingMesh) {
      entities.remove(existingMesh);
    }

    // Animation loop to update satellite positions continuously
    const satelliteAnimationInterval = trackedSetInterval(() => {
      if (!viewer || viewer.isDestroyed()) return;
      
      // Check if cesiumWidget exists (viewer is fully initialized)
      const cesiumWidget = (viewer as any)._cesiumWidget;
      if (!cesiumWidget) {
        // Viewer not fully initialized yet, skip this update
        return;
      }
      
      let entities: Cesium.EntityCollection;
      try {
        entities = viewer.entities;
        // Limit total entities to prevent memory issues (reduced to 100)
        const allEntities = entities.values;
        if (allEntities.length > 100) {
          // Too many entities, aggressively clean up old entities
          const entitiesToRemove: string[] = [];
          allEntities.forEach((entity, idx) => {
            // Keep launch sites, keep first 50 entities, remove rest
            if (idx > 50 && !entity.id?.startsWith('launch_site_') && !entity.id?.startsWith('country_')) {
              entitiesToRemove.push(entity.id || '');
            }
          });
          entitiesToRemove.forEach(id => {
            try {
              if (id) entities.removeById(id);
            } catch (e) {
              // Ignore
            }
          });
          // Skip this update cycle after cleanup
          return;
        }
      } catch (e) {
        // Viewer entities not accessible, skip this update
        return;
      }
      
      // Limit deployed units processing to prevent memory issues
      const currentDeployedUnits = getDeployedUnits().slice(0, 20); // Max 20 units
      currentDeployedUnits.forEach((unit) => {
        if (unit.status === "deployed" && unit.deployedAt) {
          const podData = deployedPodSatellitesRef.current.get(unit.id);
          if (podData && unit.type === "leo_pod") {
            const satellitesPerPod = 1; // Reduced to 1 to prevent memory issues
            const timeOffset = Date.now() / 1000;
            // Limit to 1 satellite per pod
            if (podData.entityIds.length > 0) {
              const satId = podData.entityIds[0];
              const i = 0;
              const orbitPos = generateSunSyncOrbitPosition(unit.id, i, satellitesPerPod, timeOffset);
              const existingEntity = entities.getById(satId);
              if (existingEntity) {
                try {
                  existingEntity.position = new Cesium.ConstantPositionProperty(
                    Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000)
                  );
                } catch (e) {
                  // Ignore update errors
                }
              }
            }
          } else if (podData && unit.type === "server_farm") {
            const satellitesPerFarm = 1; // Reduced to 1 to prevent memory issues
            const timeOffset = Date.now() / 1000;
            // Limit to 1 satellite per farm to prevent memory issues
            if (podData.entityIds.length > 0) {
              const satId = podData.entityIds[0];
              const i = 0;
              const orbitPos = generateSunSyncOrbitPosition(unit.id, i, satellitesPerFarm, timeOffset);
              const existingEntity = entities.getById(satId);
              if (existingEntity) {
                try {
                  existingEntity.position = new Cesium.ConstantPositionProperty(
                    Cesium.Cartesian3.fromDegrees(orbitPos.lon, orbitPos.lat, orbitPos.alt * 1000)
                  );
                } catch (e) {
                  // Ignore update errors
                }
              }
            }
          }
        }
      });
      // Only render if entity count is reasonable
      try {
        const entityCount = entities.values.length;
        if (entityCount < 100) { // Only render if under 100 entities
          viewer.scene.requestRender();
        }
      } catch (e) {
        // Ignore render errors
      }
    }, 120000); // Update every 2 minutes (120 seconds) - reduced frequency

    return () => {
      if (satelliteAnimationInterval) {
        clearInterval(satelliteAnimationInterval);
        activeIntervalsRef.current.delete(satelliteAnimationInterval);
      }
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        activeIntervalsRef.current.delete(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [state?.satellites?.length, state?.groundSites?.length, orbitalComputeUnits, groundDCReduction, isMostlySpaceMode, isSurgeActive, actualViewerRef]);

  // Launch animation: detect changes and spawn launches
  // Check both old sandboxStore and new orbitSimStore
  useEffect(() => {
    // Try Simple Mode first (new), then orbit sim store, then old sandbox store
    const simpleModeState = (window as any).__simpleModeState;
    const orbitSimState = (window as any).__orbitSimState;
    let podsInOrbit = 0;
    let launchesPerYear = 0;
    let orbitalShare = 0;
    
    if (simpleModeState) {
      // Use Simple Mode state
      podsInOrbit = Math.floor(simpleModeState.podsDeployed || 0);
      launchesPerYear = simpleModeState.launchesPerYear || 0;
      orbitalShare = simpleModeState.orbitShare || 0;
    } else if (orbitSimState) {
      // Use new orbit sim store (check both old flow format and new direct format)
      if (orbitSimState.flow) {
        // Old format with flow object
        podsInOrbit = Math.floor(orbitSimState.flow.liveOrbitPods);
        launchesPerYear = orbitSimState.flow.launchesPerYear;
        orbitalShare = orbitSimState.orbitComputeShare || 0;
      } else {
        // New format with direct properties
        podsInOrbit = Math.floor(orbitSimState.podsInOrbit || 0);
        launchesPerYear = orbitSimState.launchesPerYear || 0;
        orbitalShare = orbitSimState.orbitalShare || 0;
      }
    } else if (simState) {
      // Fallback to old sandbox store
      podsInOrbit = Math.floor(simState.podsInOrbit);
      const orbitalComputeKw = getOrbitalComputeKw(
        podsInOrbit,
        simState.orbitalPodSpec,
        simState.podDegradationFactor
      );
      orbitalShare = simState.targetComputeKw > 0 
        ? (orbitalComputeKw / simState.targetComputeKw) 
        : 0;
      
      // Calculate launchesNeeded with reliability
      const podsPerLaunchCapacity = useSandboxStore.getState().podsPerLaunchCapacity || 1;
      const launchReliability = useSandboxStore.getState().launchReliability || 0.95;
      const rawLaunchesNeeded = podsInOrbit > 0 ? Math.ceil(podsInOrbit / podsPerLaunchCapacity) : 0;
      const effectiveLaunchesNeeded = launchReliability > 0 ? rawLaunchesNeeded / launchReliability : rawLaunchesNeeded;
      launchesPerYear = Math.ceil(effectiveLaunchesNeeded);
    } else {
      return; // No state available
    }
    
    // Detect significant changes - primarily based on launchesPerYear increase
    const podsDelta = podsInOrbit - lastPodsInOrbitRef.current;
    const shareDelta = Math.abs(orbitalShare - lastOrbitalShareRef.current);
    const launchesDelta = launchesPerYear - lastLaunchesNeededRef.current;
    
    // On first load, if there are pods already, spawn a few launches to show the system
    const isFirstLoad = lastPodsInOrbitRef.current === -1;
    const shouldSpawnInitial = !initialSpawnDoneRef.current && podsInOrbit > 0;
    
    // Helper function to spawn launches
    const spawnLaunches = (numLaunches: number) => {
      for (let i = 0; i < numLaunches && activeLaunchesRef.current.length < 3; i++) { // Reduced from 20 to 3
        // Pick random launch site
        const launchSite = LAUNCH_SITES[Math.floor(Math.random() * LAUNCH_SITES.length)];
        
        // Pick random target point along orbit ring (sample from deployed satellites or use default)
        let targetLat = 0;
        let targetLng = 0;
        
        const deployedUnits = getDeployedUnits();
        if (deployedUnits.length > 0) {
          // Sample from deployed unit satellites
          const randomUnit = deployedUnits[Math.floor(Math.random() * deployedUnits.length)];
          if (randomUnit.type === "leo_pod") {
            // Use LEO orbit altitude ~550km, random position
            const altitude = 550;
            const inclination = 53;
            const meanAnomaly = Math.random() * 360;
            const lonAscNode = Math.random() * 360;
            const inclinationRad = inclination * Math.PI / 180;
            const meanAnomalyRad = meanAnomaly * Math.PI / 180;
            const lonAscNodeRad = lonAscNode * Math.PI / 180;
            
            targetLat = Math.asin(Math.sin(meanAnomalyRad) * Math.sin(inclinationRad)) * 180 / Math.PI;
            const argLat = Math.atan2(
              Math.tan(meanAnomalyRad) * Math.cos(inclinationRad),
              Math.cos(meanAnomalyRad)
            );
            targetLng = (lonAscNode + argLat * 180 / Math.PI) % 360;
            if (targetLng > 180) targetLng -= 360;
          } else {
            // Default to random point
            targetLat = (Math.random() - 0.5) * 60; // -30 to +30 degrees
            targetLng = Math.random() * 360 - 180;
          }
        } else {
          // No deployed units, use random point
          targetLat = (Math.random() - 0.5) * 60;
          targetLng = Math.random() * 360 - 180;
        }
        
        const launch: LaunchEvent = {
          id: `launch_${Date.now()}_${i}`,
          startLat: launchSite.lat,
          startLng: launchSite.lng,
          targetLat,
          targetLng,
          t: 0,
          durationMs: 3000 + Math.random() * 500, // 3000-3500ms (3-3.5 seconds - faster, snappier)
          startTime: Date.now(),
        };
        
        activeLaunchesRef.current.push(launch);
      }
    };
    
    // Listen for mission changes or control changes - ONLY way to spawn launches
    const handleMissionChange = (event?: CustomEvent) => {
      // Only spawn launches when explicitly triggered via controls-changed event
      // Check if event has detail with podsDelta (from deploy button)
      const podsDelta = event?.detail?.podsDelta || 0;
      if (podsDelta > 0 && activeLaunchesRef.current.length < 3) {
        // Spawn launches based on podsDelta, capped at 3
        const numLaunches = Math.min(3, Math.max(1, Math.ceil(podsDelta / 2)));
        spawnLaunches(numLaunches);
        lastLaunchSpawnTimeRef.current = Date.now();
      }
    };
    
    window.addEventListener('mission-completed', handleMissionChange);
    window.addEventListener('controls-changed', handleMissionChange);
    
    // ONLY spawn launches when explicitly triggered via controls-changed event
    // Do NOT spawn automatically based on state changes
    // The handleMissionChange function will be called when controls-changed event fires
    
    lastPodsInOrbitRef.current = podsInOrbit;
    lastOrbitalShareRef.current = orbitalShare;
    lastLaunchesNeededRef.current = launchesPerYear;
    
    return () => {
      window.removeEventListener('mission-completed', handleMissionChange);
      window.removeEventListener('controls-changed', handleMissionChange);
    };
  }, [simState, getDeployedUnits]);

  // Render launch site markers
  useEffect(() => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed()) return;
    
    const entities = viewer.entities;
    
    // Remove old launch site markers
    LAUNCH_SITES.forEach((site, idx) => {
      const markerId = `launch_site_${idx}`;
      const existing = entities.getById(markerId);
      if (existing) entities.remove(existing);
    });
    
    // Add visible launch site markers
    LAUNCH_SITES.forEach((site, idx) => {
      const markerId = `launch_site_${idx}`;
      entities.add({
        id: markerId,
        position: Cesium.Cartesian3.fromDegrees(site.lng, site.lat, 0),
        point: {
          pixelSize: 20,
          color: Cesium.Color.fromCssColorString("#ff6b35").withAlpha(1.0),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.5),
        },
        label: {
          text: site.name,
          font: "14px 'JetBrains Mono', monospace",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -30),
        },
      });
    });
    
    // Launch site markers rendered
  }, [actualViewerRef]);

  // Launch animation loop - start immediately and keep running
  useEffect(() => {
    // Only start one animation loop
    if (animationLoopStartedRef.current) {
      return;
    }
    
      const startLoop = () => {
      const viewer = actualViewerRef.current || getGlobalViewer();
      if (!viewer || viewer.isDestroyed()) {
        // Retry after a short delay
        trackedSetTimeout(startLoop, 100);
        return;
      }
      
      animationLoopStartedRef.current = true;
    
    const animate = () => {
      // Check if viewer is still valid before accessing entities
      if (!viewer || viewer.isDestroyed()) {
        animationLoopStartedRef.current = false;
        return;
      }
      
      // Check if cesiumWidget exists (viewer is fully initialized)
      const cesiumWidget = (viewer as any)._cesiumWidget;
      if (!cesiumWidget) {
        // Viewer not fully initialized yet, skip this frame
        launchAnimationFrameRef.current = trackedRequestAnimationFrame(animate);
        return;
      }
      
      const now = Date.now();
      let entities;
      try {
        entities = viewer.entities;
      } catch (e) {
        // Viewer entities not accessible, stop animation
        animationLoopStartedRef.current = false;
        return;
      }
      
      // Update launch positions and remove completed ones
      activeLaunchesRef.current = activeLaunchesRef.current.filter((launch) => {
        const elapsed = now - launch.startTime;
        launch.t = Math.min(1, elapsed / launch.durationMs);
        
        if (launch.t >= 1) {
          // Remove launch entities immediately to prevent memory buildup
          const arcEntity = entities.getById(`launch_arc_${launch.id}`);
          const podEntity = entities.getById(`launch_pod_${launch.id}`);
          // REMOVED: Static dot removal - cosmetic traffic removed
          if (arcEntity) entities.remove(arcEntity);
          if (podEntity) entities.remove(podEntity);
          dotEntities.forEach(dot => entities.remove(dot));
          return false; // Remove from array
        }
        
        // Calculate Bezier curve points
        const earthRadius = 6371000; // meters
        const startPos = Cesium.Cartesian3.fromDegrees(launch.startLng, launch.startLat, 0);
        const targetPos = Cesium.Cartesian3.fromDegrees(launch.targetLng, launch.targetLat, 550000); // 550km altitude
        
        // P0 = ground point at launch site
        const P0 = startPos;
        
        // P1 = slightly above ground (20% above surface)
        const startNormal = Cesium.Cartesian3.normalize(startPos, new Cesium.Cartesian3());
        const P1 = Cesium.Cartesian3.multiplyByScalar(
          startNormal,
          earthRadius * 1.2,
          new Cesium.Cartesian3()
        );
        
        // P2 = high point (60% above surface, midway)
        const targetNormal = Cesium.Cartesian3.normalize(targetPos, new Cesium.Cartesian3());
        const midNormal = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.add(startNormal, targetNormal, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
        const P2 = Cesium.Cartesian3.multiplyByScalar(
          midNormal,
          earthRadius * 1.6,
          new Cesium.Cartesian3()
        );
        
        // P3 = target point at orbit altitude
        const P3 = targetPos;
        
        // Cubic Bezier interpolation: B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
        const t = launch.t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        const B = new Cesium.Cartesian3();
        Cesium.Cartesian3.multiplyByScalar(P0, mt3, B);
        Cesium.Cartesian3.add(
          B,
          Cesium.Cartesian3.multiplyByScalar(P1, 3 * mt2 * t, new Cesium.Cartesian3()),
          B
        );
        Cesium.Cartesian3.add(
          B,
          Cesium.Cartesian3.multiplyByScalar(P2, 3 * mt * t2, new Cesium.Cartesian3()),
          B
        );
        Cesium.Cartesian3.add(
          B,
          Cesium.Cartesian3.multiplyByScalar(P3, t3, new Cesium.Cartesian3()),
          B
        );
        
        // Update or create arc polyline
        const arcId = `launch_arc_${launch.id}`;
        let arcEntity = entities.getById(arcId);
        
        // Always update arc positions based on current progress
        const numSegments = 50; // More segments for smoother curve
        const arcPositions: Cesium.Cartesian3[] = [];
        // Always start with P0
        arcPositions.push(P0.clone());
        
        // Draw arc from start to current position (B)
        // Ensure we have enough segments even at low t values
        const minSegments = Math.max(10, Math.ceil(numSegments * Math.max(t, 0.1)));
        for (let i = 1; i <= minSegments; i++) {
          const segT = (i / minSegments) * t; // Scale by current progress
          if (segT > t) break; // Don't go beyond current progress
          
          const segMt = 1 - segT;
          const segMt2 = segMt * segMt;
          const segMt3 = segMt2 * segMt;
          const segT2 = segT * segT;
          const segT3 = segT2 * segT;
          
          const segB = new Cesium.Cartesian3();
          Cesium.Cartesian3.multiplyByScalar(P0, segMt3, segB);
          Cesium.Cartesian3.add(
            segB,
            Cesium.Cartesian3.multiplyByScalar(P1, 3 * segMt2 * segT, new Cesium.Cartesian3()),
            segB
          );
          Cesium.Cartesian3.add(
            segB,
            Cesium.Cartesian3.multiplyByScalar(P2, 3 * segMt * segT2, new Cesium.Cartesian3()),
            segB
          );
          Cesium.Cartesian3.add(
            segB,
            Cesium.Cartesian3.multiplyByScalar(P3, segT3, new Cesium.Cartesian3()),
            segB
          );
          arcPositions.push(segB);
        }
        
        // Always end with current position B
        if (arcPositions.length === 0 || !Cesium.Cartesian3.equals(arcPositions[arcPositions.length - 1], B)) {
          arcPositions.push(B.clone());
        }
        
        // Ensure we have at least 2 points for the polyline to render
        if (arcPositions.length < 2) {
          arcPositions.push(B.clone());
        }
        
        // Create/update the main trail polyline - use PolylineGlowMaterialProperty for visibility
        if (!arcEntity && arcPositions.length >= 2) {
          // Create polyline with bright glow material
          arcEntity = entities.add({
            id: arcId,
            polyline: {
              positions: arcPositions,
              width: 25, // Very thick trail
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 5.0, // Very strong glow
                color: Cesium.Color.fromCssColorString("#00ffff").withAlpha(1.0), // Bright cyan
                taperPower: 0.1, // Minimal taper
              }),
              clampToGround: false,
              arcType: Cesium.ArcType.NONE,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, Number.MAX_VALUE),
              show: true,
            },
          });
          // Track the arc
          launchArcsRef.current.push(arcEntity);
          viewer.scene.requestRender();
        } else if (arcEntity && arcEntity.polyline && arcPositions.length >= 2) {
          // Update arc positions
          arcEntity.polyline.positions = new Cesium.ConstantProperty(arcPositions);
          arcEntity.polyline.width = new Cesium.ConstantProperty(25);
          // Dynamic glow that pulses as rocket moves
          const pulseGlow = 4.5 + 0.5 * Math.sin(t * Math.PI * 4);
          arcEntity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
            glowPower: pulseGlow,
            color: Cesium.Color.fromCssColorString("#00ffff").withAlpha(1.0),
            taperPower: 0.1,
          });
        }
        
        // Update or create pod icon
        const podId = `launch_pod_${launch.id}`;
        let podEntity = entities.getById(podId);
        
        // Calculate pulsing effect based on progress
        const pulsePhase = t * Math.PI * 4; // Faster pulse
        const pulseSize = 20 + 6 * Math.sin(pulsePhase); // More dramatic size change
        const pulseGlow = 0.8 + 0.3 * Math.sin(pulsePhase + Math.PI / 2); // Offset glow pulse
        
        if (!podEntity) {
          // Create rocket as a billboard with an image or use a more visible point
          podEntity = entities.add({
            id: podId,
            position: B,
            // Use both point and billboard for better visibility
            point: {
              pixelSize: 12, // Smaller, more realistic size
              color: Cesium.Color.fromCssColorString("#ff6b35").withAlpha(1.0), // Orange/red rocket color
              outlineColor: Cesium.Color.WHITE.withAlpha(1.0), // Bright white outline
              outlineWidth: 3, // Thick outline
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY, // Always on top
              scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.2, 8.0e7, 0.8), // Reasonable size
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, Number.MAX_VALUE), // Always visible
            },
            // Add a small trail particle effect using a second point
            // This creates a "rocket with exhaust" effect
            billboard: {
              image: undefined, // We'll use point instead
              scale: 1.0,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            },
            // Make pod clickable with description
            description: `Launch Pod ${launch.id}\nClick to view launch details`,
          });
          // Mark as launch pod for click detection
          (podEntity as any)._entityType = "launch_pod";
          (podEntity as any)._launchId = launch.id;
          // Pod entity created
        } else {
          podEntity.position = new Cesium.ConstantPositionProperty(B);
          // Update rocket position and make it more visible
          const pulsePhase = t * Math.PI * 4; // Faster pulse
          const pulseSize = 12 + 3 * Math.sin(pulsePhase); // Subtle pulsing (12-15px)
          
          // Fade out near end
          if (launch.t > 0.9) {
            const fadeAlpha = Math.max(0.7, (1 - launch.t) * 10);
            podEntity.point!.color = new Cesium.ConstantProperty(
              Cesium.Color.fromCssColorString("#ff6b35").withAlpha(fadeAlpha) // Orange/red rocket
            );
            podEntity.point!.pixelSize = new Cesium.ConstantProperty(pulseSize * 0.8);
            podEntity.point!.outlineColor = new Cesium.ConstantProperty(
              Cesium.Color.WHITE.withAlpha(fadeAlpha)
            );
          } else {
            podEntity.point!.color = new Cesium.ConstantProperty(
              Cesium.Color.fromCssColorString("#ff6b35").withAlpha(1.0) // Orange/red rocket
            );
            podEntity.point!.pixelSize = new Cesium.ConstantProperty(pulseSize); // Subtle pulsing
            podEntity.point!.outlineColor = new Cesium.ConstantProperty(
              Cesium.Color.WHITE.withAlpha(1.0)
            );
            podEntity.point!.outlineWidth = new Cesium.ConstantProperty(3); // Thick outline
          }
        }
        
        // REMOVED: Static orbit dots - these were cosmetic and not tied to real state
        
        return true; // Keep in array
      });
      
      launchAnimationFrameRef.current = trackedRequestAnimationFrame(animate);
    };
    
      // Start the animation loop
      launchAnimationFrameRef.current = trackedRequestAnimationFrame(animate);
      // Animation loop running
    };
    
    // Try to start immediately
    startLoop();
    
    return () => {
      if (launchAnimationFrameRef.current !== null) {
        cancelAnimationFrame(launchAnimationFrameRef.current);
        launchAnimationFrameRef.current = null;
      }
      animationLoopStartedRef.current = false;
    };
  }, [actualViewerRef]);

  // Handle entity selection and zoom
  useEffect(() => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed() || !state) return;

    const setSelectedEntity = useSimStore.getState().setSelectedEntity;
    let isFlying = false; // Track if camera is currently flying

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      // Don't process clicks while camera is flying
      if (isFlying) {
        return;
      }

      const pickedObject = viewer.scene.pick(click.position);
      if (!pickedObject || !pickedObject.id) {
        // Clicked on empty space - just deselect, don't move camera
        setSelectedEntity(null);
        return;
      }

      const entity: any = pickedObject.id;
      const rawId: string =
        typeof entity.id === "string" ? entity.id : (entity.id?.id as string);

        // Clicked entity

      // Check entity type first (like CesiumGlobe does)
      if (entity._entityType === "ground") {
        // Check if this is a deployed GEO hub
        if (entity._deployedUnitId && entity._unitType === "geo_hub") {
          const deployedUnits = getDeployedUnits();
          const unit = deployedUnits.find(u => u.id === entity._deployedUnitId);
          if (unit) {
            // Clicked GEO hub
            setSelectedEntity({ type: "ground", id: rawId, unitId: unit.id } as any);
            const position = entity.position?.getValue(Cesium.JulianDate.now());
            if (position) {
              isFlying = true;
              const boundingSphere = new Cesium.BoundingSphere(position, 50000);
              viewer.camera.flyToBoundingSphere(boundingSphere, {
                duration: 2.0,
                offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 50000), // Birds-eye view: -90 degrees pitch
                complete: () => {
                  isFlying = false;
                },
                cancel: () => {
                  isFlying = false;
                },
              });
            }
            return;
          }
        }
        
        // Regular ground site
        const groundSite = state.groundSites.find((s) => s.id === rawId);
        if (groundSite) {
          // Zooming to ground site
          setSelectedEntity({ type: "ground", id: groundSite.id });
          isFlying = true;
          const position = Cesium.Cartesian3.fromDegrees(groundSite.lon, groundSite.lat, 0);
          const boundingSphere = new Cesium.BoundingSphere(position, 50000);
          viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 50000), // Birds-eye view: -90 degrees pitch
            complete: () => {
              isFlying = false;
            },
            cancel: () => {
              isFlying = false;
            },
          });
        }
        return;
      }

      // Check if this is a launch pod
      if (entity._entityType === "launch_pod") {
        const launchId = entity._launchId || rawId.replace(/^launch_pod_/, "");
        setSelectedEntity({ type: "launch_pod", id: launchId } as any);
        const position = entity.position?.getValue(Cesium.JulianDate.now());
        if (position) {
          isFlying = true;
          const boundingSphere = new Cesium.BoundingSphere(position, 50000);
          viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 50000),
            complete: () => {
              isFlying = false;
            },
            cancel: () => {
              isFlying = false;
            },
          });
        }
        return;
      }

      if (entity._entityType === "satellite") {
        const satId = entity._satelliteId || rawId.replace(/^sat_/, "");
        
        // Check if this is a deployed pod satellite
        if (entity._deployedUnitId) {
          const deployedUnits = getDeployedUnits();
          const unit = deployedUnits.find(u => u.id === entity._deployedUnitId);
          if (unit) {
            // Clicked deployed unit satellite
            setSelectedEntity({ type: "satellite", id: satId, unitId: unit.id } as any);
            const position = entity.position?.getValue(Cesium.JulianDate.now());
            if (position) {
              isFlying = true;
              const boundingSphere = new Cesium.BoundingSphere(position, 100000);
              viewer.camera.flyToBoundingSphere(boundingSphere, {
                duration: 2.0,
                offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 100000), // Birds-eye view
                complete: () => {
                  isFlying = false;
                },
                cancel: () => {
                  isFlying = false;
                },
              });
            }
            return;
          }
        }
        
        // Regular satellite from backend
        // Try multiple ID formats to find the satellite
        let satellite = state.satellites.find((s) => s.id === satId);
        if (!satellite) {
          // Try with sat_ prefix
          satellite = state.satellites.find((s) => s.id === `sat_${satId}`);
        }
        if (!satellite) {
          // Try without sat_ prefix
          satellite = state.satellites.find((s) => s.id === satId.replace(/^sat_/, ""));
        }
        if (!satellite && rawId) {
          // Try with rawId
          satellite = state.satellites.find((s) => s.id === rawId || s.id === rawId.replace(/^sat_/, ""));
        }
        
        if (satellite) {
          // Found satellite, setting selectedEntity
          setSelectedEntity({ type: "satellite", id: satellite.id });
          isFlying = true;
          const position = Cesium.Cartesian3.fromDegrees(satellite.lon, satellite.lat, satellite.alt_km * 1000);
          const boundingSphere = new Cesium.BoundingSphere(position, 100000);
          viewer.camera.flyToBoundingSphere(boundingSphere, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), satellite.alt_km * 1000 + 100000), // Birds-eye view: -90 degrees pitch
            complete: () => {
              isFlying = false;
            },
            cancel: () => {
              isFlying = false;
            },
          });
        } else {
          console.warn("[SandboxGlobe] Could not find satellite with ID:", satId, "rawId:", rawId, "Available satellites:", state.satellites.length);
          // Still set selectedEntity even if we can't find the satellite (DetailPanel will handle it)
          setSelectedEntity({ type: "satellite", id: satId || rawId });
        }
        return;
      }

      // Fallback: try to find by ID
      const groundSite = state.groundSites.find((s) => s.id === rawId);
      const satellite = state.satellites.find((s) => s.id === rawId || s.id === rawId.replace("sat_", ""));

      if (groundSite) {
        // Fallback: Zooming to ground site
        setSelectedEntity({ type: "ground", id: groundSite.id });
        isFlying = true;
        const position = Cesium.Cartesian3.fromDegrees(groundSite.lon, groundSite.lat, 0);
        const boundingSphere = new Cesium.BoundingSphere(position, 50000);
        viewer.camera.flyToBoundingSphere(boundingSphere, {
          duration: 2.0,
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 50000), // Birds-eye view: -90 degrees pitch
          complete: () => {
            isFlying = false;
          },
          cancel: () => {
            isFlying = false;
          },
        });
      } else if (satellite) {
        // Fallback: Zooming to satellite
        setSelectedEntity({ type: "satellite", id: satellite.id });
        isFlying = true;
        const position = Cesium.Cartesian3.fromDegrees(satellite.lon, satellite.lat, satellite.alt_km * 1000);
        const boundingSphere = new Cesium.BoundingSphere(position, 100000);
        viewer.camera.flyToBoundingSphere(boundingSphere, {
          duration: 2.0,
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), satellite.alt_km * 1000 + 100000), // Birds-eye view: -90 degrees pitch
          complete: () => {
            isFlying = false;
          },
          cancel: () => {
            isFlying = false;
          },
        });
      } else {
        // No matching entity found
        setSelectedEntity(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [actualViewerRef, state]);

  // Launch arc visuals
  useEffect(() => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed() || !simState) return;
    const entities = viewer.entities;

    // Clean up old launch arcs
    launchArcsRef.current.forEach(arc => {
      try {
        entities.remove(arc);
      } catch (e) {
        // Arc already removed
      }
    });
    launchArcsRef.current = [];

    // Check for new launches
    const currentLaunchCount = Math.floor(simState.resources.launches?.buffer ?? 0);
    if (currentLaunchCount > lastLaunchCountRef.current && lastLaunchCountRef.current > 0) {
      // Create launch arc from a random ground location to orbit
      const launchLat = -28.5 + (Math.random() - 0.5) * 10; // Near typical launch sites
      const launchLon = -80.6 + (Math.random() - 0.5) * 10;
      const orbitAlt = 550; // km
      
      const startPos = Cesium.Cartesian3.fromDegrees(launchLon, launchLat, 0);
      const endPos = Cesium.Cartesian3.fromDegrees(launchLon, launchLat, orbitAlt * 1000);
      
      const arc = entities.add({
        id: `launch_arc_${Date.now()}_${Math.random()}`,
        polyline: {
          positions: [startPos, endPos],
          width: 3,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.8),
          }),
        },
      });
      
      launchArcsRef.current.push(arc);
      
      // Fade out and remove after 3-5 minutes
      setTimeout(() => {
        if (arc && !viewer.isDestroyed()) {
          try {
            entities.remove(arc);
            launchArcsRef.current = launchArcsRef.current.filter(a => a !== arc);
          } catch (e) {
            // Already removed
          }
        }
      }, 180000); // 3 minutes
    }
    
    lastLaunchCountRef.current = currentLaunchCount;
  }, [actualViewerRef, simState]);

  return (
    <>
      {!countryLinesLoaded && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-dark-bg/90 pointer-events-none">
          <div className="text-center pointer-events-auto">
            <div className="text-xl font-bold text-accent-blue mb-4">Loading Country Borders...</div>
            <div className="w-64 bg-gray-700 rounded-full h-2">
              <div className="bg-accent-blue h-2 rounded-full animate-pulse" style={{ width: "100%" }}></div>
            </div>
            <div className="text-sm text-gray-400 mt-4">Please wait while the globe initializes</div>
          </div>
        </div>
      )}
    </>
  );
}


