"use client";

import { useState, useEffect } from "react";
import { useSimStore } from "../store/simStore";
import * as Cesium from "cesium";

interface LatencyProbeHUDProps {
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>;
}

export default function LatencyProbeHUD({ viewerRef }: LatencyProbeHUDProps) {
  const [probeData, setProbeData] = useState<{
    lat: number;
    lon: number;
    groundLatency: number;
    orbitLatency: number;
    hybridLatency: number;
  } | null>(null);
  const state = useSimStore((s) => s.state);

  useEffect(() => {
    if (!viewerRef.current || !state) return;

    const viewer = viewerRef.current;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const calculateLatencies = (lat: number, lon: number) => {
      // Find nearest ground site
      let nearestGround = state.groundSites[0];
      let minGroundDist = Infinity;
      for (const site of state.groundSites) {
        const dist = Math.sqrt(
          Math.pow(lat - site.lat, 2) + Math.pow(lon - site.lon, 2)
        );
        if (dist < minGroundDist) {
          minGroundDist = dist;
          nearestGround = site;
        }
      }
      const groundLatency = 45 + minGroundDist * 0.5; // Base + distance penalty

      // Find nearest orbital route
      let nearestOrbit = state.satellites[0];
      let minOrbitDist = Infinity;
      for (const sat of state.satellites.slice(0, 100)) {
        // Limit search for performance
        const dist = Math.sqrt(
          Math.pow(lat - sat.lat, 2) + Math.pow(lon - sat.lon, 2)
        );
        if (dist < minOrbitDist) {
          minOrbitDist = dist;
          nearestOrbit = sat;
        }
      }
      // Orbit latency = satellite latency + gateway latency + distance
      const orbitLatency = nearestOrbit.latencyMs + 5 + minOrbitDist * 0.3;

      // Hybrid (weighted average based on orbit share)
      const orbitShare = state.metrics.orbitSharePercent / 100;
      const hybridLatency = groundLatency * (1 - orbitShare) + orbitLatency * orbitShare;

      return {
        lat,
        lon,
        groundLatency: Math.round(groundLatency),
        orbitLatency: Math.round(orbitLatency),
        hybridLatency: Math.round(hybridLatency),
      };
    };

    // Throttle updates to 5-10 per second
    let lastUpdate = 0;
    const throttleMs = 100;

    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: any) => {
      const now = Date.now();
      if (now - lastUpdate < throttleMs) return;
      lastUpdate = now;

      const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);

        const data = calculateLatencies(lat, lon);
        setProbeData(data);
      } else {
        setProbeData(null);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      if (handler) {
        handler.destroy();
      }
    };
  }, [viewerRef, state]);

  if (!probeData) return null;

  return (
    <div
      className="fixed z-50 panel-glass rounded-lg p-3 shadow-xl border border-accent-blue/50 pointer-events-none"
      style={{
        left: `${probeData.lon > 0 ? '20px' : 'auto'}`,
        right: `${probeData.lon <= 0 ? '20px' : 'auto'}`,
        top: '50%',
        transform: 'translateY(-50%)',
      }}
    >
      <div className="text-xs text-gray-400 mb-2 font-semibold">Latency Probe</div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-300">Ground:</span>
          <span className="text-accent-orange font-semibold">{probeData.groundLatency} ms</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-300">Orbit:</span>
          <span className="text-accent-blue font-semibold">{probeData.orbitLatency} ms</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-gray-700/50">
          <span className="text-gray-200 font-semibold">Hybrid:</span>
          <span className="text-accent-green font-bold">{probeData.hybridLatency} ms</span>
        </div>
      </div>
    </div>
  );
}

