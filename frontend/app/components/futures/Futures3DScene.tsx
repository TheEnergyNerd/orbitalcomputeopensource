/**
 * Futures 3D Scene
 * Integrates all 3D financial visualizations into a Three.js scene
 * Works alongside the existing D3/SVG globe
 */

"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FuturesRibbon3D from './FuturesRibbon3D';
import UncertaintyCones3D from './UncertaintyCones3D';
import SentimentParticleField from './SentimentParticleField';
import { useSimulationStore } from '@/app/store/simulationStore';

interface Futures3DSceneProps {
  containerRef: React.RefObject<HTMLDivElement>;
  earthRadius?: number;
  ribbonAltitude?: number;
  coneAltitude?: number;
  torusRadius?: number;
}

export default function Futures3DScene({
  containerRef,
  earthRadius = 1.0,
  ribbonAltitude = 0.1,
  coneAltitude = 0.05,
  torusRadius = 0.03,
}: Futures3DSceneProps) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const futuresForecast = useSimulationStore((s) => s.futuresForecast);
  const futuresSentiment = useSimulationStore((s) => s.futuresSentiment);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background to overlay on globe
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls (optional - can be disabled to use parent globe controls)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false; // Disable to use parent controls
    controls.enablePan = false;
    controls.enableRotate = false;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      if (!renderer || !scene || !camera) return;
      
      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
    };
  }, [containerRef]);

  // Render 3D components - they manage their own Three.js objects via useEffect
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;

    const scene = sceneRef.current;
    const camera = cameraRef.current;

    // Components will be rendered via their useEffect hooks
    // They receive scene and camera refs and manage their own lifecycle
  }, [futuresForecast, futuresSentiment, earthRadius, ribbonAltitude, coneAltitude, torusRadius]);

  // Render component wrappers that will set up their Three.js objects
  if (!sceneRef.current || !cameraRef.current) {
    return null;
  }

  const scene = sceneRef.current;
  const camera = cameraRef.current;

  return (
    <>
      {futuresForecast && (
        <>
          <FuturesRibbon3D
            forecast={futuresForecast}
            type="orbit"
            earthRadius={earthRadius}
            ribbonAltitude={ribbonAltitude}
            scene={scene}
            camera={camera}
          />
          <FuturesRibbon3D
            forecast={futuresForecast}
            type="ground"
            earthRadius={earthRadius}
            ribbonAltitude={ribbonAltitude + 0.02}
            scene={scene}
            camera={camera}
          />
          <UncertaintyCones3D
            forecast={futuresForecast}
            type="orbit"
            earthRadius={earthRadius}
            ribbonAltitude={ribbonAltitude}
            coneAltitude={coneAltitude}
            scene={scene}
            camera={camera}
          />
          <UncertaintyCones3D
            forecast={futuresForecast}
            type="ground"
            earthRadius={earthRadius}
            ribbonAltitude={ribbonAltitude + 0.02}
            coneAltitude={coneAltitude}
            scene={scene}
            camera={camera}
          />
        </>
      )}
      {futuresSentiment && (
        <SentimentParticleField
          sentiment={futuresSentiment}
          earthRadius={earthRadius}
          ribbonAltitude={ribbonAltitude}
          torusRadius={torusRadius}
          scene={scene}
        />
      )}
    </>
  );
}

