"use client";

import { useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, Matrix4 } from "three";
import { useSimStore } from "../store/simStore";
import { useOrbitSim } from "../state/orbitStore";
import { latLonAltToXYZ } from "../lib/three/coordinateUtils";

/**
 * Handles clicking on markers in the Three.js scene
 */
export function ClickableMarkers() {
  const { camera, scene, gl } = useThree();
  const raycaster = useRef(new Raycaster());
  const setSelectedEntity = useSimStore((s) => s.setSelectedEntity);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // Check if click is on the canvas
      const target = event.target as HTMLElement;
      if (target.tagName !== 'CANVAS' && !target.closest('canvas')) {
        return;
      }

      // Don't handle clicks if clicking on UI elements
      const clickedElement = document.elementFromPoint(event.clientX, event.clientY);
      if (clickedElement?.closest('.panel-glass, button, input, select, textarea, [data-tutorial]')) {
        return;
      }

      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse, camera);
      // Reduced thresholds for more precise clicking
      raycaster.current.params.Points = { threshold: 0.1 };
      raycaster.current.params.Line = { threshold: 0.1 };
      raycaster.current.params.Mesh = { threshold: 0.1 };

      // Find all instanced meshes and regular meshes in the scene
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      
      // Get satellites from orbitStore for direct distance checking
      const orbitState = useOrbitSim.getState();
      const orbitSatellites = orbitState.satellites;

      // Debug: Log click for troubleshooting
      console.log(`[ClickableMarkers] Click at (${mouse.x.toFixed(2)}, ${mouse.y.toFixed(2)}), ${intersects.length} intersections`);

      // ALWAYS try distance-based detection for satellites (more reliable than raycasting)
      if (orbitSatellites.length > 0) {
        // Calculate click ray in world space
        const clickRay = raycaster.current.ray;
        let closestSat = null;
        let minDist = Infinity;
        const CLICK_THRESHOLD = 0.08; // Reduced threshold for more precise clicking
        
        orbitSatellites.forEach((sat) => {
          const satPos = new Vector3(sat.x, sat.y, sat.z);
          // Calculate distance from click ray to satellite position
          const rayToSat = satPos.clone().sub(clickRay.origin);
          const projectionLength = rayToSat.dot(clickRay.direction);
          
          // Only check satellites in front of camera
          if (projectionLength < 0) return;
          
          const closestPoint = clickRay.origin.clone().add(clickRay.direction.clone().multiplyScalar(projectionLength));
          const dist = closestPoint.distanceTo(satPos);
          
          if (dist < minDist && dist < CLICK_THRESHOLD) {
            minDist = dist;
            closestSat = sat;
          }
        });
        
        if (closestSat) {
          console.log(`[ClickableMarkers] ✅ Clicked on satellite: ${closestSat.id}, distance=${minDist.toFixed(3)}`);
          setSelectedEntity({ type: "satellite", id: closestSat.id });
          event.stopPropagation();
          event.preventDefault();
          return;
        }
      }
      
      // Check for launch sites and data centers using distance-based detection
      const clickRay = raycaster.current.ray;
      
      // Launch sites (from LaunchSites component - regular meshes)
      const launchSites = [
        { id: "capecanaveral", lat: 28.5623, lon: -80.5774, name: "Cape Canaveral" },
        { id: "vandenberg", lat: 34.7420, lon: -120.5724, name: "Vandenberg" },
        { id: "bocachica", lat: 25.9971, lon: -97.1554, name: "Boca Chica" },
      ];
      
      let closestLaunchSite = null;
      let minLaunchDist = Infinity;
      const LAUNCH_SITE_THRESHOLD = 0.08; // Reduced threshold for more precise clicking
      
      launchSites.forEach((site) => {
        const [x, y, z] = latLonAltToXYZ(site.lat, site.lon, 0.002);
        const sitePos = new Vector3(x, y, z);
        const rayToSite = sitePos.clone().sub(clickRay.origin);
        const projectionLength = rayToSite.dot(clickRay.direction);
        
        if (projectionLength < 0) return; // Behind camera
        
        const closestPoint = clickRay.origin.clone().add(clickRay.direction.clone().multiplyScalar(projectionLength));
        const dist = closestPoint.distanceTo(sitePos);
        
        if (dist < minLaunchDist && dist < LAUNCH_SITE_THRESHOLD) {
          minLaunchDist = dist;
          closestLaunchSite = site;
        }
      });
      
      if (closestLaunchSite) {
        console.log(`[ClickableMarkers] ✅ Clicked on launch site: ${closestLaunchSite.name}, distance=${minLaunchDist.toFixed(3)}`);
        setSelectedEntity({ type: "launch_site", id: closestLaunchSite.id });
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      
      // Data centers (from GroundSites component - instanced meshes, but also check directly)
      const simState = useSimStore.getState().state;
      if (simState?.groundSites) {
        const dataCenters = simState.groundSites.filter(s => !s.type || s.type === "data_center");
        let closestDataCenter = null;
        let minDataCenterDist = Infinity;
        const DATA_CENTER_THRESHOLD = 0.08; // Reduced threshold for more precise clicking
        
        dataCenters.forEach((site) => {
          const [x, y, z] = latLonAltToXYZ(site.lat, site.lon, 0);
          const sitePos = new Vector3(x, y, z);
          const rayToSite = sitePos.clone().sub(clickRay.origin);
          const projectionLength = rayToSite.dot(clickRay.direction);
          
          if (projectionLength < 0) return; // Behind camera
          
          const closestPoint = clickRay.origin.clone().add(clickRay.direction.clone().multiplyScalar(projectionLength));
          const dist = closestPoint.distanceTo(sitePos);
          
          if (dist < minDataCenterDist && dist < DATA_CENTER_THRESHOLD) {
            minDataCenterDist = dist;
            closestDataCenter = site;
          }
        });
        
        if (closestDataCenter) {
          console.log(`[ClickableMarkers] ✅ Clicked on data center: ${closestDataCenter.id}, distance=${minDataCenterDist.toFixed(3)}`);
          setSelectedEntity({ type: "ground", id: closestDataCenter.id });
          event.stopPropagation();
          event.preventDefault();
          return;
        }
      }
      
      // Clicked on empty space, deselect
      setSelectedEntity(null);

      // Sort by distance to get closest intersection
      intersects.sort((a, b) => (a.distance || 0) - (b.distance || 0));

      for (const intersect of intersects) {
        const object = intersect.object;
        
        // Check if it's a regular mesh (could be launch site or other marker)
        if (object.type === "Mesh" && object.userData?.siteId) {
          // This is a launch site mesh with userData
          const siteId = object.userData.siteId;
          console.log(`[ClickableMarkers] ✅ Clicked on launch site mesh: ${siteId}`);
          setSelectedEntity({ type: "launch_site", id: siteId });
          event.stopPropagation();
          event.preventDefault();
          return;
        }
        
        // Check if it's an instanced mesh (satellites or ground sites)
        if (object.type === "InstancedMesh") {
          const instanceId = intersect.instanceId;
          if (instanceId !== undefined) {
            // Get the position of this instance
            const matrix = new Matrix4();
            object.getMatrixAt(instanceId, matrix);
            const position = new Vector3();
            position.setFromMatrixPosition(matrix);

            // Determine if it's a satellite or ground site based on distance from origin
            const distance = position.length();
            const isOrbital = distance > 1.1; // Orbital markers are further from Earth center

            // Find the entity ID
            const simState = useSimStore.getState().state;
            
            if (isOrbital) {
              // Try orbitStore first (has xyz directly)
              let closestSat = null;
              let minDist = Infinity;
              
              orbitSatellites.forEach((sat) => {
                const satPos = new Vector3(sat.x, sat.y, sat.z);
                const dist = position.distanceTo(satPos);
                // Reduced threshold for more precise clicking - satellites are 0.04 radius, so 0.08 should catch clicks near them
                if (dist < minDist && dist < 0.08) {
                  minDist = dist;
                  closestSat = sat;
                }
              });
              
              // Fallback to simStore if orbitStore doesn't have it
              if (!closestSat && simState?.satellites) {
                const satellites = simState.satellites;
                satellites.forEach((sat) => {
                  const [x, y, z] = latLonAltToXYZ(sat.lat, sat.lon, sat.alt_km);
                  const satPos = new Vector3(x, y, z);
                  const dist = position.distanceTo(satPos);
                  if (dist < minDist && dist < 0.08) {
                    minDist = dist;
                    closestSat = sat;
                  }
                });
              }
              
              if (closestSat) {
                console.log(`[ClickableMarkers] ✅ Clicked on satellite: ${closestSat.id}, distance=${minDist.toFixed(3)}`);
                setSelectedEntity({ type: "satellite", id: closestSat.id });
                event.stopPropagation();
                event.preventDefault();
                return;
              } else if (isOrbital && orbitSatellites.length > 0) {
                // Fallback: find closest satellite even if threshold not met
                let closest = orbitSatellites[0];
                let minDist2 = position.distanceTo(new Vector3(closest.x, closest.y, closest.z));
                orbitSatellites.forEach((sat) => {
                  const dist = position.distanceTo(new Vector3(sat.x, sat.y, sat.z));
                  if (dist < minDist2) {
                    minDist2 = dist;
                    closest = sat;
                  }
                });
                // Reduced threshold for fallback
                if (minDist2 < 0.08) {
                  console.log(`[ClickableMarkers] Found nearby satellite: ${closest.id}, distance=${minDist2.toFixed(3)}`);
                  setSelectedEntity({ type: "satellite", id: closest.id });
                  event.stopPropagation();
                  event.preventDefault();
                  return;
                }
              }
            } else if (!isOrbital && simState?.groundSites) {
              // Find closest ground site (data center or launch site from GroundSites component)
              const groundSites = simState.groundSites;
              let closestSite = null;
              let minDist = Infinity;
              
              groundSites.forEach((site) => {
                const [x, y, z] = latLonAltToXYZ(site.lat, site.lon, 0);
                const sitePos = new Vector3(x, y, z);
                const dist = position.distanceTo(sitePos);
                // Reduced threshold for more precise clicking on small instanced markers
                if (dist < minDist && dist < 0.08) {
                  minDist = dist;
                  closestSite = site;
                }
              });
              
              if (closestSite) {
                const siteType = closestSite.type === "launch_site" ? "launch_site" : "ground";
                console.log(`[ClickableMarkers] ✅ Clicked on ${siteType}: ${closestSite.id}, distance=${minDist.toFixed(3)}`);
                setSelectedEntity({ type: siteType, id: closestSite.id });
                event.stopPropagation();
                event.preventDefault();
                return;
              }
            }
          }
        }
      }
    };

    gl.domElement.addEventListener("click", handleClick, true);
    return () => {
      gl.domElement.removeEventListener("click", handleClick, true);
    };
  }, [camera, scene, gl, setSelectedEntity]);

  return null;
}

