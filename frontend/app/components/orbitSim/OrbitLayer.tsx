"use client";

import React from "react";

interface LaunchSite {
  id: string;
  lat: number;
  lon: number;
  name: string;
}

interface OrbitLayerProps {
  launchSites: LaunchSite[];
  newPodsThisStep: number;
  orbitalShare: number;
  prevOrbitalShare?: number;
}

/**
 * OrbitLayer - Stubbed out (Cesium removed)
 * Launch animations are handled by LaunchAnimation.tsx (Three.js)
 */
export default function OrbitLayer({
  launchSites,
  newPodsThisStep,
  orbitalShare,
  prevOrbitalShare = 0,
}: OrbitLayerProps) {
  // Component disabled - Cesium removed, using Three.js OrbitalScene instead
  return null;
}
