"use client";

/**
 * Visual Effects System
 * Implements state-triggered visual effects for orbital simulation
 * All effects are triggered by state changes, not continuous noise
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useSimulationStore } from "../store/simulationStore";
import { useOrbitSim } from "../state/orbitStore";
import { useSimStore } from "../store/simStore";
import { Vector3, Color } from "three";

// ============================================================================
// 1. PULSE EFFECTS
// ============================================================================

/**
 * Annual Deployment Pulse
 * Shell expands 2-4px when year advances, then relaxes
 */
export function AnnualDeploymentPulse() {
  const timeline = useSimulationStore((s) => s.timeline);
  const pulseRef = useRef<{ scale: number; targetScale: number; active: boolean }>({
    scale: 1.0,
    targetScale: 1.0,
    active: false,
  });
  const lastYearRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timeline || timeline.length === 0) return;
    const currentYear = timeline[timeline.length - 1]?.year;
    const lastYear = lastYearRef.current;

    if (lastYear !== null && currentYear !== lastYear) {
      // Year advanced - trigger pulse
      pulseRef.current.targetScale = 1.02; // 2% expansion
      pulseRef.current.active = true;
      
      // Decay back to 1.0 over 400ms
      setTimeout(() => {
        pulseRef.current.targetScale = 1.0;
        setTimeout(() => {
          pulseRef.current.active = false;
        }, 400);
      }, 50);
    }

    lastYearRef.current = currentYear;
  }, [timeline]);

  useFrame((state, delta) => {
    if (!pulseRef.current.active) return;

    // Smooth interpolation
    const diff = pulseRef.current.targetScale - pulseRef.current.scale;
    pulseRef.current.scale += diff * (delta * 10); // 10x speed for 400ms decay

    // Apply to all shell meshes (would need shell refs)
    // For now, this is a placeholder - shell expansion would be implemented in StaticOrbitalShells
  });

  return null;
}

/**
 * Compute Surge Pulse
 * Radial neon ripple when compute crosses major thresholds
 */
export function ComputeSurgePulse() {
  const timeline = useSimulationStore((s) => s.timeline);
  const [surges, setSurges] = useState<Array<{ threshold: string; progress: number; color: string }>>([]);
  const detectedThresholdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!timeline || timeline.length === 0) return;
    
    const currentStep = timeline[timeline.length - 1];
    const totalSatellites = timeline.reduce((sum, step) => sum + (step.podsTotal || 0), 0);
    const powerPerSatelliteKW = 100;
    const totalOrbitalPowerMW = (totalSatellites * powerPerSatelliteKW) / 1000;
    const totalOrbitalPowerWatts = totalOrbitalPowerMW * 1e6;
    const currentYear = currentStep.year;
    const wattsPerTflop = 12.5 * Math.pow(0.85, (currentYear - 2025) / 2);
    const totalOrbitalComputeTFLOPs = totalOrbitalPowerWatts / wattsPerTflop;
    const totalOrbitalComputePFLOPs = totalOrbitalComputeTFLOPs / 1e6;

    // Check thresholds: 10 PFLOPs, 100 PFLOPs, 1 EFLOP (1000 PFLOPs)
    const thresholds = [
      { value: 10, id: "10_PFLOPs", color: "#00ffff" },
      { value: 100, id: "100_PFLOPs", color: "#00ff00" },
      { value: 1000, id: "1_EFLOP", color: "#ff00ff" },
    ];

    thresholds.forEach(threshold => {
      if (totalOrbitalComputePFLOPs >= threshold.value && !detectedThresholdsRef.current.has(threshold.id)) {
        detectedThresholdsRef.current.add(threshold.id);
        setSurges(prev => [...prev, { threshold: threshold.id, progress: 0, color: threshold.color }]);
      }
    });
  }, [timeline]);

  useFrame((state, delta) => {
    setSurges(prev => prev.map(surge => {
      const newProgress = surge.progress + delta * 2; // 2x speed
      if (newProgress >= 1.0) {
        return null; // Remove completed surge
      }
      return { ...surge, progress: newProgress };
    }).filter(Boolean) as typeof surges);
  });

  // Render radial ripples (would need to be implemented in shell rendering)
  return null;
}

