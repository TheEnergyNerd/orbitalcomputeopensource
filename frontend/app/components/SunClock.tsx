"use client";

import { useSimStore } from "../store/simStore";
import { useEffect, useState } from "react";

export default function SunClock({ appMode = "simulator" }: { appMode?: "simulator" | "sandbox" }) {
  const state = useSimStore((s) => s.state);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [sunlitCount, setSunlitCount] = useState(0);
  const [shadowCount, setShadowCount] = useState(0);

  // Update clock - real time for simulator, accelerated for sandbox
  useEffect(() => {
    if (appMode === "simulator") {
      // Real time (no acceleration) for current state mode
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000); // Update every second
      return () => clearInterval(interval);
    } else {
      // Accelerated time (10x speed) for sandbox
      const ACCELERATION = 10;
      let lastUpdate = Date.now();
      let acceleratedTime = new Date();
      
      const interval = setInterval(() => {
        const now = Date.now();
        const realElapsed = now - lastUpdate;
        const acceleratedElapsed = realElapsed * ACCELERATION;
        acceleratedTime = new Date(acceleratedTime.getTime() + acceleratedElapsed);
        setCurrentTime(acceleratedTime);
        lastUpdate = now;
      }, 100);
      return () => clearInterval(interval);
    }
  }, [appMode]);

  // Calculate sunlit statistics
  useEffect(() => {
    if (state?.satellites) {
      const sunlit = state.satellites.filter((sat) => sat.sunlit).length;
      const shadow = state.satellites.length - sunlit;
      setSunlitCount(sunlit);
      setShadowCount(shadow);
    }
  }, [state]);

  // Parse time from state or use current time
  // In simulator mode, always use real current time (no state.time acceleration)
  const displayTime = appMode === "simulator" 
    ? currentTime  // Always real time in simulator mode
    : (state?.time ? new Date(state.time) : currentTime);

  // Format time - show seconds for simulator mode, minutes only for sandbox
  const timeString = appMode === "simulator"
    ? displayTime.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC'
      })
    : displayTime.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      });

  const dateString = displayTime.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });

  // Calculate sun position (simplified - sun is always at local noon at 0° longitude)
  // In reality, we'd calculate this from the actual sun position
  const sunlitPercent = state?.satellites?.length 
    ? (sunlitCount / state.satellites.length) * 100 
    : 0;

  return (
    <div className="fixed top-6 right-6 z-30 panel-glass rounded-xl p-3 sm:p-5 shadow-2xl border border-white/10 w-64 sm:min-w-[280px] max-w-[calc(100vw-12px)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-accent-blue">Sun Clock</h3>
        <div className="text-2xl">☀️</div>
      </div>

      {/* Time Display */}
      <div className="mb-4 pb-4 border-b border-gray-700/50">
        <div className="text-3xl font-bold text-white font-mono mb-1">
          {timeString}
        </div>
        <div className="text-sm text-gray-400 font-mono">
          {dateString} UTC
        </div>
      </div>

      {/* Sunlit Statistics */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-400">Sunlit Satellites</span>
            <span className="text-lg font-bold text-accent-blue font-mono">
              {sunlitCount.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${sunlitPercent}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-400">In Shadow</span>
            <span className="text-lg font-bold text-cyan-400 font-mono">
              {shadowCount.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${100 - sunlitPercent}%` }}
            />
          </div>
        </div>

        <div className="pt-2 text-xs text-gray-500">
          {sunlitPercent.toFixed(1)}% of satellites in sunlight
        </div>
      </div>

      {/* Rendering Performance Indicator (Sandbox Mode Only) */}
      {appMode === "sandbox" && state?.satellites && (
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400">Rendered Satellites</span>
            <span className="text-xs font-semibold text-gray-300 font-mono">
              {Math.ceil(state.satellites.length / 10).toLocaleString()} / {state.satellites.length.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div 
              className="bg-gradient-to-r from-purple-500 to-purple-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(Math.ceil(state.satellites.length / 10) / state.satellites.length) * 100}%` }}
            />
          </div>
          <div className="pt-1 text-xs text-gray-500">
            Showing 1/10th for performance
          </div>
        </div>
      )}

      {/* Sun Position Indicator */}
      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <div className="text-xs text-gray-400 mb-2">Sun Position</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-sm text-gray-300">
            {displayTime.getUTCHours() >= 6 && displayTime.getUTCHours() < 18 
              ? "Daytime (Sun Visible)" 
              : "Nighttime (Sun Below Horizon)"}
          </span>
        </div>
      </div>
    </div>
  );
}

