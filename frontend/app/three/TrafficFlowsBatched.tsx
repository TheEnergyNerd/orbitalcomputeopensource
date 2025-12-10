/**
 * Batched Routing Lines - Single BufferGeometry for all routes
 * Massive performance improvement: 1 draw call instead of N
 */

"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Vector3, BufferGeometry, BufferAttribute, LineBasicMaterial, Line3 } from "three";
import { useOrbitSim } from "../state/orbitStore";
import { createGeodesicArc } from "../lib/three/coordinateUtils";

interface RouteData {
  id: string;
  points: Vector3[];
  color: THREE.Color;
  thickness: number;
  progress: number;
  forwardDirection: Vector3;
  reverseDirection: Vector3;
  forwardPos: Vector3;
  reversePos: Vector3;
}

const MAX_ROUTES = 50; // Can handle more with batching
const POINTS_PER_ROUTE = 50; // Points per geodesic arc

export function TrafficFlowsBatched() {
  const routes = useOrbitSim((s) => s.routes);
  const simPaused = useOrbitSim((s) => s.simPaused);
  const simSpeed = useOrbitSim((s) => s.simSpeed);
  
  // Refs for batched geometry
  const lineGeometryRef = useRef<BufferGeometry>(null!);
  const pulseGeometryRef = useRef<BufferGeometry>(null!);
  const arrowGeometryRef = useRef<BufferGeometry>(null!);
  
  // Route data cache
  const routeDataRef = useRef<Map<string, RouteData>>(new Map());
  const lastRoutesHashRef = useRef<string>("");
  const jitterTimeRef = useRef<number>(0);
  
  // Material refs
  const lineMaterialRef = useRef<LineBasicMaterial>(null!);
  
  // Update route data when routes change (event-driven)
  useEffect(() => {
    const routesHash = routes.map(r => r.id).join(",");
    if (routesHash === lastRoutesHashRef.current) return;
    lastRoutesHashRef.current = routesHash;
    
    // Limit routes for performance
    const visibleRoutes = routes.length > MAX_ROUTES
      ? [...routes].sort((a, b) => (b.trafficMbps || 0) - (a.trafficMbps || 0)).slice(0, MAX_ROUTES)
      : routes;
    
    // Clear old route data
    routeDataRef.current.clear();
    
    // Calculate route data for each route
    visibleRoutes.forEach((route) => {
      const fromVec = new Vector3(route.fromVec[0], route.fromVec[1], route.fromVec[2]);
      const toVec = new Vector3(route.toVec[0], route.toVec[1], route.toVec[2]);
      
      const fromRadius = fromVec.length();
      const toRadius = toVec.length();
      
      // Convert to lat/lon/alt
      const fromLat = Math.asin(fromVec.z / fromRadius) * 180 / Math.PI;
      const fromLon = Math.atan2(fromVec.y, fromVec.x) * 180 / Math.PI;
      const fromAlt = (fromRadius - 1) * 6371;
      
      const toLat = Math.asin(toVec.z / toRadius) * 180 / Math.PI;
      const toLon = Math.atan2(toVec.y, toVec.x) * 180 / Math.PI;
      const toAlt = (toRadius - 1) * 6371;
      
      // CRITICAL: Use exact satellite positions for start/end of arc
      // This ensures arcs connect exactly to satellites
      const exactStartXYZ: [number, number, number] = [fromVec.x, fromVec.y, fromVec.z];
      const exactEndXYZ: [number, number, number] = [toVec.x, toVec.y, toVec.z];
      
      // Create geodesic arc with exact start/end positions
      const arcPoints = createGeodesicArc(fromLat, fromLon, fromAlt, toLat, toLon, toAlt, POINTS_PER_ROUTE, exactStartXYZ, exactEndXYZ);
      const points = arcPoints.map(([x, y, z]) => new Vector3(x, y, z));
      
      // Determine color based on route type
      let color = new THREE.Color(0x00ffff); // Cyan default
      if (route.type === 'ground') {
        color = new THREE.Color(0x00ff00); // Green
      } else if (route.type === 'core') {
        color = new THREE.Color(0xff00ff); // Purple
      }
      
      // Calculate thickness from traffic - MORE VISIBLE VARIATION
      const trafficMbps = route.trafficMbps || 100;
      const minRadius = 0.02; // Increased minimum for visibility
      const maxRadius = 0.25; // Increased maximum for better variation
      // Scale: 10 Mbps = 0.02, 100 Mbps = 0.08, 500 Mbps = 0.25
      const thickness = Math.max(minRadius, Math.min(maxRadius, 0.02 + (trafficMbps / 500) * 0.23));
      
      // Initial progress (will be animated)
      const progress = 0;
      
      // Calculate directions
      const forwardDirection = toVec.clone().sub(fromVec).normalize();
      const reverseDirection = forwardDirection.clone().negate();
      
      routeDataRef.current.set(route.id, {
        id: route.id,
        points,
        color,
        thickness,
        progress,
        forwardDirection,
        reverseDirection,
        forwardPos: fromVec.clone(),
        reversePos: toVec.clone(),
      });
    });
    
    // Rebuild batched geometry
    rebuildBatchedGeometry();
  }, [routes]);
  
  // Rebuild batched geometry from route data
  const rebuildBatchedGeometry = (updateJitter: boolean = false) => {
    const routeDataArray = Array.from(routeDataRef.current.values());
    
    if (routeDataArray.length === 0) {
      if (lineGeometryRef.current) {
        lineGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
      }
      return;
    }
    
    // Build line geometry (all routes as line segments)
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    
    routeDataArray.forEach((routeData) => {
      // Add jitter to points (for congestion visualization) - only update if requested
      const jitteredPoints = routeData.points.map((point, i) => {
        if (!updateJitter) {
          return point; // Use original points if not updating jitter
        }
        
        const progress = i / (routeData.points.length - 1);
        const jitterPhase = ((progress * 2 * Math.PI * 8) + (jitterTimeRef.current * 2)) % (Math.PI * 2);
        const jitterAmount = Math.sin(jitterPhase) * 0.02; // Reduced jitter for batched version
        
        const nextPoint = routeData.points[Math.min(i + 1, routeData.points.length - 1)];
        const prevPoint = routeData.points[Math.max(i - 1, 0)];
        const direction = nextPoint.clone().sub(prevPoint).normalize();
        const perpendicular = new Vector3(-direction.y, direction.x, 0).normalize();
        if (perpendicular.length() < 0.1) {
          perpendicular.set(0, 0, 1);
        }
        
        return point.clone().add(perpendicular.multiplyScalar(jitterAmount));
      });
      
      // Add line segments - SIMPLE SINGLE LINES to prevent glitching
      // Thickness variation shown through color intensity and opacity
      const thickness = routeData.thickness;
      
      // Scale color intensity based on thickness (thicker = brighter)
      const minThickness = 0.02;
      const maxThickness = 0.25;
      const thicknessNormalized = (thickness - minThickness) / (maxThickness - minThickness);
      const colorIntensity = 0.5 + (thicknessNormalized * 0.5); // 0.5 to 1.0
      
      for (let i = 0; i < jitteredPoints.length - 1; i++) {
        const p1 = jitteredPoints[i];
        const p2 = jitteredPoints[i + 1];
        
        // Simple line segment - no parallel lines to prevent glitching
        linePositions.push(p1.x, p1.y, p1.z);
        linePositions.push(p2.x, p2.y, p2.z);
        
        // Color intensity based on thickness (thicker routes are brighter)
        lineColors.push(
          routeData.color.r * colorIntensity,
          routeData.color.g * colorIntensity,
          routeData.color.b * colorIntensity
        );
        lineColors.push(
          routeData.color.r * colorIntensity,
          routeData.color.g * colorIntensity,
          routeData.color.b * colorIntensity
        );
      }
    });
    
    // Update line geometry
    if (!lineGeometryRef.current) {
      lineGeometryRef.current = new BufferGeometry();
    }
    
    const positionArray = new Float32Array(linePositions);
    const colorArray = new Float32Array(lineColors);
    
    lineGeometryRef.current.setAttribute('position', new BufferAttribute(positionArray, 3));
    lineGeometryRef.current.setAttribute('color', new BufferAttribute(colorArray, 3));
    lineGeometryRef.current.attributes.position.needsUpdate = true;
    lineGeometryRef.current.attributes.color.needsUpdate = true;
    
    // Build pulse geometry (animated particles)
    const pulsePositions: number[] = [];
    const pulseColors: number[] = [];
    
    routeDataArray.forEach((routeData) => {
      // Forward pulse
      const forwardIdx = Math.floor(routeData.progress * (routeData.points.length - 1));
      const forwardNextIdx = Math.min(forwardIdx + 1, routeData.points.length - 1);
      const forwardT = (routeData.progress * (routeData.points.length - 1)) % 1;
      const forwardPoint = routeData.points[forwardIdx].clone().lerp(routeData.points[forwardNextIdx], forwardT);
      
      pulsePositions.push(forwardPoint.x, forwardPoint.y, forwardPoint.z);
      pulseColors.push(routeData.color.r, routeData.color.g, routeData.color.b);
      
      // Reverse pulse
      const reverseProgress = (1 - routeData.progress) % 1;
      const reverseIdx = Math.floor(reverseProgress * (routeData.points.length - 1));
      const reverseNextIdx = Math.min(reverseIdx + 1, routeData.points.length - 1);
      const reverseT = (reverseProgress * (routeData.points.length - 1)) % 1;
      const reversePoint = routeData.points[reverseIdx].clone().lerp(routeData.points[reverseNextIdx], reverseT);
      
      pulsePositions.push(reversePoint.x, reversePoint.y, reversePoint.z);
      pulseColors.push(routeData.color.r * 0.8, routeData.color.g * 0.8, routeData.color.b * 0.8);
    });
    
    // Update pulse geometry
    if (!pulseGeometryRef.current) {
      pulseGeometryRef.current = new BufferGeometry();
    }
    
    const pulsePositionArray = new Float32Array(pulsePositions);
    const pulseColorArray = new Float32Array(pulseColors);
    
    pulseGeometryRef.current.setAttribute('position', new BufferAttribute(pulsePositionArray, 3));
    pulseGeometryRef.current.setAttribute('color', new BufferAttribute(pulseColorArray, 3));
    pulseGeometryRef.current.attributes.position.needsUpdate = true;
    pulseGeometryRef.current.attributes.color.needsUpdate = true;
  };
  
  // Animate progress and jitter (per-frame updates)
  useFrame((state, delta) => {
    if (simPaused) return;
    
    const effectiveDelta = delta * simSpeed;
    jitterTimeRef.current += effectiveDelta;
    
    // Update progress for each route
    let needsRebuild = false;
    routeDataRef.current.forEach((routeData) => {
      // Get route to calculate speed
      const route = routes.find(r => r.id === routeData.id);
      if (!route) return;
      
      // Calculate speed from latency (inverse) - SLOWED DOWN SIGNIFICANTLY
      const latencyMs = route.latencyMs || 100;
      // Scale down speed: lower latency = faster, but much slower overall
      // Original: speed = 1 / (latencyMs / 1000) was too fast
      // New: scale by 0.1 to make it 10x slower
      const baseSpeed = 1 / (latencyMs / 1000);
      const speed = baseSpeed * 0.1; // 10x slower for better visibility
      
      // Update progress
      const oldProgress = routeData.progress;
      routeData.progress = (routeData.progress + speed * effectiveDelta) % 1;
      
      if (Math.abs(routeData.progress - oldProgress) > 0.01) {
        needsRebuild = true;
      }
    });
    
    // Rebuild geometry if progress changed significantly
    if (needsRebuild) {
      rebuildBatchedGeometry(false); // Don't update jitter on every frame
    }
    
    // Update jitter less frequently (every 0.1 seconds)
    const lastJitterUpdate = Math.floor(jitterTimeRef.current * 10);
    const currentJitterUpdate = Math.floor((jitterTimeRef.current - effectiveDelta) * 10);
    if (lastJitterUpdate !== currentJitterUpdate) {
      rebuildBatchedGeometry(true); // Update jitter
    }
  });
  
  // Initialize geometries
  useEffect(() => {
    if (!lineGeometryRef.current) {
      lineGeometryRef.current = new BufferGeometry();
    }
    if (!pulseGeometryRef.current) {
      pulseGeometryRef.current = new BufferGeometry();
    }
    if (!lineMaterialRef.current) {
      lineMaterialRef.current = new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9, // Slightly more opaque for better visibility
        linewidth: 2, // Note: linewidth doesn't work in WebGL, but kept for compatibility
        depthTest: true,
        depthWrite: false, // Prevent z-fighting
      });
    }
    
    rebuildBatchedGeometry(false);
    
    return () => {
      if (lineGeometryRef.current) {
        lineGeometryRef.current.dispose();
      }
      if (pulseGeometryRef.current) {
        pulseGeometryRef.current.dispose();
      }
      if (lineMaterialRef.current) {
        lineMaterialRef.current.dispose();
      }
    };
  }, []);
  
  if (routes.length === 0 || routeDataRef.current.size === 0) {
    return null;
  }
  
  return (
    <>
      {/* Batched line geometry - all routes in one draw call */}
      <lineSegments geometry={lineGeometryRef.current} material={lineMaterialRef.current} />
      
      {/* Batched pulse geometry - animated particles */}
      <points geometry={pulseGeometryRef.current}>
        <pointsMaterial
          size={0.04}
          vertexColors={true}
          transparent
          opacity={0.9}
        />
      </points>
    </>
  );
}

