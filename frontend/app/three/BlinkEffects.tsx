"use client";

import { useEffect, useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

interface BlinkEvent {
  id: string;
  position: Vector3;
  type: "launch" | "failure";
  startTime: number;
  progress: number;
}

/**
 * Blink Effects Component
 * Handles:
 * 1. Launch Impact Blink: Flash at insertion point when launch completes
 * 2. Failure Blink: Bright white blink when satellite fails/retires
 */
export function BlinkEffects() {
  const [blinks, setBlinks] = useState<BlinkEvent[]>([]);
  const blinkIdCounter = useRef(0);

  useEffect(() => {
    // Listen for launch impact events
    const handleLaunchImpact = (e: CustomEvent) => {
      const { position, launchId } = e.detail;
      const blinkId = `launch-${launchId}-${blinkIdCounter.current++}`;
      
      setBlinks(prev => [...prev, {
        id: blinkId,
        position: new Vector3(position.x, position.y, position.z),
        type: "launch",
        startTime: Date.now(),
        progress: 0,
      }]);
    };

    // Listen for satellite failure events (if implemented)
    const handleSatelliteFailure = (e: CustomEvent) => {
      const { position, satelliteId } = e.detail;
      const blinkId = `failure-${satelliteId}-${blinkIdCounter.current++}`;
      
      setBlinks(prev => [...prev, {
        id: blinkId,
        position: new Vector3(position.x, position.y, position.z),
        type: "failure",
        startTime: Date.now(),
        progress: 0,
      }]);
    };

    window.addEventListener('launch-impact', handleLaunchImpact as EventListener);
    window.addEventListener('satellite-failure', handleSatelliteFailure as EventListener);

    return () => {
      window.removeEventListener('launch-impact', handleLaunchImpact as EventListener);
      window.removeEventListener('satellite-failure', handleSatelliteFailure as EventListener);
    };
  }, []);

  // Animate blinks
  useFrame((state, delta) => {
    setBlinks(prev => prev.map(blink => {
      const elapsed = Date.now() - blink.startTime;
      
      if (blink.type === "launch") {
        // Launch blink: 2-3 frame bright flash, then fade (200ms total)
        const duration = 200;
        const progress = Math.min(1, elapsed / duration);
        
        // Bright flash for first 50ms, then fade
        if (progress < 0.25) {
          return { ...blink, progress: progress * 4 }; // 0-1 in first 25%
        } else {
          return { ...blink, progress: 1.0 - ((progress - 0.25) / 0.75) }; // Fade from 1 to 0
        }
      } else {
        // Failure blink: 2-3 frame bright white blink, then rapid fade (300ms total)
        const duration = 300;
        const progress = Math.min(1, elapsed / duration);
        
        // Bright white flash for first 100ms, then rapid fade
        if (progress < 0.33) {
          return { ...blink, progress: progress * 3 }; // 0-1 in first 33%
        } else {
          return { ...blink, progress: 1.0 - ((progress - 0.33) / 0.67) }; // Fade from 1 to 0
        }
      }
    }).filter(blink => {
      const elapsed = Date.now() - blink.startTime;
      if (blink.type === "launch") {
        return elapsed < 200; // Remove after 200ms
      } else {
        return elapsed < 300; // Remove after 300ms
      }
    }));
  });

  // Render blinks as point lights or glowing spheres
  return (
    <>
      {blinks.map(blink => {
        const intensity = blink.progress;
        const color = blink.type === "launch" ? "#00ffff" : "#ffffff"; // Cyan for launch, white for failure
        
        return (
          <pointLight
            key={blink.id}
            position={[blink.position.x, blink.position.y, blink.position.z]}
            color={color}
            intensity={intensity * 5} // Bright flash
            distance={0.5}
            decay={2}
          />
        );
      })}
    </>
  );
}