// ============================================================================
// 2. BLINK LOGIC
// ============================================================================

/**
 * Failure Blink
 * 2-3 frame bright white blink when satellite fails
 */
export function FailureBlink() {
  const [failures, setFailures] = useState<Array<{ id: string; progress: number; position: Vector3 }>>([]);
  const failureCountRef = useRef(0);
  const lastFailureTimeRef = useRef(0);

  // Rate limit: max 3-5 per second
  const MAX_FAILURES_PER_SECOND = 4;
  const MIN_TIME_BETWEEN_FAILURES = 1000 / MAX_FAILURES_PER_SECOND;

  // This would be triggered by satellite failure events
  // For now, placeholder structure

  useFrame((state, delta) => {
    setFailures(prev => prev.map(failure => {
      const newProgress = failure.progress + delta * 10; // Fast blink
      if (newProgress >= 1.0) {
        return null;
      }
      return { ...failure, progress: newProgress };
    }).filter(Boolean) as typeof failures);
  });

  return null;
}

// ============================================================================
// 3. BREATHING GLOW
// ============================================================================

/**
 * Sun-Facing Inference Breathing
 * Class-B satellites have breathing glow cycle based on sun alignment
 */
export function SunFacingBreathing() {
  const satellites = useOrbitSim((s) => s.satellites);
  const sunDirection = useOrbitSim((s) => s.sunDirection);
  const breathingRef = useRef<Map<string, number>>(new Map());

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    
    satellites.forEach(sat => {
      if (sat.satelliteClass === "B") {
        // Calculate sun alignment (would need actual sun position)
        const alignment = 1.0; // Placeholder
        
        // Breathing cycle: 1-2 second period
        const breathingPhase = (time * 0.5) % (Math.PI * 2); // 2 second cycle
        const breathingIntensity = 0.5 + Math.sin(breathingPhase) * 0.5 * alignment;
        
        breathingRef.current.set(sat.id, breathingIntensity);
      }
    });
  });

  return null;
}

/**
 * Carbon-Weighted World Tint
 * Planet tint shifts red→green based on orbital vs ground carbon
 */
export function CarbonWorldTint() {
  const timeline = useSimulationStore((s) => s.timeline);
  const [tintIntensity, setTintIntensity] = useState(0); // -1 (red) to +1 (green)
  const hasCrossedRef = useRef(false);

  useEffect(() => {
    if (!timeline || timeline.length === 0) return;
    
    const currentStep = timeline[timeline.length - 1];
    const orbitalCarbon = currentStep.carbonMix || 0;
    const groundCarbon = currentStep.carbonGround || 0;

    if (groundCarbon > 0) {
      // Calculate if orbital is better (lower carbon)
      const isOrbitalBetter = orbitalCarbon < groundCarbon;
      const newTint = isOrbitalBetter ? 1.0 : -1.0;
      
      // Only change tint once at crossover, no oscillation
      if (!hasCrossedRef.current || Math.abs(newTint - tintIntensity) > 0.1) {
        setTintIntensity(newTint);
        hasCrossedRef.current = true;
      }
    }
  }, [timeline, tintIntensity]);

  // Apply tint to globe (would need globe material ref)
  return null;
}

// ============================================================================
// 4. ROUTING KINETICS
// ============================================================================

/**
 * Directional Particle Flow
 * Luminous packets move along routing lines
 */
export function RoutingParticles() {
  const routes = useOrbitSim((s) => s.routes);
  const [particles, setParticles] = useState<Array<{ routeId: string; progress: number; speed: number }>>([]);

  useEffect(() => {
    // Create particles for each route
    const newParticles = routes.map(route => ({
      routeId: route.id,
      progress: Math.random(), // Random starting position
      speed: 1 / (route.latencyMs || 100), // Inverse of latency
    }));
    setParticles(newParticles);
  }, [routes]);

  useFrame((state, delta) => {
    setParticles(prev => prev.map(particle => {
      const route = routes.find(r => r.id === particle.routeId);
      if (!route) return null;

      // Speed based on inverse latency
      const newProgress = (particle.progress + particle.speed * delta) % 1.0;
      
      // Congestion affects spacing (bunching up)
      const congestion = route.congestionIndex || 0;
      const spacing = 1.0 - (congestion * 0.5); // Higher congestion = tighter spacing

      return { ...particle, progress: newProgress };
    }).filter(Boolean) as typeof particles);
  });

  // Render particles along routes (would be implemented in TrafficFlowsV2)
  return null;
}

