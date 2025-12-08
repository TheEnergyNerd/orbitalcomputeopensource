/**
 * Analytics Billboard
 * Renders 2D React components (SVG charts) as textures on 3D planes
 * Planes always face camera but preserve world location
 */

"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createRoot } from 'react-dom/client';

interface AnalyticsBillboardProps {
  position: [number, number, number];
  width?: number;
  height?: number;
  children: React.ReactNode;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

export default function AnalyticsBillboard({
  position,
  width = 1,
  height = 1,
  children,
  scene,
  camera,
}: AnalyticsBillboardProps) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create canvas for rendering React component
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    // Create container for React component
    const container = document.createElement('div');
    container.style.width = '512px';
    container.style.height = '512px';
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    document.body.appendChild(container);
    containerRef.current = container;

    // Render React component to container
    const root = createRoot(container);
    root.render(children as React.ReactElement);

    // Wait for render, then capture to canvas
    setTimeout(() => {
      if (!canvas || !container) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Use html2canvas or similar to capture React component
      // For now, we'll use a simpler approach with SVG
      const svgElement = container.querySelector('svg');
      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          
          // Create texture from canvas
          const texture = new THREE.CanvasTexture(canvas);
          texture.needsUpdate = true;
          textureRef.current = texture;

          // Create plane geometry
          const geometry = new THREE.PlaneGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(...position);
          mesh.name = 'analytics-billboard';
          scene.add(mesh);
          meshRef.current = mesh;
        };
        img.src = url;
      } else {
        // Fallback: render container content to canvas using html2canvas if available
        // For now, create a simple colored plane
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        scene.add(mesh);
        meshRef.current = mesh;
      }
    }, 100);

    return () => {
      if (meshRef.current) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        if (meshRef.current.material instanceof THREE.Material) {
          meshRef.current.material.dispose();
        }
        meshRef.current = null;
      }
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      if (canvasRef.current) {
        document.body.removeChild(canvasRef.current);
        canvasRef.current = null;
      }
      if (containerRef.current) {
        document.body.removeChild(containerRef.current);
        containerRef.current = null;
      }
    };
  }, [children, position, width, height, scene]);

  // Update billboard to face camera
  useEffect(() => {
    if (!meshRef.current || !camera) return;

    const updateBillboard = () => {
      if (!meshRef.current) return;
      
      // Make plane face camera
      const camPos = camera.position.clone();
      const meshPos = meshRef.current.position.clone();
      const direction = camPos.sub(meshPos).normalize();
      
      meshRef.current.lookAt(meshPos.clone().add(direction));
    };

    const animate = () => {
      updateBillboard();
      requestAnimationFrame(animate);
    };

    animate();
  }, [camera]);

  return null;
}

