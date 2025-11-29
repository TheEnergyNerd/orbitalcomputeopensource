"use client";

import { useSimStore } from "../store/simStore";
import { useSandboxStore } from "../store/sandboxStore";
import { useEffect, useState } from "react";
import { formatSigFigs } from "../lib/utils/formatNumber";

export default function SunClockSimplified() {
  const state = useSimStore((s) => s.state);
  const { simState } = useSandboxStore();
  const [sunlitPercent, setSunlitPercent] = useState(0);

  // Calculate sunlit statistics
  useEffect(() => {
    if (state?.satellites) {
      const sunlit = state.satellites.filter((sat) => sat.sunlit).length;
      const total = state.satellites.length;
      setSunlitPercent(total > 0 ? (sunlit / total) * 100 : 0);
    }
  }, [state]);

  // Get orbital capacity from sim state
  const podsInOrbit = simState?.resources.launches?.buffer ?? 0;
  const orbitalCapacityMW = podsInOrbit * 0.15; // 150kW per pod
  const BASE_GROUND_CAPACITY_MW = 42000;
  const totalCapacity = orbitalCapacityMW + BASE_GROUND_CAPACITY_MW;
  const orbitalShare = totalCapacity > 0 ? (orbitalCapacityMW / totalCapacity) * 100 : 0;

  // Get deployment rate
  const deploymentRate = simState?.resources.launches?.prodPerMin ?? 0;

  return (
    <div className="fixed top-[70px] right-6 w-64 z-40 panel-glass rounded-xl p-4 shadow-2xl border border-white/10">
      <div className="text-xs font-semibold text-gray-300 mb-3 uppercase">Sun Clock</div>
      
      <div className="space-y-3">
        {/* Sunlit percentage */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-gray-400">Satellites in Sunlight</span>
            <span className="text-white font-semibold">{formatSigFigs(sunlitPercent)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all"
              style={{ width: `${sunlitPercent}%` }}
            />
          </div>
        </div>

        {/* Pods in orbit */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-gray-400">Pods in Orbit</span>
            <span className="text-white font-semibold">{Math.floor(podsInOrbit)}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-accent-blue h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, (orbitalShare / 100) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {formatSigFigs(orbitalShare)}% of capacity
          </div>
        </div>

        {/* Deployment rate */}
        <div className="pt-2 border-t border-gray-700/50">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Deployment Rate:</span>
            <span className="text-white font-semibold">
              {formatSigFigs(deploymentRate * 60 * 24 * 30)} pods/mo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

