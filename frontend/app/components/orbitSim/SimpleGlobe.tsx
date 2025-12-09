"use client";

import React from 'react';

interface LaunchSite {
  id: string;
  lat: number;
  lon: number;
}

interface Launch {
  id: string;
  startLat: number;
  startLng: number;
  targetLat: number;
  targetLng: number;
  progress: number; // 0-1
}

interface SimpleGlobeProps {
  launchSites: LaunchSite[];
  activeLaunches: Launch[];
  orbitalRingVisible: boolean;
}

// Component disabled - react-globe.gl package not installed
export default function SimpleGlobe({
  launchSites,
  activeLaunches,
  orbitalRingVisible,
}: SimpleGlobeProps) {
  return null;
}
