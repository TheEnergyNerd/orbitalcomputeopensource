"use client";

import type { DebugStateEntry } from "../../lib/orbitSim/debugState";

interface DebugPanelProps {
  currentState: DebugStateEntry | undefined;
  currentYear: number;
}

export default function DebugPanel({ currentState, currentYear }: DebugPanelProps) {
  if (!currentState) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <p className="text-gray-400">No debug data available for year {currentYear}</p>
      </div>
    );
  }
  
  const isFailureExceedingReplacement = currentState.satellitesFailed > currentState.satellitesRecovered;
  const isHeatLimited = currentState.heatCeiling < currentState.compute_raw_flops;
  const isLaunchLimited = currentState.launchMassCeiling < currentState.satellitesAdded;
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-bold mb-4">Debug Panel - Year {currentYear}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Dominant Constraint */}
        <div className={`p-3 rounded ${
          currentState.dominantConstraint === "LAUNCH" ? "bg-yellow-900/30 border border-yellow-500" :
          currentState.dominantConstraint === "HEAT" ? "bg-orange-900/30 border border-orange-500" :
          currentState.dominantConstraint === "BACKHAUL" ? "bg-blue-900/30 border border-blue-500" :
          currentState.dominantConstraint === "AUTONOMY" ? "bg-red-900/30 border border-red-500" :
          "bg-gray-700"
        }`}>
          <div className="text-xs text-gray-400 mb-1">Dominant Constraint</div>
          <div className="text-lg font-semibold">{currentState.dominantConstraint || "NONE"}</div>
        </div>
        
        {/* Ceilings */}
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Launch Mass Ceiling</div>
          <div className="text-lg font-semibold">{currentState.launchMassCeiling.toLocaleString()}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Heat Ceiling (PFLOPs)</div>
          <div className="text-lg font-semibold">{(currentState.heatCeiling / 1e15).toFixed(2)}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Autonomy Ceiling</div>
          <div className="text-lg font-semibold">{currentState.autonomyCeiling.toLocaleString()}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Backhaul Ceiling (PFLOPs)</div>
          <div className="text-lg font-semibold">{(currentState.backhaulCeiling / 1e15).toFixed(2)}</div>
        </div>
        
        {/* Compute Metrics */}
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Compute Effective (PFLOPs)</div>
          <div className="text-lg font-semibold">{(currentState.compute_effective_flops / 1e15).toFixed(2)}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Compute Raw (PFLOPs)</div>
          <div className="text-lg font-semibold">{(currentState.compute_raw_flops / 1e15).toFixed(2)}</div>
        </div>
        
        {/* Utilization */}
        <div className={`p-3 rounded ${
          currentState.utilization_overall >= 0.7 ? "bg-green-900/30 border border-green-500" :
          currentState.utilization_overall >= 0.4 ? "bg-yellow-900/30 border border-yellow-500" :
          "bg-red-900/30 border border-red-500"
        }`}>
          <div className="text-xs text-gray-400 mb-1">Utilization Overall</div>
          <div className="text-lg font-semibold">{(currentState.utilization_overall * 100).toFixed(1)}%</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Utilization Heat</div>
          <div className="text-lg font-semibold">{(currentState.utilization_heat * 100).toFixed(1)}%</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Utilization Backhaul</div>
          <div className="text-lg font-semibold">{(currentState.utilization_backhaul * 100).toFixed(1)}%</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Utilization Autonomy</div>
          <div className="text-lg font-semibold">{(currentState.utilization_autonomy * 100).toFixed(1)}%</div>
        </div>
        
        {/* Failures and Recoveries */}
        <div className={`p-3 rounded ${
          isFailureExceedingReplacement ? "bg-red-900/30 border border-red-500" : "bg-gray-700"
        }`}>
          <div className="text-xs text-gray-400 mb-1">Failures This Year</div>
          <div className="text-lg font-semibold">{currentState.satellitesFailed}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Recoveries This Year</div>
          <div className="text-lg font-semibold">{currentState.satellitesRecovered}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Satellites Added</div>
          <div className="text-lg font-semibold">{currentState.satellitesAdded}</div>
        </div>
        
        <div className="p-3 rounded bg-gray-700">
          <div className="text-xs text-gray-400 mb-1">Satellites Total</div>
          <div className="text-lg font-semibold">{currentState.satellitesTotal.toLocaleString()}</div>
        </div>
      </div>
      
      {/* Status Indicators */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex flex-wrap gap-2">
          {isFailureExceedingReplacement && (
            <span className="px-3 py-1 bg-red-900/50 text-red-200 rounded text-sm font-semibold">
              ⚠️ Failures &gt; Replacements
            </span>
          )}
          {isHeatLimited && (
            <span className="px-3 py-1 bg-orange-900/50 text-orange-200 rounded text-sm font-semibold">
              ⚠️ Heat Limited
            </span>
          )}
          {isLaunchLimited && (
            <span className="px-3 py-1 bg-yellow-900/50 text-yellow-200 rounded text-sm font-semibold">
              ⚠️ Launch Limited
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

