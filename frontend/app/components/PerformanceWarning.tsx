"use client";

import { useState, useEffect } from "react";
import { useOrbitSim } from "../state/orbitStore";

/**
 * Performance warning overlay that appears when full visualization is disabled
 */
export function PerformanceWarning() {
  const satellites = useOrbitSim((s) => s.satellites);
  const [showWarning, setShowWarning] = useState(false);
  
  useEffect(() => {
    // Show warning if we have more than 150k satellites (must use representative mode)
    if (satellites.length > 150000) {
      setShowWarning(true);
    } else {
      setShowWarning(false);
    }
  }, [satellites.length]);
  
  if (!showWarning) return null;
  
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 panel-glass rounded-lg p-4 shadow-xl border border-yellow-500/50 bg-yellow-500/10 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="text-yellow-400 text-2xl">⚠️</div>
        <div>
          <div className="text-sm font-semibold text-yellow-300 mb-1">
            Full Satellite Visualization Disabled
          </div>
          <div className="text-xs text-yellow-200/80">
            Rendering 5% representative mode ({satellites.length.toLocaleString()} total satellites)
          </div>
        </div>
      </div>
    </div>
  );
}

