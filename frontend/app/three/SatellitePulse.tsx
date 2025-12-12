"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useSimStore } from "../store/simStore";
import { InstancedMesh } from "three";

/**
 * Satellite Pulse Animation
 * Pulses satellite scale when clicked
 */
export function SatellitePulse() {
  const selectedEntity = useSimStore((s) => s.selectedEntity);
  const pulseRef = useRef<{ id: string; progress: number; scale: number } | null>(null);
  
  useFrame((state, delta) => {
    if (pulseRef.current) {
      pulseRef.current.progress += delta * 3; // 3x speed
      
      if (pulseRef.current.progress >= 1.0) {
        pulseRef.current = null;
      } else {
        // Pulse: 1.0 → 1.2 → 1.0 over 300ms
        const t = pulseRef.current.progress;
        pulseRef.current.scale = 1.0 + 0.2 * Math.sin(t * Math.PI);
      }
    }
  });
  
  useEffect(() => {
    if (selectedEntity?.type === "satellite") {
      pulseRef.current = {
        id: selectedEntity.id,
        progress: 0,
        scale: 1.0
      };
    }
  }, [selectedEntity]);
  
  // This component doesn't render anything - it just tracks pulse state
  // The actual scaling is applied in SatellitesGPUInstanced
  return null;
}

// Export pulse state getter for use in SatellitesGPUInstanced
let currentPulse: { id: string; scale: number } | null = null;

export function getPulseScale(satelliteId: string): number {
  if (currentPulse && currentPulse.id === satelliteId) {
    return currentPulse.scale;
  }
  return 1.0;
}

export function updatePulseState(pulse: { id: string; scale: number } | null) {
  currentPulse = pulse;
}

