"use client";

import { useEffect, useRef } from "react";
import { useSandboxStore } from "../../store/sandboxStore";

/**
 * LaunchGlobeEffects - Stubbed out (Cesium removed)
 * Launch animations are handled by LaunchAnimation.tsx (Three.js)
 */
export default function LaunchGlobeEffects() {
  const { lastLaunchMetrics } = useSandboxStore();
  const lastLaunchRef = useRef<any>(null);

  useEffect(() => {
    // Component disabled - Cesium removed, using Three.js LaunchAnimation instead
    if (lastLaunchMetrics && lastLaunchMetrics !== lastLaunchRef.current) {
      lastLaunchRef.current = lastLaunchMetrics;
    }
  }, [lastLaunchMetrics]);

  return null;
}
