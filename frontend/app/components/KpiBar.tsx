"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { calculateMetrics } from "../lib/metrics/calculateMetrics";

export default function KpiBar() {
  const {
    orbitMode,
    factory,
  } = useSandboxStore();
  const state = useSimStore((s) => s.state);

  // Calculate metrics
  const orbitPods = factory.inventory.orbitPods ?? 0;
  const orbitalCapacityMW = orbitPods * 0.15; // 150kW per pod
  const BASE_GROUND_CAPACITY_GW = 42;
  const baseGroundCapacityMW = BASE_GROUND_CAPACITY_GW * 1000;
  const totalCapacity = orbitalCapacityMW + baseGroundCapacityMW;
  const orbitShare = totalCapacity > 0 ? (orbitalCapacityMW / totalCapacity) * 100 : 0;

  const metrics = calculateMetrics({
    deployedOrbitalCapacity: orbitalCapacityMW,
    remainingGroundCapacity: baseGroundCapacityMW,
    baseGroundCapacity: baseGroundCapacityMW,
    isSurgeActive: false,
    podTier: "tier1",
    orbitMode,
    offloadPct: orbitShare,
    densityMode: "Safe",
    cumulativeDeployedUnits: orbitPods,
    orbitalDensity: orbitPods * 50,
  });

  const queueLength = factory.inventory.pods ?? 0;
  const maxQueue = launchState?.maxQueue ?? 5;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-gray-900/95 border-t border-gray-700/50 px-4 py-2">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Latency</span>
          <span className="text-white font-semibold">{metrics.latency.toFixed(1)} ms</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Energy Cost</span>
          <span className="text-white font-semibold">{metrics.energyCost.toFixed(1)}M $/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Cooling</span>
          <span className="text-white font-semibold">{metrics.coolingCost.toFixed(1)}M $/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Carbon</span>
          <span className="text-white font-semibold">{metrics.carbon.toFixed(1)}k t/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Resilience</span>
          <span className="text-white font-semibold">{metrics.resilienceScore.toFixed(0)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Coverage</span>
          <span className="text-white font-semibold">{orbitShare.toFixed(1)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Orbital Share</span>
          <span className="text-white font-semibold">{orbitShare.toFixed(1)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Queue</span>
          <span className="text-white font-semibold">{queueLength}/{maxQueue}</span>
        </div>
      </div>
    </div>
  );
}