/**
 * Reroute Whiplash
 * Old route fades, new route snaps in brightly
 */
export function RerouteWhiplash() {
  const routes = useOrbitSim((s) => s.routes);
  const lastRoutesHashRef = useRef<string>("");
  const [reroutes, setReroutes] = useState<Array<{ routeId: string; age: number; isNew: boolean }>>([]);

  useEffect(() => {
    const routesHash = routes.map(r => r.id).join(",");
    if (routesHash === lastRoutesHashRef.current) return;

    // Detect new routes (reroutes)
    const currentRouteIds = new Set(routes.map(r => r.id));
    const lastRouteIds = new Set(lastRoutesHashRef.current.split(",").filter(Boolean));

    routes.forEach(route => {
      if (!lastRouteIds.has(route.id)) {
        // New route - snap in
        setReroutes(prev => [...prev, { routeId: route.id, age: 0, isNew: true }]);
      }
    });

    // Fade out old routes
    lastRouteIds.forEach(routeId => {
      if (!currentRouteIds.has(routeId)) {
        setReroutes(prev => [...prev, { routeId, age: 0, isNew: false }]);
      }
    });

    lastRoutesHashRef.current = routesHash;
  }, [routes]);

  useFrame((state, delta) => {
    setReroutes(prev => prev.map(reroute => {
      const newAge = reroute.age + delta;
      if (newAge >= 0.5) {
        return null; // Fade complete
      }
      return { ...reroute, age: newAge };
    }).filter(Boolean) as typeof reroutes);
  });

  return null;
}

// ============================================================================
// 5. SHELL STABILITY VISUALIZATION
// ============================================================================

/**
 * Shell Stability Indicator
 * Smooth glow = stable, noisy jitter = congested
 */
export function ShellStability() {
  const satellites = useOrbitSim((s) => s.satellites);
  const state = useSimStore((s) => s.state);
  
  // Calculate congestion per shell
  const shellCongestion = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Group satellites by shell and calculate congestion
    const congestion = new Map<string, number>();
    
    satellites.forEach(sat => {
      const shell = sat.shell?.toString() || "unknown";
      const current = congestion.get(shell) || 0;
      congestion.set(shell, current + 1);
    });

    // Normalize congestion (0-1 scale)
    const maxSatellites = Math.max(...Array.from(congestion.values()), 1);
    congestion.forEach((count, shell) => {
      shellCongestion.current.set(shell, count / maxSatellites);
    });
  }, [satellites]);

  // Apply visual effects based on congestion
  // High congestion = noisy jitter, low = smooth glow
  return null;
}

// ============================================================================
// 6. STRATEGY IDENTITY MICRO-ANIMATION
// ============================================================================

/**
 * Strategy Micro-Effects
 * Each strategy gets subtle motion signature
 */
export function StrategyMicroEffects() {
  const config = useSimulationStore((s) => s.config);
  const strategy = config?.strategy || "BALANCED";

  // Strategy-specific effects would be applied to:
  // - Shell contraction (COST)
  // - Routing speed (LATENCY)
  // - Sun-facing glow (CARBON)
  // - Neutral (BALANCED)

  return null;
}

// ============================================================================
// MAIN VISUAL EFFECTS COMPONENT
// ============================================================================

export function VisualEffects() {
  return (
    <>
      <AnnualDeploymentPulse />
      <ComputeSurgePulse />
      <FailureBlink />
      <SunFacingBreathing />
      <CarbonWorldTint />
      <RoutingParticles />
      <RerouteWhiplash />
      <ShellStability />
      <StrategyMicroEffects />
    </>
  );
}

