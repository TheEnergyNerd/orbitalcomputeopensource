"use client";

import React, { useRef, useEffect, useMemo } from 'react';
import Globe from 'react-globe.gl';

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

export default function SimpleGlobe({
  launchSites,
  activeLaunches,
  orbitalRingVisible,
}: SimpleGlobeProps) {
  const globeRef = useRef<any>();

  // Convert launch sites to points
  const launchSitePoints = useMemo(() => 
    launchSites.map(site => ({
      lat: site.lat,
      lng: site.lon,
      size: 0.5,
      color: '#ff6b35',
    }))
  , [launchSites]);

  // Convert active launches to arcs
  const launchArcs = useMemo(() => 
    activeLaunches.map(launch => {
      // Create curved arc from start to target
      const numPoints = 20;
      const points: Array<{ lat: number; lng: number; altitude: number }> = [];
      
      for (let i = 0; i <= numPoints; i++) {
        const t = (i / numPoints) * launch.progress;
        // Simple curve: start at ground, peak at midpoint, end at orbit
        const lat = launch.startLat + (launch.targetLat - launch.startLat) * t;
        const lng = launch.startLng + (launch.targetLng - launch.startLng) * t;
        // Altitude: 0 at start, peak at middle, 550km at end
        const altitude = t < 0.5 
          ? (t / 0.5) * 275000 // Climb to 275km
          : 275000 + ((t - 0.5) / 0.5) * 275000; // Continue to 550km
        
        points.push({ lat, lng, altitude: altitude / 6371 }); // Normalize by Earth radius
      }
      
      return {
        startLat: launch.startLat,
        startLng: launch.startLng,
        startAltitude: 0,
        endLat: launch.targetLat,
        endLng: launch.targetLng,
        endAltitude: 550 / 6371, // 550km normalized
        points,
        color: '#00ffff',
      };
    })
  , [activeLaunches]);

  // Orbital ring points
  const orbitalRingPoints = useMemo(() => {
    if (!orbitalRingVisible) return [];
    const points: Array<{ lat: number; lng: number; altitude: number }> = [];
    const numPoints = 256;
    for (let i = 0; i <= numPoints; i++) {
      const lng = (i / numPoints) * 360;
      points.push({
        lat: 0, // Equator
        lng,
        altitude: 550 / 6371, // 550km normalized
      });
    }
    return points;
  }, [orbitalRingVisible]);

  useEffect(() => {
    if (globeRef.current) {
      // Set initial camera position
      globeRef.current.camera().position.set(0, 0, 2.5);
      globeRef.current.camera().lookAt(0, 0, 0);
    }
  }, []);

  return (
    <div className="w-full h-full">
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        pointsData={launchSitePoints}
        pointColor="color"
        pointRadius="size"
        pointLabel="id"
        arcsData={launchArcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={1000}
        arcStroke={2}
        ringsData={orbitalRingVisible ? [{ lat: 0, lng: 0, maxRadius: 550 / 6371, color: '#10b981' }] : []}
        ringMaxRadius="maxRadius"
        ringColor="color"
        ringPropagationSpeed={0}
        enablePointerInteraction={false}
      />
    </div>
  );
}




