"use client";

import * as THREE from "three";
import { Suspense, useRef, useEffect, useState } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { TextureLoader } from "three";
import { useSimulationStore } from "../store/simulationStore";

function GlobeWithTexture() {
  const earthRef = useRef<THREE.Mesh>(null);
  const earthRootRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const map = useLoader(
    TextureLoader,
    "https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg"
  );
  const timeline = useSimulationStore((s) => s.timeline);
  const [tintIntensity, setTintIntensity] = useState(0); // -1 (red) to +1 (green)
  const hasCrossedRef = useRef(false);

  // Cost-weighted world tint - ONLY apply green AFTER cost crossover
  useEffect(() => {
    if (!timeline || timeline.length === 0) {
      // No timeline = no tint
      setTintIntensity(0);
      return;
    }
    
    const currentStep = timeline[timeline.length - 1];
    // CRITICAL FIX: Use cost crossover instead of carbon crossover
    // Check if orbital cost is cheaper than ground cost
    const orbitalCost = (currentStep as any).costPerComputeOrbit || currentStep.costPerComputeMix || 0;
    const groundCost = currentStep.costPerComputeGround || 0;

    // CRITICAL: Only apply tint if we have valid cost data
    // Check if cost crossover has happened (orbital cheaper than ground)
    if (groundCost > 0 && orbitalCost > 0) {
      // Calculate if orbital is better (lower cost)
      const isOrbitalBetter = orbitalCost < groundCost;
      
      // Only apply green tint if orbital is actually better (crossover happened)
      // Start with no tint (0), only change when crossover occurs
      if (isOrbitalBetter && !hasCrossedRef.current) {
        // Cost crossover just happened - apply green tint
        setTintIntensity(1.0);
        hasCrossedRef.current = true;
      } else if (!isOrbitalBetter) {
        // Orbital is still worse - apply red tint or no tint
        // Don't set hasCrossedRef until crossover actually happens
        setTintIntensity(-1.0);
      }
      // If isOrbitalBetter && hasCrossedRef.current, keep green tint (already crossed)
    } else {
      // No valid cost data yet - no tint
      setTintIntensity(0);
    }
  }, [timeline]);

  // Track last tint intensity to only log on changes
  const lastTintRef = useRef<number | null>(null);
  
  // Apply tint to material
  useFrame(() => {
    if (materialRef.current) {
      // Interpolate color: red (tintIntensity = -1) to green (tintIntensity = +1)
      const redTint = Math.max(0, -tintIntensity); // 1 when tintIntensity = -1
      const greenTint = Math.max(0, tintIntensity); // 1 when tintIntensity = +1
      const tintAmount = Math.abs(tintIntensity) * 0.15; // Increased to 15% for better visibility
      
      // Only log when tint intensity changes significantly (not every frame)
      const tintChanged = lastTintRef.current === null || Math.abs(tintIntensity - lastTintRef.current) > 0.1;
      
      // Apply as emissive tint
      if (tintIntensity < 0) {
        // Red tint (orbital worse than ground)
        materialRef.current.emissive = new THREE.Color(redTint * tintAmount, 0, 0);
        if (tintChanged && Math.abs(tintIntensity) > 0.5) {
          // Removed verbose logging
        }
      } else if (tintIntensity > 0) {
        // Green-cyan tint (orbital better than ground)
        materialRef.current.emissive = new THREE.Color(0, greenTint * tintAmount * 0.8, greenTint * tintAmount * 0.6);
        if (tintChanged && Math.abs(tintIntensity) > 0.5) {
          // Removed verbose logging
        }
      } else {
        materialRef.current.emissive = new THREE.Color(0, 0, 0);
      }
      
      if (tintChanged) {
        lastTintRef.current = tintIntensity;
      }
    }
  });

  useEffect(() => {
    if (!earthRef.current || !earthRootRef.current) return;

    // STEP 1: Force zero-state Earth - nuke any hidden rotations
    earthRef.current.traverse((obj) => {
      if (obj instanceof THREE.Object3D) {
        obj.rotation.set(0, 0, 0);
        obj.position.set(0, 0, 0);
        obj.scale.set(1, 1, 1);
      }
    });

    // STEP 3: Force non-mirrored texture
    if (map) {
      // Removed verbose logging

      // FIX THE EARTH TEXTURE ORIENTATION - World is upside down, so flip Y
      map.flipY = true; // Changed to true to fix upside-down world
      map.offset.set(0, 0);
      map.repeat.set(1, 1);

      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
    }
  }, [map]);

  // STEP 2: Force known-good Earth geometry
  // LOCK THE EARTH ORIENTATION - no rotation allowed
  return (
    <group ref={earthRootRef} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
      <mesh 
        ref={earthRef} 
        rotation={[0, 0, 0]} 
        position={[0, 0, 0]}
        scale={[1, 1, 1]}
      >
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          ref={materialRef}
          map={map}
          metalness={0.1}
          roughness={0.9}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>
    </group>
  );
}

function GlobeFallback() {
  const fallbackRef = useRef<THREE.Mesh>(null);
  const fallbackRootRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!fallbackRef.current || !fallbackRootRef.current) return;

    // STEP 1: Force zero-state Earth
    fallbackRef.current.traverse((obj) => {
      if (obj instanceof THREE.Object3D) {
        obj.rotation.set(0, 0, 0);
        obj.position.set(0, 0, 0);
        obj.scale.set(1, 1, 1);
      }
    });
  }, []);

  return (
    <group ref={fallbackRootRef} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
      <mesh ref={fallbackRef} rotation={[0, 0, 0]} position={[0, 0, 0]}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial
          color="#3a5a7a"
          metalness={0.1}
          roughness={0.9}
          emissive="#2a4a6a"
          emissiveIntensity={0.3}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>
    </group>
  );
}

export function GlobeMesh() {
  return (
    <Suspense fallback={<GlobeFallback />}>
      <GlobeWithTexture />
    </Suspense>
  );
}
