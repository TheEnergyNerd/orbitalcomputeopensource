"use client";

import { useEffect, useState, useRef } from "react";
import { useSandboxStore } from "../../store/sandboxStore";
import { getOrbitalComputeKw } from "../../lib/sim/orbitConfig";
import { formatDecimal } from "../../lib/utils/formatNumber";

interface LaunchEvent {
  id: number;
  podsLaunched: number;
  orbitalComputeAdded: number;
  timestamp: number;
}

export default function LaunchAnimation() {
  const { simState, lastLaunchMetrics } = useSandboxStore();
  const [launchEvents, setLaunchEvents] = useState<LaunchEvent[]>([]);
  const lastLaunchMetricsRef = useRef<any>(null);

  useEffect(() => {
    // Detect new launch
    if (lastLaunchMetrics && lastLaunchMetrics !== lastLaunchMetricsRef.current) {
      const podsLaunched = lastLaunchMetrics.podsLaunched;
      if (podsLaunched > 0 && simState) {
        // Calculate orbital compute added
        const orbitalComputeKw = getOrbitalComputeKw(
          podsLaunched,
          simState.orbitalPodSpec,
          simState.podDegradationFactor
        );
        const orbitalComputeMw = orbitalComputeKw / 1000;
        
        const newEvent: LaunchEvent = {
          id: Date.now(),
          podsLaunched,
          orbitalComputeAdded: orbitalComputeMw,
          timestamp: Date.now(),
        };
        
        setLaunchEvents((prev) => [...prev, newEvent]);
        
        // Remove event after animation completes (3 seconds)
        setTimeout(() => {
          setLaunchEvents((prev) => prev.filter((e) => e.id !== newEvent.id));
        }, 3000);
      }
      lastLaunchMetricsRef.current = lastLaunchMetrics;
    }
  }, [lastLaunchMetrics, simState]);

  if (launchEvents.length === 0) return null;

  return (
    <>
      {launchEvents.map((event) => {
        const age = Date.now() - event.timestamp;
        const opacity = Math.max(0, 1 - age / 3000); // Fade out over 3 seconds
        const scale = 1 + (age < 500 ? (age / 500) * 0.2 : 0.2 - ((age - 500) / 2500) * 0.2); // Scale up then down
        
        return (
          <div
            key={event.id}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
            style={{
              opacity,
              transform: `translate(-50%, -50%) scale(${scale})`,
              transition: "opacity 0.1s, transform 0.1s",
            }}
          >
            <div className="bg-gradient-to-r from-cyan-500/90 to-blue-500/90 text-white px-6 py-3 rounded-lg shadow-2xl border-2 border-cyan-400/50 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-lg font-bold mb-1">
                  🚀 Launched {formatDecimal(event.podsLaunched, 0)} pods
                </div>
                <div className="text-sm text-cyan-100">
                  → +{formatDecimal(event.orbitalComputeAdded, 1)} MW orbital compute
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

