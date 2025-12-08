"use client";

import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { getGlobalViewer } from "../../hooks/useCesiumViewer";

interface OrbitLayerProps {
  launchSites: LaunchSite[];
  newPodsThisStep: number;
  orbitalShare: number;
  prevOrbitalShare?: number;
}

/**
 * OrbitLayer - Handles rocket launches and satellite orbits
 * Overlays on top of the Cesium globe
 */
export default function OrbitLayer({
  launchSites,
  newPodsThisStep,
  orbitalShare,
  prevOrbitalShare = 0,
}: OrbitLayerProps) {
  const orbitRingEntityRef = useRef<Cesium.Entity | null>(null);
  
  // Orbital altitude in meters (550km)
  const ORBITAL_ALTITUDE_M = 550_000;

  // Create 3D orbital ring in Cesium
  useEffect(() => {
    let viewer: Cesium.Viewer | null = null;
    let retryCount = 0;
    const maxRetries = 10;
    let checkInterval: NodeJS.Timeout | null = null;

    const createOrbitRing = (v: Cesium.Viewer) => {
      // Check if ring already exists
      const existing = v.entities.getById("deployment_ring_orbital");
      if (existing && orbitRingEntityRef.current === existing) {
        // Ring already exists and is correct
        return;
      }

      // Remove existing ring if any
      if (orbitRingEntityRef.current) {
        v.entities.remove(orbitRingEntityRef.current);
        orbitRingEntityRef.current = null;
      }
      if (existing) {
        v.entities.remove(existing);
      }

      // Create a 3D circular orbit ring at 550km altitude
      // Use a polyline with positions calculated properly in 3D space
      const positions: Cesium.Cartesian3[] = [];
      const numPoints = 256; // More points for smoother 3D circle
      const altitude = ORBITAL_ALTITUDE_M;

      // Create points in a circle around the equator at orbital altitude
      // This creates a proper 3D circle in space
      for (let i = 0; i <= numPoints; i++) {
        // Longitude varies from 0 to 360 degrees
        const longitude = (i / numPoints) * 360;
        const latitude = 0; // Equator
        
        // Create position at orbital altitude (height in meters)
        const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
        positions.push(position);
      }

      orbitRingEntityRef.current = v.entities.add({
        id: "deployment_ring_orbital", // Use prefix that SandboxGlobe preserves
        name: "Orbital Ring",
        polyline: {
          positions: positions,
          width: 6,
          material: Cesium.Color.fromCssColorString("#10b981").withAlpha(0.9), // Very visible
          clampToGround: false,
          heightReference: Cesium.HeightReference.NONE,
          arcType: Cesium.ArcType.GEODESIC,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1.0e9), // Visible from all distances
          followSurface: false, // Important: don't follow surface, stay at altitude
        },
        show: true,
      });

      console.log("[OrbitLayer] Created 3D orbital ring with", positions.length, "points at", altitude / 1000, "km altitude");
      
      // Force a render to make sure it appears
      v.scene.requestRender();
    };

    const tryCreateRing = () => {
      viewer = getGlobalViewer();
      if (viewer && !viewer.isDestroyed()) {
        try {
          createOrbitRing(viewer);
          return true;
        } catch (error) {
          console.error("[OrbitLayer] Error creating orbital ring:", error);
          return false;
        }
      }
      return false;
    };

    // Try immediately
    if (!tryCreateRing()) {
      // Retry with exponential backoff
      const retryInterval = setInterval(() => {
        retryCount++;
        if (tryCreateRing() || retryCount >= maxRetries) {
          clearInterval(retryInterval);
        }
      }, 500);
      
      return () => {
        clearInterval(retryInterval);
        if (checkInterval) clearInterval(checkInterval);
        if (viewer && !viewer.isDestroyed() && orbitRingEntityRef.current) {
          viewer.entities.remove(orbitRingEntityRef.current);
          orbitRingEntityRef.current = null;
        }
      };
    }

    // Periodically check if ring still exists and recreate if needed
    checkInterval = setInterval(() => {
      const v = getGlobalViewer();
      if (v && !v.isDestroyed()) {
        const existing = v.entities.getById("deployment_ring_orbital");
        if (!existing || existing !== orbitRingEntityRef.current) {
          console.log("[OrbitLayer] Orbital ring missing, recreating...");
          createOrbitRing(v);
        }
      }
    }, 2000); // Check every 2 seconds

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (viewer && !viewer.isDestroyed() && orbitRingEntityRef.current) {
        viewer.entities.remove(orbitRingEntityRef.current);
        orbitRingEntityRef.current = null;
      }
    };
  }, []); // Only create once on mount

  // Rocket launches are now handled in 3D by SandboxGlobe, not as 2D overlays
  // This component only manages the 3D orbital ring

  // This component only manages the 3D orbital ring in Cesium
  // All rocket launches and satellites are rendered in 3D by SandboxGlobe
  return null;
}
