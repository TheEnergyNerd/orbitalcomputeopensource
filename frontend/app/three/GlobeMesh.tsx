"use client";

import * as THREE from "three";
import { Suspense, useRef, useEffect } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";

function GlobeWithTexture() {
  const earthRef = useRef<THREE.Mesh>(null);
  const earthRootRef = useRef<THREE.Group>(null);
  const map = useLoader(
    TextureLoader,
    "https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg"
  );

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
      console.log("[GlobeMesh] Texture state:", {
        repeat: map.repeat,
        offset: map.offset,
        flipY: map.flipY,
      });

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
