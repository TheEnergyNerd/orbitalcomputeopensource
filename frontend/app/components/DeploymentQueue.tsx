"use client";

import { useEffect } from "react";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";

export default function DeploymentQueue() {
  const { getQueuedUnits, getBuildingUnits, updateBuildProgress, deployUnit, totalRealWorldTimeDays } = useOrbitalUnitsStore();
  const queued = getQueuedUnits();
  const building = getBuildingUnits();

  // Update build progress every second
  useEffect(() => {
    const interval = setInterval(() => {
      updateBuildProgress();
      // Check if any building units are ready to deploy (5 seconds for all)
      building.forEach((unit) => {
        if (unit.buildStartTime) {
          const BUILD_TIME_MS = 5000; // 5 seconds for all deployments
          const elapsed = Date.now() - unit.buildStartTime;
          if (elapsed >= BUILD_TIME_MS && unit.status === "building") {
            deployUnit(unit.id);
          }
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [building, updateBuildProgress, deployUnit]);

  const formatTimeRemaining = (unit: { buildTimeDays: number; buildStartTime?: number }) => {
    if (!unit.buildStartTime) {
      // Display the original time (months/years) but note it's accelerated
      const days = unit.buildTimeDays;
      if (days >= 365) {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        if (months > 0) {
          return `${years}y ${months}mo (accelerated)`;
        }
        return `${years}y (accelerated)`;
      } else if (days >= 30) {
        const months = Math.floor(days / 30);
        return `${months}mo (accelerated)`;
      }
      return `${days}d (accelerated)`;
    }
    
    // All deployments take 5 seconds, but display original time
    const BUILD_TIME_MS = 5000; // 5 seconds
    const elapsed = Date.now() - unit.buildStartTime;
    const remaining = BUILD_TIME_MS - elapsed;
    
    if (remaining <= 0) return "Ready";
    
    // Display original build time as "remaining" (for realism)
    const days = unit.buildTimeDays;
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      if (months > 0) {
        return `${years}y ${months}mo remaining`;
      }
      return `${years}y remaining`;
    } else if (days >= 30) {
      const months = Math.floor(days / 30);
      const daysRem = Math.floor(days % 30);
      if (daysRem > 0) {
        return `${months}mo ${daysRem}d remaining`;
      }
      return `${months}mo remaining`;
    } else {
      return `${days}d remaining`;
    }
  };

  const formatTotalTime = (days: number) => {
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const months = Math.floor((days % 365) / 30);
      if (months > 0) {
        return `${years}y ${months}mo`;
      }
      return `${years}y`;
    } else if (days >= 30) {
      const months = Math.floor(days / 30);
      const daysRem = Math.floor(days % 30);
      if (daysRem > 0) {
        return `${months}mo ${daysRem}d`;
      }
      return `${months}mo`;
    }
    return `${Math.floor(days)}d`;
  };

  if (queued.length === 0 && building.length === 0 && totalRealWorldTimeDays === 0) return null;

  return (
    <div className="fixed top-[130px] left-6 sm:left-[340px] z-30 panel-glass rounded-lg p-2 sm:p-3 w-64 sm:w-72 max-w-[calc(100vw-12px)] shadow-lg border border-white/5 opacity-90">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Deployment Queue</h3>
      
      {totalRealWorldTimeDays > 0 && (
        <div className="mb-3 p-2 bg-accent-blue/5 border border-accent-blue/20 rounded text-xs">
          <div className="text-xs text-gray-500 mb-0.5">Total Real-World Time</div>
          <div className="text-xs font-medium text-accent-blue/80">{formatTotalTime(totalRealWorldTimeDays)}</div>
        </div>
      )}
      
      {/* Building Units */}
      {building.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1.5 font-medium">
            Building {building.length > 1 ? `(${building.length} in parallel)` : ""}
          </div>
          {building.map((unit) => (
            <div
              key={unit.id}
              className="mb-1.5 p-2 bg-accent-blue/10 border border-accent-blue/30 rounded text-xs"
            >
              <div className="text-xs font-medium text-gray-200 mb-0.5">{unit.name}</div>
              <div className="text-xs text-gray-500">
                {formatTimeRemaining(unit)}
                {building.length > 1 && (
                  <span className="text-accent-blue/70 ml-1 text-[10px]">(parallel)</span>
                )}
              </div>
              <div className="mt-1.5 h-0.5 bg-gray-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-blue transition-all"
                  style={{
                    width: unit.buildStartTime
                      ? `${Math.min(100, ((Date.now() - unit.buildStartTime) / 5000) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Queued Units */}
      {queued.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5 font-medium">Queued</div>
          {queued.map((unit) => (
            <div
              key={unit.id}
              className="mb-1.5 p-2 bg-gray-800/30 border border-gray-700/50 rounded text-xs"
            >
              <div className="text-xs font-medium text-gray-300 mb-0.5">{unit.name}</div>
              <div className="text-xs text-gray-500">
                Build time: {unit.buildTimeDays >= 365 
                  ? `${Math.floor(unit.buildTimeDays / 365)}y ${Math.floor((unit.buildTimeDays % 365) / 30)}mo`
                  : unit.buildTimeDays >= 30
                  ? `${Math.floor(unit.buildTimeDays / 30)}mo`
                  : `${unit.buildTimeDays}d`} (accelerated)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

