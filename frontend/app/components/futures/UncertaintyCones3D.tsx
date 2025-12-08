/**
 * Uncertainty Cones 3D
 * 2D band polygons (mean ± 1σ, ±2σ) rendered as flat meshes positioned above ribbon
 * NOT extruded into 3D - only spatial positioning is 3D
 */

"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CatmullRomCurve3 } from 'three';
import type { ForecastResult, ForecastPoint } from '@/app/lib/futures/types';

interface UncertaintyCones3DProps {
  forecast: ForecastResult | null;
  type: 'orbit' | 'ground';
  earthRadius: number;
  ribbonAltitude: number;
  coneAltitude: number; // Height above ribbon
  scene: THREE.Scene;
  camera: THREE.Camera;
  billboardTilt?: number; // Degrees to tilt toward camera (5-7 degrees)
}

export default function UncertaintyCones3D({
  forecast,
  type,
  earthRadius,
  ribbonAltitude,
  coneAltitude,
  scene,
  camera,
  billboardTilt = 6,
}: UncertaintyCones3DProps) {
  const conesGroupRef = useRef<THREE.Group | null>(null);
  const curveRef = useRef<CatmullRomCurve3 | null>(null);

  useEffect(() => {
    if (!forecast || forecast.points.length === 0) return;

    // Create same curve as ribbon (for positioning)
    const radius = earthRadius + ribbonAltitude;
    const numCurvePoints = 64;
    const curvePoints: THREE.Vector3[] = [];

    for (let i = 0; i <= numCurvePoints; i++) {
      const angle = (i / numCurvePoints) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const y = 0;
      curvePoints.push(new THREE.Vector3(x, y, z));
    }

    const curve = new CatmullRomCurve3(curvePoints);
    curve.closed = true;
    curveRef.current = curve;

    const conesGroup = new THREE.Group();
    conesGroup.name = `uncertainty-cones-${type}`;

    // Normalize cost values for 2D polygon generation
    const allCosts = forecast.points.flatMap(p => [
      type === 'orbit' ? p.meanOrbitCost : p.meanGroundCost,
      type === 'orbit' ? p.p16Orbit : p.p16Ground,
      type === 'orbit' ? p.p84Orbit : p.p84Ground,
      type === 'orbit' ? p.p2_5Orbit : p.p2_5Ground,
      type === 'orbit' ? p.p97_5Orbit : p.p97_5Ground,
    ]);
    const minCost = Math.min(...allCosts);
    const maxCost = Math.max(...allCosts);
    const costRange = maxCost - minCost || 1;
    
    // Scale factor for 2D polygon (NOT encoding in Z)
    const polygonScale = 0.3; // Fixed scale - cost is encoded in polygon shape, not Z

    // Generate polygons for each cone layer
    const generatePolygon = (
      points: ForecastPoint[],
      getUpper: (p: ForecastPoint) => number,
      getLower: (p: ForecastPoint) => number,
      color: THREE.Color,
      opacity: number
    ) => {
      const shape = new THREE.Shape();
      const vertices: THREE.Vector3[] = [];

      // Upper edge
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const t = i / points.length;
        const curvePos = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const normal = new THREE.Vector3(0, 1, 0); // Up vector
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        
        const upperCost = getUpper(point);
        const costOffset = ((upperCost - minCost) / costRange) * polygonScale;
        
        // Position in 2D plane (perpendicular to ribbon)
        const vertex = curvePos.clone();
        vertex.add(binormal.clone().multiplyScalar(costOffset));
        vertex.y += coneAltitude;
        
        vertices.push(vertex);
        
        if (i === 0) {
          shape.moveTo(costOffset, coneAltitude);
        } else {
          shape.lineTo(costOffset, coneAltitude);
        }
      }

      // Lower edge (reverse)
      for (let i = points.length - 1; i >= 0; i--) {
        const point = points[i];
        const lowerCost = getLower(point);
        const costOffset = ((lowerCost - minCost) / costRange) * polygonScale;
        shape.lineTo(costOffset, coneAltitude);
        
        const t = i / points.length;
        const curvePos = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const normal = new THREE.Vector3(0, 1, 0);
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        
        const vertex = curvePos.clone();
        vertex.add(binormal.clone().multiplyScalar(costOffset));
        vertex.y += coneAltitude;
        
        vertices.push(vertex);
      }

      shape.closePath();

      // Create geometry from shape
      const geometry = new THREE.ShapeGeometry(shape);
      
      // Convert 2D shape to 3D positioned vertices
      const positions = geometry.attributes.position;
      const newPositions: number[] = [];
      
      for (let i = 0; i < positions.count; i++) {
        const idx = Math.floor((i / positions.count) * vertices.length);
        const vertex = vertices[idx % vertices.length];
        newPositions.push(vertex.x, vertex.y, vertex.z);
      }
      
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      geometry.computeVertexNormals();

      // Create material
      const material = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      
      // Billboard effect: face camera with slight tilt
      const updateBillboard = () => {
        const camPos = camera.position.clone();
        const meshPos = mesh.position.clone();
        const direction = camPos.sub(meshPos).normalize();
        
        // Tilt slightly upward
        const tilt = billboardTilt * (Math.PI / 180);
        direction.y += Math.sin(tilt);
        direction.normalize();
        
        mesh.lookAt(meshPos.clone().add(direction));
        mesh.rotateX(tilt);
      };
      
      // Update billboard on camera change
      camera.addEventListener('change', updateBillboard);
      updateBillboard();

      return mesh;
    };

    // Outer cone (95% confidence, p2.5 to p97.5)
    const outerConeColor = type === 'orbit' 
      ? new THREE.Color(0x00ced1) // Teal
      : new THREE.Color(0xcd5c5c); // Maroon
    const outerCone = generatePolygon(
      forecast.points,
      (p) => type === 'orbit' ? p.p97_5Orbit : p.p97_5Ground,
      (p) => type === 'orbit' ? p.p2_5Orbit : p.p2_5Ground,
      outerConeColor,
      0.15
    );
    outerCone.name = `outer-cone-${type}`;
    conesGroup.add(outerCone);

    // Inner cone (68% confidence, p16 to p84)
    const innerConeColor = type === 'orbit'
      ? new THREE.Color(0x20b2aa) // Emerald
      : new THREE.Color(0xff7f50); // Orange
    const innerCone = generatePolygon(
      forecast.points,
      (p) => type === 'orbit' ? p.p84Orbit : p.p84Ground,
      (p) => type === 'orbit' ? p.p16Orbit : p.p16Ground,
      innerConeColor,
      0.25
    );
    innerCone.name = `inner-cone-${type}`;
    conesGroup.add(innerCone);

    // Centerline (mean)
    const centerlineGeometry = new THREE.BufferGeometry();
    const centerlinePositions: number[] = [];
    const centerlineColor = type === 'orbit'
      ? new THREE.Color(0x00ff88) // Neon green
      : new THREE.Color(0xff4444); // Red

    forecast.points.forEach((point, i) => {
      const t = i / forecast.points.length;
      const curvePos = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      
      const meanCost = type === 'orbit' ? point.meanOrbitCost : point.meanGroundCost;
      const costOffset = ((meanCost - minCost) / costRange) * polygonScale;
      
      const vertex = curvePos.clone();
      vertex.add(binormal.clone().multiplyScalar(costOffset));
      vertex.y += coneAltitude;
      
      centerlinePositions.push(vertex.x, vertex.y, vertex.z);
    });

    centerlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(centerlinePositions, 3));
    const centerlineMaterial = new THREE.LineBasicMaterial({
      color: centerlineColor,
      linewidth: 2,
    });
    const centerline = new THREE.Line(centerlineGeometry, centerlineMaterial);
    centerline.name = `centerline-${type}`;
    conesGroup.add(centerline);

    scene.add(conesGroup);
    conesGroupRef.current = conesGroup;

    return () => {
      if (conesGroupRef.current) {
        scene.remove(conesGroupRef.current);
        conesGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        conesGroupRef.current = null;
      }
    };
  }, [forecast, type, earthRadius, ribbonAltitude, coneAltitude, scene, camera, billboardTilt]);

  return null;
}

