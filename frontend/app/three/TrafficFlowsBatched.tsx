/**
 * Batched Routing Lines - Single BufferGeometry for all routes
 * Massive performance improvement: 1 draw call instead of N
 */

"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Vector3, BufferGeometry, BufferAttribute, LineBasicMaterial, PointsMaterial, Line3 } from "three";
import { useOrbitSim } from "../state/orbitStore";
import { useSimulationStore } from "../store/simulationStore";
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
  const activeStrategy = useSimulationStore((s) => s.activeStrategy || "balanced");
  
  // Refs for batched geometry
  const lineGeometryRef = useRef<BufferGeometry | null>(null);
  const pulseGeometryRef = useRef<BufferGeometry | null>(null);
  const arrowGeometryRef = useRef<BufferGeometry | null>(null);
  
  // Route data cache
  const routeDataRef = useRef<Map<string, RouteData>>(new Map());
  const lastRoutesHashRef = useRef<string>("");
  const jitterTimeRef = useRef<number>(0);
  
  // Rebuilding flag to prevent rendering during updates
  const isRebuildingRef = useRef<boolean>(false);
  
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
      
      // Calculate thickness from traffic - MUCH MORE VISIBLE VARIATION
      const trafficMbps = route.trafficMbps || 100;
      const minRadius = 0.01; // Very thin for low traffic
      const maxRadius = 0.4; // Much thicker for high traffic (4x variation)
      // Logarithmic scale for better visual distinction: 10 Mbps = 0.01, 100 Mbps = 0.1, 1000 Mbps = 0.4
      const logTraffic = Math.log10(Math.max(1, trafficMbps));
      const logMin = Math.log10(10); // 10 Mbps
      const logMax = Math.log10(1000); // 1000 Mbps
      const normalized = (logTraffic - logMin) / (logMax - logMin);
      const thickness = minRadius + (normalized * (maxRadius - minRadius));
      
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
    // Use requestAnimationFrame to ensure updates happen before next render
    requestAnimationFrame(() => {
      // Prevent rendering during rebuild
      isRebuildingRef.current = true;
      
      const routeDataArray = Array.from(routeDataRef.current.values());
      
      if (routeDataArray.length === 0) {
        if (lineGeometryRef.current) {
          // Dispose old attributes first
          if (lineGeometryRef.current.attributes.position) {
            lineGeometryRef.current.deleteAttribute('position');
          }
          if (lineGeometryRef.current.attributes.color) {
            lineGeometryRef.current.deleteAttribute('color');
          }
          lineGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
        }
        if (pulseGeometryRef.current) {
          // Dispose old attributes first
          if (pulseGeometryRef.current.attributes.position) {
            pulseGeometryRef.current.deleteAttribute('position');
          }
          if (pulseGeometryRef.current.attributes.color) {
            pulseGeometryRef.current.deleteAttribute('color');
          }
          if (pulseGeometryRef.current.attributes.size) {
            pulseGeometryRef.current.deleteAttribute('size');
          }
          pulseGeometryRef.current.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
        }
        isRebuildingRef.current = false;
        return;
      }
      
      // Build line geometry (all routes as line segments)
      const linePositions: number[] = [];
      const lineColors: number[] = [];
      
      routeDataArray.forEach((routeData) => {
      // Add jitter to points (for congestion visualization) - only update if requested
      const route = routes.find(r => r.id === routeData.id);
      const congestion = route?.congestionIndex || 0;
      
      const jitteredPoints = routeData.points.map((point, i) => {
        if (!updateJitter) {
          return point; // Use original points if not updating jitter
        }
        
        // Only apply jitter if there's significant congestion
        if (congestion < 0.3) {
          return point; // No jitter for low congestion
        }
        
        const progress = i / (routeData.points.length - 1);
        
        // SMOOTHER JITTER: Lower frequency (2 cycles instead of 8), slower time multiplier (0.5 instead of 2)
        const jitterPhase = ((progress * 2 * Math.PI * 2) + (jitterTimeRef.current * 0.5)) % (Math.PI * 2);
        
        // Use smoother easing function (ease-in-out sine) instead of raw sine
        const smoothJitter = Math.sin(jitterPhase);
        // Apply congestion-based scaling with smoother curve
        const congestionScale = Math.pow(congestion, 0.7); // Softer curve (0.7 instead of linear)
        const jitterAmount = smoothJitter * 0.015 * congestionScale; // Reduced base amount, scaled by congestion
        
        const nextPoint = routeData.points[Math.min(i + 1, routeData.points.length - 1)];
        const prevPoint = routeData.points[Math.max(i - 1, 0)];
        const direction = nextPoint.clone().sub(prevPoint).normalize();
        const perpendicular = new Vector3(-direction.y, direction.x, 0).normalize();
        if (perpendicular.length() < 0.1) {
          perpendicular.set(0, 0, 1);
        }
        
        return point.clone().add(perpendicular.multiplyScalar(jitterAmount));
      });
      
      // Add line segments with 1-3 PARALLEL LINES for thickness visualization
      const thickness = routeData.thickness;
      // route and congestion already defined above for jitter calculation
      
      // Scale color intensity based on thickness (thicker = brighter)
      const minThickness = 0.01;
      const maxThickness = 0.4;
      const thicknessNormalized = (thickness - minThickness) / (maxThickness - minThickness);
      const colorIntensity = 0.4 + (thicknessNormalized * 0.6); // 0.4 to 1.0 (wider range)
      
      // Number of parallel lines for thickness: 1-3 lines (not 1-8)
      const numThicknessLines = Math.max(1, Math.min(3, Math.floor(thicknessNormalized * 3) + 1)); // 1-3 lines
      
      for (let i = 0; i < jitteredPoints.length - 1; i++) {
        const p1 = jitteredPoints[i];
        const p2 = jitteredPoints[i + 1];
        
        // Calculate perpendicular direction for thickness offset
        const direction = p2.clone().sub(p1).normalize();
        const perpendicular = new Vector3(-direction.y, direction.x, direction.z).normalize();
        if (perpendicular.length() < 0.1) {
          // Fallback if perpendicular is too small
          perpendicular.set(0, 0, 1);
        }
        
        // Add 1-3 parallel lines for thickness
        for (let lineIdx = 0; lineIdx < numThicknessLines; lineIdx++) {
          const offset = (lineIdx - (numThicknessLines - 1) / 2) * (thickness / numThicknessLines);
          const offsetVec = perpendicular.clone().multiplyScalar(offset);
          
          const p1Offset = p1.clone().add(offsetVec);
          const p2Offset = p2.clone().add(offsetVec);
          
          linePositions.push(p1Offset.x, p1Offset.y, p1Offset.z);
          linePositions.push(p2Offset.x, p2Offset.y, p2Offset.z);
          
          // Color intensity based on thickness and congestion
          const congestionDim = 1.0 - (congestion * 0.3); // Dimmer when congested
          lineColors.push(
            routeData.color.r * colorIntensity * congestionDim,
            routeData.color.g * colorIntensity * congestionDim,
            routeData.color.b * colorIntensity * congestionDim
          );
          lineColors.push(
            routeData.color.r * colorIntensity * congestionDim,
            routeData.color.g * colorIntensity * congestionDim,
            routeData.color.b * colorIntensity * congestionDim
          );
        }
        }
      });
      
      // Update line geometry
      if (!lineGeometryRef.current) {
        lineGeometryRef.current = new BufferGeometry();
      }
      
      const positionArray = new Float32Array(linePositions);
      const colorArray = new Float32Array(lineColors);
      
      if (lineGeometryRef.current) {
        // Dispose old attributes first to prevent uniform errors
        if (lineGeometryRef.current.attributes.position) {
          lineGeometryRef.current.deleteAttribute('position');
        }
        if (lineGeometryRef.current.attributes.color) {
          lineGeometryRef.current.deleteAttribute('color');
        }
        
        lineGeometryRef.current.setAttribute('position', new BufferAttribute(positionArray, 3));
        lineGeometryRef.current.setAttribute('color', new BufferAttribute(colorArray, 3));
        if (lineGeometryRef.current.attributes.position) {
          lineGeometryRef.current.attributes.position.needsUpdate = true;
        }
        if (lineGeometryRef.current.attributes.color) {
          lineGeometryRef.current.attributes.color.needsUpdate = true;
        }
      }
      
      // Build pulse geometry (animated particles) - MULTIPLE PARTICLES PER ROUTE
      const pulsePositions: number[] = [];
      const pulseColors: number[] = [];
      const pulseSizes: number[] = [];
      
      routeDataArray.forEach((routeData) => {
      const route = routes.find(r => r.id === routeData.id);
      const congestion = route?.congestionIndex || 0;
      const trafficMbps = route?.trafficMbps || 100;
      
      // Calculate thickness normalized for particle sizing
      const minThickness = 0.01;
      const maxThickness = 0.4;
      const thicknessNormalized = (routeData.thickness - minThickness) / (maxThickness - minThickness);
      
      // Number of particles based on traffic (more traffic = more particles)
      const numParticles = Math.min(8, Math.max(2, Math.floor(trafficMbps / 50))); // 2-8 particles per route
      
      // Spacing between particles (affected by congestion - tighter when congested)
      const baseSpacing = 1.0 / numParticles;
      const congestionSpacing = baseSpacing * (1.0 - congestion * 0.5); // Tighter spacing when congested
      
      for (let i = 0; i < numParticles; i++) {
        // Calculate particle position along route
        const particleOffset = (routeData.progress + (i * congestionSpacing)) % 1.0;
        const forwardIdx = Math.floor(particleOffset * (routeData.points.length - 1));
        const forwardNextIdx = Math.min(forwardIdx + 1, routeData.points.length - 1);
        const forwardT = (particleOffset * (routeData.points.length - 1)) % 1;
        const forwardPoint = routeData.points[forwardIdx].clone().lerp(routeData.points[forwardNextIdx], forwardT);
        
        pulsePositions.push(forwardPoint.x, forwardPoint.y, forwardPoint.z);
        
        // Color intensity based on congestion (dimmer when congested, some fade out)
        const congestionFade = congestion > 0.7 ? (1.0 - (congestion - 0.7) * 3.33) : 1.0; // Fade when very congested
        pulseColors.push(
          routeData.color.r * congestionFade,
          routeData.color.g * congestionFade,
          routeData.color.b * congestionFade
        );
        
        // Particle size based on traffic (larger for high traffic)
        const size = 0.03 + (thicknessNormalized * 0.05); // 0.03 to 0.08
        pulseSizes.push(size);
      }
      
      // Reverse direction particles (fewer, dimmer)
      const numReverseParticles = Math.min(4, Math.max(1, Math.floor(numParticles / 2)));
      for (let i = 0; i < numReverseParticles; i++) {
        const reverseOffset = (1 - routeData.progress + (i * congestionSpacing)) % 1.0;
        const reverseIdx = Math.floor(reverseOffset * (routeData.points.length - 1));
        const reverseNextIdx = Math.min(reverseIdx + 1, routeData.points.length - 1);
        const reverseT = (reverseOffset * (routeData.points.length - 1)) % 1;
        const reversePoint = routeData.points[reverseIdx].clone().lerp(routeData.points[reverseNextIdx], reverseT);
        
        pulsePositions.push(reversePoint.x, reversePoint.y, reversePoint.z);
        pulseColors.push(routeData.color.r * 0.6, routeData.color.g * 0.6, routeData.color.b * 0.6);
          pulseSizes.push(0.025);
        }
      });
      
      // Update pulse geometry
      if (!pulseGeometryRef.current) {
        pulseGeometryRef.current = new BufferGeometry();
      }
      
      const pulsePositionArray = new Float32Array(pulsePositions);
      const pulseColorArray = new Float32Array(pulseColors);
      const pulseSizeArray = new Float32Array(pulseSizes);
      
      if (pulseGeometryRef.current) {
        // Dispose old attributes first to prevent uniform errors
        if (pulseGeometryRef.current.attributes.position) {
          pulseGeometryRef.current.deleteAttribute('position');
        }
        if (pulseGeometryRef.current.attributes.color) {
          pulseGeometryRef.current.deleteAttribute('color');
        }
        if (pulseGeometryRef.current.attributes.size) {
          pulseGeometryRef.current.deleteAttribute('size');
        }
        
        pulseGeometryRef.current.setAttribute('position', new BufferAttribute(pulsePositionArray, 3));
        pulseGeometryRef.current.setAttribute('color', new BufferAttribute(pulseColorArray, 3));
        if (pulseSizes.length > 0) {
          pulseGeometryRef.current.setAttribute('size', new BufferAttribute(pulseSizeArray, 1));
        }
        if (pulseGeometryRef.current.attributes.position) {
          pulseGeometryRef.current.attributes.position.needsUpdate = true;
        }
        if (pulseGeometryRef.current.attributes.color) {
          pulseGeometryRef.current.attributes.color.needsUpdate = true;
        }
        if (pulseSizes.length > 0 && pulseGeometryRef.current.attributes.size) {
          pulseGeometryRef.current.attributes.size.needsUpdate = true;
        }
      }
      
      // Mark rebuild as complete
      isRebuildingRef.current = false;
    });
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
      
      // Calculate speed from latency (inverse) - Strategy affects speed
      const latencyMs = route.latencyMs || 100;
      const baseSpeed = 1 / (latencyMs / 1000);
      
      // Strategy micro-animation: LATENCY strategy = faster routing motion
      let strategySpeedMultiplier = 0.1; // Default: 10x slower
      if (activeStrategy === "latency") {
        strategySpeedMultiplier = 0.25; // 4x slower (faster than default)
      } else if (activeStrategy === "cost" || activeStrategy === "carbon") {
        strategySpeedMultiplier = 0.08; // 12.5x slower (slower than default)
      }
      
      const speed = baseSpeed * strategySpeedMultiplier;
      
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
    
    // Update jitter more frequently for smoother animation (every 0.05 seconds instead of 0.1)
    const lastJitterUpdate = Math.floor(jitterTimeRef.current * 20);
    const currentJitterUpdate = Math.floor((jitterTimeRef.current - effectiveDelta) * 20);
    if (lastJitterUpdate !== currentJitterUpdate) {
      rebuildBatchedGeometry(true); // Update jitter
    }
  });
  
  // Initialize geometries (materials will be managed by React Three Fiber)
  useEffect(() => {
    if (!lineGeometryRef.current) {
      lineGeometryRef.current = new BufferGeometry();
    }
    if (!pulseGeometryRef.current) {
      pulseGeometryRef.current = new BufferGeometry();
    }
    
    rebuildBatchedGeometry(false);
    
    return () => {
      // Only dispose geometries, not materials - React Three Fiber manages materials
      if (lineGeometryRef.current) {
        lineGeometryRef.current.dispose();
        lineGeometryRef.current = null;
      }
      if (pulseGeometryRef.current) {
        pulseGeometryRef.current.dispose();
        pulseGeometryRef.current = null;
      }
    };
  }, []);
  
  if (routes.length === 0 || routeDataRef.current.size === 0) {
    return null;
  }
  
  // Don't render if geometries aren't initialized yet or if rebuilding
  if (
    !lineGeometryRef.current || 
    !pulseGeometryRef.current ||
    isRebuildingRef.current
  ) {
    return null;
  }
  
  return (
    <>
      {/* Batched line geometry - all routes in one draw call */}
      <lineSegments geometry={lineGeometryRef.current}>
        <lineBasicMaterial
          vertexColors={true}
          transparent={true}
          opacity={0.9}
          depthTest={true}
          depthWrite={false}
        />
      </lineSegments>
      
      {/* Batched pulse geometry - animated particles with variable sizes */}
      <points geometry={pulseGeometryRef.current}>
        <pointsMaterial
          size={0.08}
          sizeAttenuation={true}
          vertexColors={true}
          transparent={true}
          opacity={0.95}
          depthTest={true}
          depthWrite={false}
        />
      </points>
    </>
  );
}

