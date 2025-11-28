"use client";

import React, { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { useSimStore } from "../store/simStore";
import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { getGlobalViewer } from "../hooks/useCesiumViewer";

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
  const { orbitalComputeUnits, groundDCReduction, isMostlySpaceMode } = useSandboxStore();
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

  // Listen for surge events
  useEffect(() => {
    const handleSurgeEvent = () => {
      setIsSurgeActive(true);
      setTimeout(() => setIsSurgeActive(false), 5000);
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
                viewer.entities.add({
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
    console.log("[SandboxGlobe] Mounted, checking for viewer");

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

      console.log("[SandboxGlobe] Configuring viewer for sandbox mode");

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

        if (viewer.scene.globe.imageryLayers.length > 0) {
          viewer.scene.globe.imageryLayers.get(0).alpha = 0.15;
        }

        // Force initial render - requestRenderMode might prevent initial render
        viewer.scene.requestRender();
        console.log("[SandboxGlobe] Forced render request");
        
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
            console.log("[SandboxGlobe] Canvas styles applied, dimensions:", canvas.width, "x", canvas.height);
          } else {
            console.warn("[SandboxGlobe] Canvas not found in container");
          }
        } else {
          console.warn("[SandboxGlobe] Container cesium-globe-container not found");
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
        
        console.log("[SandboxGlobe] Viewer configuration complete");
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


  // Update visualization based on sandbox state
  useEffect(() => {
    const viewer = actualViewerRef.current || getGlobalViewer();
    if (!viewer || viewer.isDestroyed() || !state) return;
    const entities = viewer.entities;

    // Don't clear all entities - preserve country outlines, deployed units, and data sources
    // Remove only ground sites, backend satellites, and job flows from entities collection
    const entitiesToRemove: Cesium.Entity[] = [];
    entities.values.forEach((entity: Cesium.Entity) => {
      const id = entity.id as string;
      // Preserve: country outlines, deployed unit satellites (deployed_pod_, deployed_server_farm_, deployed_geo_hub_), deployment animations
      // Note: deployed_geo_hub_ entities are marked as ground type, so they should be preserved
      if (id && 
          !id.startsWith("country_outline_") && 
          !id.startsWith("deployment_") && 
          !id.startsWith("deployment_ring_") &&
          !id.startsWith("deployed_pod_") &&
          !id.startsWith("deployed_server_farm_") &&
          !id.startsWith("deployed_geo_hub_") &&
          !id.endsWith("_glow")) { // Preserve glow effects
        entitiesToRemove.push(entity);
      }
    });
    entitiesToRemove.forEach(e => entities.remove(e));
    jobFlowRef.current = [];
    
    // Ensure country outlines data source is still present
    if (viewer.dataSources) {
      const existingOutlines = viewer.dataSources.getByName("country_outlines");
      if (!existingOutlines || existingOutlines.length === 0) {
        // Country outlines were removed, try to re-add them
        console.log("[SandboxGlobe] Country outlines missing, re-adding...");
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
                console.log("[SandboxGlobe] Country outlines re-added successfully");
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
    console.log(`[SandboxGlobe] Processing ${deployedUnits.length} deployed units`);
    deployedUnits.forEach((unit) => {
      if (unit.status === "deployed" && unit.deployedAt) {
        console.log(`[SandboxGlobe] Creating satellites for deployed unit: ${unit.type} ${unit.id}`);
        if (unit.type === "leo_pod") {
          // Check if we've already created satellites for this unit
          if (!deployedPodSatellitesRef.current.has(unit.id)) {
          const entityIds: string[] = [];
          // Each LEO pod = 50 satellites
          const satellitesPerPod = 50;
          
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
          console.log(`[SandboxGlobe] Created ${entityIds.length} satellites for LEO pod ${unit.id}`);
        } else {
          // Update existing LEO pod satellites
          const podData = deployedPodSatellitesRef.current.get(unit.id);
          if (podData) {
              // Generate consistent seed from unit ID
              let seed = 0;
              for (let j = 0; j < unit.id.length; j++) {
                seed = ((seed << 5) - seed) + unit.id.charCodeAt(j);
                seed = seed & seed;
              }
              
            podData.entityIds.forEach((podSatId, i) => {
                // Recalculate position using same logic as creation
                const planeIndex = Math.floor(i / 10);
                const satInPlane = i % 10;
                const longitudeOfAscendingNode = (planeIndex / 5) * 360 + (seed % 180);
                const meanAnomaly = (satInPlane / 10) * 360 + (seed % 60);
                
                const altitude = 550;
                const inclination = 53;
                const inclinationRad = inclination * Math.PI / 180;
                const meanAnomalyRad = meanAnomaly * Math.PI / 180;
                const lonAscNodeRad = longitudeOfAscendingNode * Math.PI / 180;
                
                const lat = Math.asin(Math.sin(meanAnomalyRad) * Math.sin(inclinationRad)) * 180 / Math.PI;
                const argLat = Math.atan2(
                  Math.tan(meanAnomalyRad) * Math.cos(inclinationRad),
                  Math.cos(meanAnomalyRad)
                );
                let lon = (longitudeOfAscendingNode + argLat * 180 / Math.PI) % 360;
                if (lon > 180) lon -= 360;
                
                const existingEntity = entities.getById(podSatId);
                if (existingEntity) {
                  // Update position
                  try {
                    existingEntity.position = new Cesium.ConstantPositionProperty(
                      Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000)
                    );
                  } catch (e) {
                    // If update fails, remove and recreate
                    entities.remove(existingEntity);
                    const newEntity = entities.add({
                      id: podSatId,
                      position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000),
                      point: {
                        pixelSize: 8,
                        color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.9), // Cyan for deployed LEO pods
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 2,
                        heightReference: Cesium.HeightReference.NONE,
                        scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
                      },
                    });
                    (newEntity as any)._entityType = "satellite";
                    (newEntity as any)._satelliteId = podSatId;
                    (newEntity as any)._deployedUnitId = unit.id;
                    (newEntity as any)._unitType = unit.type;
                  }
                } else {
                  // Entity doesn't exist, recreate it
                  const newEntity = entities.add({
                    id: podSatId,
                    position: Cesium.Cartesian3.fromDegrees(lon, lat, altitude * 1000),
                    point: {
                      pixelSize: 8,
                      color: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.9), // Cyan for deployed LEO pods
                      outlineColor: Cesium.Color.WHITE,
                      outlineWidth: 2,
                      heightReference: Cesium.HeightReference.NONE,
                      scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
                    },
                  });
                  (newEntity as any)._entityType = "satellite";
                  (newEntity as any)._satelliteId = podSatId;
                  (newEntity as any)._deployedUnitId = unit.id;
                  (newEntity as any)._unitType = unit.type;
                }
            });
          }
        }
        } else if (unit.type === "server_farm") {
          // Server farms: Create multiple satellites in sun-synchronous orbits
          // Each server farm = 50 satellites spread across realistic sun-sync orbits
          const satellitesPerFarm = 50;
          
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
            console.log(`[SandboxGlobe] Created ${entityIds.length} satellites in sun-sync orbits for server farm ${unit.id}`);
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
            console.log(`[SandboxGlobe] Created ground entity for GEO hub ${unit.id}`);
          }
        }
      }
    });
    
    console.log(`[SandboxGlobe] Total deployed unit satellites tracked: ${deployedPodSatellitesRef.current.size} units`);
    
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

    // Render only 10% of background satellites for performance
    const RENDER_RATIO = 0.1;
    const totalSats = state.satellites.length;
    const sampledSats = state.satellites.filter((_, idx) => idx % Math.ceil(1 / RENDER_RATIO) === 0);
    sampledSats.forEach((sat) => {
      // Eclipse simulation: darker when in shadow
      const color = sat.sunlit
        ? Cesium.Color.fromCssColorString("#ffd700").withAlpha(0.9)
        : Cesium.Color.fromCssColorString("#4a5568").withAlpha(0.5); // Dark gray when in eclipse
      
      const size = isMostlySpaceMode ? 6 : 4 + sat.utilization * 2; // Smaller satellites: 4-6 pixels
      
      // Check if entity already exists and update it, otherwise create new
      const existingEntity = entities.getById(sat.id);
      const position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000);
      
      if (existingEntity) {
        // Update existing entity position (satellites move with accelerated time)
        try {
          existingEntity.position = new Cesium.ConstantPositionProperty(position);
          if (existingEntity.point) {
            existingEntity.point.color = new Cesium.ConstantProperty(color);
            existingEntity.point.pixelSize = new Cesium.ConstantProperty(size);
            existingEntity.point.outlineColor = new Cesium.ConstantProperty(sat.sunlit ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString("#2d3748"));
          }
        } catch (e) {
          // If update fails, remove and recreate
          entities.remove(existingEntity);
          const satEntity = entities.add({
            id: sat.id,
            position: position,
            point: {
              pixelSize: size,
              color: color,
              outlineColor: sat.sunlit ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString("#2d3748"),
              outlineWidth: isMostlySpaceMode ? 3 : 2,
              heightReference: Cesium.HeightReference.NONE,
              scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
            },
          });
          (satEntity as any)._entityType = "satellite";
          (satEntity as any)._satelliteId = sat.id;
        }
      } else {
        // Create new entity
        const satEntity = entities.add({
          id: sat.id,
          position: position,
          point: {
            pixelSize: size,
            color: color,
            outlineColor: sat.sunlit ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString("#2d3748"),
            outlineWidth: isMostlySpaceMode ? 3 : 2,
            heightReference: Cesium.HeightReference.NONE,
            scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.0, 8.0e7, 0.3),
          },
        });
        
        // Mark entity type for click detection
        (satEntity as any)._entityType = "satellite";
        (satEntity as any)._satelliteId = sat.id;
      }
      
      // Add glow effect for sunlit satellites (only if it doesn't exist)
      if (sat.sunlit) {
        const glowId = `${sat.id}_glow`;
        const existingGlow = entities.getById(glowId);
        if (!existingGlow) {
          entities.add({
            id: glowId,
            position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000),
            ellipse: {
              semiMajorAxis: 15000,
              semiMinorAxis: 15000,
              material: Cesium.Color.fromCssColorString("#ffd700").withAlpha(0.15),
              heightReference: Cesium.HeightReference.NONE,
            },
          });
        } else {
          // Update existing glow position
          existingGlow.position = new Cesium.ConstantPositionProperty(
            Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000)
          );
        }
      } else {
        // Remove glow if satellite is no longer sunlit
        const glowId = `${sat.id}_glow`;
        const existingGlow = entities.getById(glowId);
        if (existingGlow) {
          entities.remove(existingGlow);
        }
      }
    });

    // Job flows - more orbital flows as orbit share increases
    const numOrbitalFlows = Math.floor(orbitShare * 10);
    const numGroundFlows = Math.floor((1 - orbitShare) * 5);

    // Orbital job flows (upward arcs)
    if (visibleGroundSites.length > 0 && state.satellites.length > 0) {
      for (let i = 0; i < numOrbitalFlows; i++) {
        const site = visibleGroundSites[i % visibleGroundSites.length];
        const sat = state.satellites[i % Math.min(numVisibleSats, state.satellites.length)];
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
    pulseIntervalRef.current = setInterval(() => {
      pulsePhase += 0.1;
      jobFlowRef.current.forEach((entity, idx) => {
        if (entity.polyline) {
          const alpha = 0.4 + Math.sin(pulsePhase + idx * 0.5) * 0.3;
          const currentColor = entity.polyline.material as Cesium.ColorMaterialProperty;
          if (currentColor) {
            entity.polyline.material = currentColor.color?.getValue()?.withAlpha(alpha) || 
              Cesium.Color.fromCssColorString("#00d4ff").withAlpha(alpha);
          }
        }
      });
    }, 50);

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

    // Add orbital mesh visualization (only in mostly space mode)
    if (isMostlySpaceMode && state.satellites.length > 0) {
      // Remove existing mesh if it exists
      const existingMesh = entities.getById("orbital_mesh");
      if (existingMesh) {
        entities.remove(existingMesh);
      }
      
        const meshPositions = state.satellites.slice(0, Math.min(200, state.satellites.length)).map((sat) =>
          Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt_km * 1000)
        );

        // Create a simple mesh visualization
        entities.add({
          id: "orbital_mesh",
          polyline: {
            positions: meshPositions,
            material: Cesium.Color.fromCssColorString("#00d4ff").withAlpha(0.2),
            width: 1,
          },
        });
    } else {
      // Remove mesh when not in mostly space mode
      const existingMesh = entities.getById("orbital_mesh");
      if (existingMesh) {
        entities.remove(existingMesh);
      }
    }

    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [state, orbitalComputeUnits, groundDCReduction, isMostlySpaceMode, isSurgeActive, actualViewerRef, getDeployedUnits]);

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

      console.log("[SandboxGlobe] Clicked entity:", rawId, entity, "entityType:", entity._entityType);

      // Check entity type first (like CesiumGlobe does)
      if (entity._entityType === "ground") {
        // Check if this is a deployed GEO hub
        if (entity._deployedUnitId && entity._unitType === "geo_hub") {
          const deployedUnits = getDeployedUnits();
          const unit = deployedUnits.find(u => u.id === entity._deployedUnitId);
          if (unit) {
            console.log("[SandboxGlobe] Clicked GEO hub:", unit.name);
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
          console.log("[SandboxGlobe] Zooming to ground site:", groundSite.id);
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

      if (entity._entityType === "satellite") {
        const satId = entity._satelliteId || rawId.replace(/^sat_/, "");
        
        // Check if this is a deployed pod satellite
        if (entity._deployedUnitId) {
          const deployedUnits = getDeployedUnits();
          const unit = deployedUnits.find(u => u.id === entity._deployedUnitId);
          if (unit) {
            console.log("[SandboxGlobe] Clicked deployed unit satellite:", unit.name);
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
          console.log("[SandboxGlobe] Found satellite:", satellite.id, "Setting selectedEntity");
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
        console.log("[SandboxGlobe] Fallback: Zooming to ground site:", groundSite.id);
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
        console.log("[SandboxGlobe] Fallback: Zooming to satellite:", satellite.id);
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
        console.log("[SandboxGlobe] No matching entity found for:", rawId);
        setSelectedEntity(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [actualViewerRef, state]);

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


