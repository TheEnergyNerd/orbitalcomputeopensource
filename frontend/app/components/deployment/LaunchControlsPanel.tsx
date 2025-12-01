"use client";

import { useState } from "react";
import { useSandboxStore } from "../../store/sandboxStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

export default function LaunchControlsPanel() {
  const { 
    simState, 
    launchThreshold, 
    setLaunchThreshold,
    fuelAvailableLaunches,
    launchSlotsThisMonth,
    podsPerLaunchCapacity,
    performLaunch,
  } = useSandboxStore();
  
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  const podsInWarehouse = Math.floor(simState.resources.pods?.buffer || 0);
  const maxPodsForLaunch = Math.min(launchThreshold, podsInWarehouse, podsPerLaunchCapacity);
  const canLaunch = podsInWarehouse >= launchThreshold && fuelAvailableLaunches > 0 && launchSlotsThisMonth > 0;
  
  const handleLaunch = async () => {
    setLaunchError(null);
    setIsLaunching(true);
    
    const result = performLaunch();
    
    if (!result.success) {
      setLaunchError(result.error || "Launch failed");
      setIsLaunching(false);
      return;
    }
    
    setIsLaunching(false);
    // Launch animation will be handled by parent component
  };

  return (
    <div className="space-y-4">
      {/* Card 1: Pods Ready */}
      <div className="panel" data-tutorial="pods-ready">
        <h3 className="text-sm font-semibold text-white mb-3">Pods Ready</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Pods in Warehouse:</span>
            <span className="text-white font-semibold">{formatDecimal(podsInWarehouse, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Launch Capacity:</span>
            <span className="text-white">{formatDecimal(podsPerLaunchCapacity, 0)} pods/launch</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Fuel Available:</span>
            <span className="text-white">{formatDecimal(fuelAvailableLaunches, 0)} launches</span>
          </div>
          
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-gray-400">Ready / Threshold</span>
              <span className={canLaunch ? "text-green-400" : "text-gray-400"}>
                {formatDecimal(podsInWarehouse, 0)} / {launchThreshold}
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  canLaunch ? "bg-cyan-500 animate-pulse" : "bg-gray-600"
                }`}
                style={{ width: `${Math.min(100, (podsInWarehouse / launchThreshold) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Launch Threshold */}
      <div className="panel" data-tutorial="launch-threshold">
        <h3 className="text-sm font-semibold text-white mb-3">Launch Threshold</h3>
        <div className="text-xs text-gray-400 mb-2">Launch when pods ≥</div>
        <div className="flex gap-2">
          <button
            onClick={() => setLaunchThreshold(5)}
            className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition ${
              launchThreshold === 5
                ? "bg-accent-blue text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            5 pods
          </button>
          <button
            onClick={() => setLaunchThreshold(10)}
            className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition ${
              launchThreshold === 10
                ? "bg-accent-blue text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            10 pods
          </button>
          <button
            onClick={() => setLaunchThreshold(podsPerLaunchCapacity)}
            className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition ${
              launchThreshold === podsPerLaunchCapacity
                ? "bg-accent-blue text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Max
          </button>
        </div>
        <div className="text-[10px] text-gray-500 mt-2">
          Current threshold: {launchThreshold} pods
        </div>
      </div>

      {/* Card 3: Launch Button */}
      <div className="panel">
        <button
          onClick={handleLaunch}
          disabled={!canLaunch || isLaunching}
          data-tutorial="launch-button"
          className={`w-full py-3 px-4 rounded-lg font-semibold text-sm transition ${
            canLaunch && !isLaunching
              ? "bg-accent-blue hover:bg-accent-blue/80 text-white"
              : "bg-gray-700 text-gray-400 cursor-not-allowed"
          } ${launchError ? "animate-shake" : ""}`}
        >
          {isLaunching
            ? "Launching..."
            : canLaunch
            ? `Launch ${formatDecimal(maxPodsForLaunch, 0)} Pods`
            : "Waiting for pods..."}
        </button>
        
        {launchError && (
          <div className="mt-2 text-xs text-red-400">{launchError}</div>
        )}
        
        <div className="mt-3 text-[10px] text-gray-400">
          Launch Slots Remaining this Month: {formatDecimal(launchSlotsThisMonth, 0)}
        </div>
      </div>
    </div>
  );
}

