"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * TopBar - Shows ORBITSCORE, mission name, breakpoint badge, timer
 */
export default function TopBar() {
  const { state } = useOrbitSimStore();
  
  const minutes = Math.floor(state.elapsedSeconds / 60);
  const seconds = Math.floor(state.elapsedSeconds % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-4 py-2">
      <div className="flex items-center justify-between max-w-[1400px] mx-auto">
        {/* Left: ORBITSCORE */}
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            ORBITSCORE: <span className="text-white">{state.orbitScore.toLocaleString()}</span>
          </div>
          
          {/* Breakpoint Badge */}
          {state.breakpointReached ? (
            <div className="px-3 py-1 bg-green-500/20 border border-green-500 rounded-full text-xs font-semibold text-green-400">
              ✓ Breakpoint @ {formatDecimal((state.breakpointAtOrbitShare || 0) * 100, 1)}% orbit
            </div>
          ) : (
            <div className="px-3 py-1 bg-gray-700 border border-gray-600 rounded-full text-xs text-gray-400">
              Not yet
            </div>
          )}
        </div>

        {/* Center: Mission Name */}
        <div className="text-lg font-semibold text-white">
          {state.currentMission.name}
        </div>

        {/* Right: Timer */}
        <div className="text-sm font-mono text-gray-300">
          {timeString}
        </div>
      </div>
    </div>
  );
}

