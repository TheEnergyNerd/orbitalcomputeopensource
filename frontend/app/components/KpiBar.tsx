"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { calculateMetrics } from "../lib/metrics/calculateMetrics";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";

export default function KpiBar() {
  const {
    orbitMode,
    factory,
    launchState,
  } = useSandboxStore();
  const state = useSimStore((s) => s.state);

  // Calculate metrics - use new sim state if available, fallback to old factory
  const simState = useSandboxStore((s) => s.simState);
  const orbitPods = simState 
    ? Math.floor(simState.resources.launches?.buffer ?? 0)
    : Math.floor(factory.inventory.orbitPods ?? 0); // Pods must be whole numbers
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
    <div className="fixed bottom-[220px] left-0 right-0 z-25 bg-gray-900/95 border-t border-gray-700/50 px-4 py-2" style={{ marginLeft: '280px' }}>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Latency</span>
          <span className="text-white font-semibold">{formatDecimal(metrics.latency, 1)} ms</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Energy Cost</span>
          <span className="text-white font-semibold">{formatSigFigs(metrics.energyCost)}M $/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Cooling</span>
          <span className="text-white font-semibold">{formatSigFigs(metrics.coolingCost)}M $/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Carbon</span>
          <span className="text-white font-semibold">{formatSigFigs(metrics.carbon)}k t/yr</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Resilience</span>
          <span className="text-white font-semibold">{formatDecimal(metrics.resilienceScore, 0)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Coverage</span>
          <span className="text-white font-semibold">{formatDecimal(orbitShare, 1)}%</span>
        </div>
        <div className="text-gray-600">|</div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">Orbital Share</span>
          <span className="text-white font-semibold">{formatDecimal(orbitShare, 1)}%</span>
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
