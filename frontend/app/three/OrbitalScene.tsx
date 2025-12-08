"use client";

import { useEffect, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { GlobeMesh } from "./GlobeMesh";
import { Satellites } from "./Satellites";
import { SatellitesOptimized } from "./SatellitesOptimized";
import { GroundSites } from "./GroundSites";
import { OrbitalDataSync } from "./OrbitalDataSync";
import { ClickableMarkers } from "./ClickableMarkers";
import { LaunchSites } from "./LaunchSites";
import { LaunchAnimation } from "./LaunchAnimation";
import { LaunchAnimationV2 } from "./LaunchAnimationV2";
import { OrbitalShells } from "./OrbitalShells";
import { TrafficFlows } from "./TrafficFlows";
import { RoutingArrows } from "./RoutingArrows";
import { FailureShockwave } from "./FailureShockwave";
import { FuturesCone } from "./FuturesCone";
import { DebugMarkers } from "./DebugMarkers";
import { SpecialMoments } from "./SpecialMoments";
import { ValidationMarkers } from "./ValidationMarkers";
import { PoleMarkers } from "./PoleMarkers";
import { useOrbitSim } from "../state/orbitStore";

// Component to update simulation time - must be inside Canvas
function TimeUpdater() {
  const frameCount = useRef(0);
  useFrame((state, delta) => {
    useOrbitSim.getState().updateSimTime(delta);
    frameCount.current++;
    // Log only occasionally (every 300 frames = ~5 seconds at 60fps)
    if (frameCount.current % 300 === 0) {
      const orbitState = useOrbitSim.getState();
      // Silent - no logging
    }
  });
  return null;
}

export default function OrbitalScene() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#000011]">
        <div className="text-white text-sm">Loading globe...</div>
      </div>
    );
  }

  return (
    <>
      <OrbitalDataSync />
      <Canvas 
        camera={{ position: [0, 0, 4], fov: 45 }}
        style={{ pointerEvents: 'auto' }}
      >
        {/* Time updater - must be inside Canvas to use useFrame */}
        <TimeUpdater />
        
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} />
        
        {/* HARD RENDER ORDER - NEVER VIOLATE */}
        {/* 1. Stars */}
        <Stars radius={100} depth={50} count={3000} factor={4} />
        
        {/* 2. Earth Mesh */}
        <GlobeMesh />
        
        {/* 3. Atmosphere glow (additive, thin) */}
        <mesh>
          <sphereGeometry args={[1.01, 64, 64]} />
          <meshStandardMaterial
            color="#87ceeb"
            transparent
            opacity={0.15}
            emissive="#87ceeb"
            emissiveIntensity={0.2}
            side={2} // DoubleSide
            depthWrite={false}
            depthTest={true}
          />
        </mesh>
        
        {/* 4. Orbital Shells (disabled - user requested removal) */}
        {/* <OrbitalShells /> */}
        
        {/* 5. Satellites (optimized, per-shell instanced) */}
        <SatellitesOptimized />
        
        {/* 6. Traffic Flows (GPU) */}
        <TrafficFlows />
        
        {/* 7. Routing Arrows */}
        <RoutingArrows />
        
        {/* 8. Failure Shockwaves */}
        <FailureShockwave />
        
        {/* 9. Futures Cone (volumetric) */}
        <FuturesCone />
        
        {/* Ground sites and launch sites - render early to ensure visibility */}
        <LaunchSites />
        <GroundSites />
        
        {/* Pole markers for coordinate verification */}
        <PoleMarkers />
        
        {/* Validation markers - for coordinate system verification (NYC, London, Tokyo, Sydney) */}
        <ValidationMarkers />
        
        {/* Launch animations */}
        <LaunchAnimation />
        
        {/* Click detection */}
        <ClickableMarkers />
        
        {/* Debug markers - shows satellite positions and route endpoints (dev only) */}
        {process.env.NODE_ENV === 'development' && <DebugMarkers />}
        
        {/* Camera controls with restrictions */}
        <OrbitControls 
          enablePan={false}
          dampingFactor={0.05}
          maxDistance={20}
          minDistance={2}
          enableDamping
        />
      </Canvas>
      
      {/* Special moments visual feedback (outside Canvas, overlay) */}
      <SpecialMoments />
    </>
  );
}

