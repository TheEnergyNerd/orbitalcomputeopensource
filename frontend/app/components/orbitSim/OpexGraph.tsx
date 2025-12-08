"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * OpexGraph - Shows Ground vs Orbit OPEX curves + breakpoint line
 */
export default function OpexGraph() {
  const { state } = useOrbitSimStore();
  const { groundOpex, orbitOpex } = state.metrics;
  
  // Simple visualization - show current values as vertical markers
  // For MVP, we'll show bars. Can enhance with actual curves later.
  const maxOpex = Math.max(groundOpex, orbitOpex) * 1.2;
  const groundHeight = (groundOpex / maxOpex) * 100;
  const orbitHeight = (orbitOpex / maxOpex) * 100;
  
  const breakpointCrossed = orbitOpex < groundOpex;

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">OPEX Comparison</div>
      
      {/* Simple bar chart */}
      <div className="flex items-end gap-4 h-48">
        {/* Ground OPEX */}
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full bg-gray-700 rounded-t relative" style={{ height: '100%' }}>
            <div
              className="w-full bg-red-500 rounded-t transition-all duration-500"
              style={{ height: `${groundHeight}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-400">Ground</div>
          <div className="text-xs font-semibold text-red-400">
            {formatDecimal(groundOpex, 0)}
          </div>
        </div>
        
        {/* Orbit OPEX */}
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full bg-gray-700 rounded-t relative" style={{ height: '100%' }}>
            <div
              className={`w-full rounded-t transition-all duration-500 ${
                breakpointCrossed ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ height: `${orbitHeight}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-400">Orbit</div>
          <div className={`text-xs font-semibold ${
            breakpointCrossed ? 'text-green-400' : 'text-blue-400'
          }`}>
            {formatDecimal(orbitOpex, 0)}
          </div>
        </div>
      </div>
      
      {/* Breakpoint indicator */}
      {state.breakpointReached && (
        <div className="mt-3 px-3 py-2 bg-green-500/20 border border-green-500 rounded text-xs text-green-400">
          ✓ Breakpoint reached at {formatDecimal((state.breakpointAtOrbitShare || 0) * 100, 1)}% orbit share
        </div>
      )}
      
      {/* Delta */}
      <div className="mt-3 text-xs">
        <span className="text-gray-400">Delta: </span>
        <span className={`font-semibold ${
          breakpointCrossed ? 'text-green-400' : 'text-red-400'
        }`}>
          {breakpointCrossed ? '-' : '+'}
          {formatDecimal(Math.abs(groundOpex - orbitOpex), 0)} (
          {formatDecimal(((orbitOpex - groundOpex) / groundOpex) * 100, 1)}%)
        </span>
      </div>
    </div>
  );
}

