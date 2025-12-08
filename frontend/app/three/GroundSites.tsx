"use client";

import { useRef, useEffect, useMemo } from "react";
import { InstancedMesh, Object3D } from "three";
import { useSimStore } from "../store/simStore";
import { latLngToVec3 } from "../lib/three/coordinateUtils";

// Stable empty array to prevent re-renders
const EMPTY_ARRAY: never[] = [];

export function GroundSites() {
  const dcRef = useRef<InstancedMesh>(null!);
  const launchRef = useRef<InstancedMesh>(null!);
  
  // Use a selector that returns a stable reference
  const simState = useSimStore((s) => s.state);
  const groundSites = useMemo(() => {
    return simState?.groundSites || EMPTY_ARRAY;
  }, [simState?.groundSites]);

  // Separate data centers and launch sites
  const dataCenters = useMemo(() => 
    groundSites.filter(s => !s.type || s.type === "data_center"),
    [groundSites]
  );
  const launchSites = useMemo(() => 
    groundSites.filter(s => s.type === "launch_site"),
    [groundSites]
  );

  // Create a hash to detect actual changes
  const sitesHash = useMemo(() => {
    if (groundSites.length === 0) return "";
    return groundSites.map(s => `${s.id}-${s.lat}-${s.lon}`).join(",");
  }, [groundSites]);

  useEffect(() => {
    // Update data centers
    if (dcRef.current && dataCenters.length > 0) {
      if (dcRef.current.count !== dataCenters.length) {
        dcRef.current.count = dataCenters.length;
      }
      
      const dummy = new Object3D();
      dataCenters.forEach((site, i) => {
        // Use exact world frame formula with surface radius 1.002
        // FORBIDDEN: marker group rotation - markers are in world space
        const [x, y, z] = latLngToVec3(site.lat, site.lon, 1.002);
        dummy.position.set(x, y, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        dcRef.current.setMatrixAt(i, dummy.matrix);
      });
      dcRef.current.instanceMatrix.needsUpdate = true;
    } else if (dcRef.current) {
      dcRef.current.count = 0;
    }

    // Update launch sites
    if (launchRef.current && launchSites.length > 0) {
      if (launchRef.current.count !== launchSites.length) {
        launchRef.current.count = launchSites.length;
      }
      
      const dummy = new Object3D();
      launchSites.forEach((site, i) => {
        // Use exact world frame formula with surface radius 1.002
        // FORBIDDEN: marker group rotation - markers are in world space
        const [x, y, z] = latLngToVec3(site.lat, site.lon, 1.002);
        dummy.position.set(x, y, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        launchRef.current.setMatrixAt(i, dummy.matrix);
      });
      launchRef.current.instanceMatrix.needsUpdate = true;
    } else if (launchRef.current) {
      launchRef.current.count = 0;
    }
    
    console.log(`[GroundSites] Rendered ${dataCenters.length} DCs, ${launchSites.length} launch sites`);
  }, [sitesHash, dataCenters, launchSites]);

  if (groundSites.length === 0) return null;
  
  return (
    <>
      {/* Data Centers - All same color (blue) */}
      {dataCenters.length > 0 && (
        <instancedMesh ref={dcRef} args={[undefined, undefined, dataCenters.length]}>
          <sphereGeometry args={[0.008, 8, 8]} />
          <meshBasicMaterial color={"#4a90e2"} />
        </instancedMesh>
      )}
      
      {/* Launch Sites - All same color (orange) - Note: These are also rendered in LaunchSites.tsx */}
      {launchSites.length > 0 && (
        <instancedMesh ref={launchRef} args={[undefined, undefined, launchSites.length]}>
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshBasicMaterial color={"#ff8800"} />
        </instancedMesh>
      )}
    </>
  );
}

