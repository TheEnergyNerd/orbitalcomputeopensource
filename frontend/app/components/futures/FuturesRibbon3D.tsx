/**
 * Futures Ribbon 3D
 * A curved ribbon orbiting Earth at fixed altitude, encoding cost trends via color
 * NOT using Z-depth for values - only spatial context is 3D
 */

"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CatmullRomCurve3 } from 'three';
import type { ForecastResult, ForecastPoint } from '@/app/lib/futures/types';

interface FuturesRibbon3DProps {
  forecast: ForecastResult | null;
  type: 'orbit' | 'ground';
  earthRadius: number;
  ribbonAltitude: number; // Distance above Earth surface
  scene: THREE.Scene;
  camera: THREE.Camera;
  rotationSpeed?: number; // Rotation speed relative to Earth
}

export default function FuturesRibbon3D({
  forecast,
  type,
  earthRadius,
  ribbonAltitude,
  scene,
  camera,
  rotationSpeed = 0.1,
}: FuturesRibbon3DProps) {
  const ribbonRef = useRef<THREE.Mesh | null>(null);
  const ticksGroupRef = useRef<THREE.Group | null>(null);
  const curveRef = useRef<CatmullRomCurve3 | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const rotationAngleRef = useRef<number>(0);

  // Color encoding for cost trends (NOT height)
  const getColorForCost = (point: ForecastPoint, type: 'orbit' | 'ground'): THREE.Color => {
    const meanCost = type === 'orbit' ? point.meanOrbitCost : point.meanGroundCost;
    const firstCost = forecast?.points[0] 
      ? (type === 'orbit' ? forecast.points[0].meanOrbitCost : forecast.points[0].meanGroundCost)
      : meanCost;
    
    // Normalize cost change (0 = no change, 1 = 50% reduction, -1 = 50% increase)
    const costChange = (firstCost - meanCost) / firstCost;
    
    if (type === 'orbit') {
      // Green → darker green → teal for decreasing costs (bullish)
      if (costChange > 0.1) {
        return new THREE.Color(0x00ff88); // Bright green (strong reduction)
      } else if (costChange > 0) {
        return new THREE.Color(0x10b981); // Emerald (moderate reduction)
      } else if (costChange > -0.1) {
        return new THREE.Color(0x14b8a6); // Teal (stable)
      } else {
        return new THREE.Color(0x0d9488); // Dark teal (increasing costs)
      }
    } else {
      // Red → orange → yellow for ground costs
      if (costChange > 0.1) {
        return new THREE.Color(0xff4444); // Red (strong reduction)
      } else if (costChange > 0) {
        return new THREE.Color(0xf97316); // Orange (moderate reduction)
      } else if (costChange > -0.1) {
        return new THREE.Color(0xffd700); // Yellow (stable)
      } else {
        return new THREE.Color(0xff6b6b); // Light red (increasing costs)
      }
    }
  };

  // Create ribbon geometry
  useEffect(() => {
    if (!forecast || forecast.points.length === 0) return;

    // Create a circular curve around Earth at ribbon altitude
    const radius = earthRadius + ribbonAltitude;
    const numPoints = 64; // Smooth curve
    const curvePoints: THREE.Vector3[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const y = 0; // Equatorial plane
      curvePoints.push(new THREE.Vector3(x, y, z));
    }

    // Create CatmullRom curve for smooth ribbon
    const curve = new CatmullRomCurve3(curvePoints);
    curve.closed = true;
    curveRef.current = curve;

    // Create ribbon geometry (tube along curve)
    const tubeGeometry = new THREE.TubeGeometry(curve, numPoints, 0.02, 8, false);
    
    // Create material with vertex colors
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });

    // Set vertex colors based on forecast points
    const colors: number[] = [];
    const positions = tubeGeometry.attributes.position;
    
    // Map each vertex to a forecast point based on curve parameter
    for (let i = 0; i < positions.count; i++) {
      const t = (i / positions.count) * forecast.points.length;
      const pointIdx = Math.floor(t) % forecast.points.length;
      const point = forecast.points[pointIdx];
      const color = getColorForCost(point, type);
      colors.push(color.r, color.g, color.b);
    }
    
    tubeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Create mesh
    const ribbon = new THREE.Mesh(tubeGeometry, material);
    ribbon.name = `futures-ribbon-${type}`;
    scene.add(ribbon);
    ribbonRef.current = ribbon;

    // Create year ticks along the ribbon
    const ticksGroup = new THREE.Group();
    ticksGroup.name = `futures-ticks-${type}`;
    
    forecast.points.forEach((point, idx) => {
      const t = idx / forecast.points.length;
      const position = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      
      // Create vertical tick (small cylinder)
      const tickGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.1, 8);
      const tickMaterial = new THREE.MeshPhongMaterial({
        color: getColorForCost(point, type),
        emissive: getColorForCost(point, type),
        emissiveIntensity: 0.3,
      });
      const tick = new THREE.Mesh(tickGeometry, tickMaterial);
      
      // Position tick perpendicular to ribbon
      tick.position.copy(position);
      tick.position.y += 0.05; // Extend upward
      tick.lookAt(position.clone().add(tangent));
      tick.rotateX(Math.PI / 2);
      
      // Store point data for hover interaction
      (tick.userData as any).forecastPoint = point;
      (tick.userData as any).year = point.year;
      
      ticksGroup.add(tick);
    });
    
    scene.add(ticksGroup);
    ticksGroupRef.current = ticksGroup;

    return () => {
      if (ribbonRef.current) {
        scene.remove(ribbonRef.current);
        ribbonRef.current.geometry.dispose();
        (ribbonRef.current.material as THREE.Material).dispose();
        ribbonRef.current = null;
      }
      if (ticksGroupRef.current) {
        scene.remove(ticksGroupRef.current);
        ticksGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            child.material.dispose();
          }
        });
        ticksGroupRef.current = null;
      }
    };
  }, [forecast, type, earthRadius, ribbonAltitude, scene]);

  // Animate ribbon rotation
  useEffect(() => {
    const animate = () => {
      if (ribbonRef.current && ticksGroupRef.current) {
        rotationAngleRef.current += rotationSpeed * 0.01;
        
        // Rotate ribbon and ticks around Y-axis (locked relative to Earth)
        ribbonRef.current.rotation.y = rotationAngleRef.current;
        ticksGroupRef.current.rotation.y = rotationAngleRef.current;
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [rotationSpeed]);

  return null; // This component manages Three.js objects directly
}

