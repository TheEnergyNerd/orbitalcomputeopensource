"use client";

import { useSandboxStore } from "../store/sandboxStore";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getOrbitHybridEnergyCostPerYear,
} from "../lib/sim/orbitConfig";
import { formatDecimal } from "../lib/utils/formatNumber";

export default function SimpleMetrics() {
  const simState = useSandboxStore((s) => s.simState);

  if (!simState) return null;

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;

  // Calculate current metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) : 0;

  const currentEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );

  // Baseline (ground-only)
  const baselineEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );

  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Calculate deltas
  const latencyDelta = currentLatency - baselineLatency;
  const energyDelta = currentEnergyCost - baselineEnergyCost;
  const carbonDelta = currentCo2 - baselineCo2;
  const resilienceDelta = orbitalShare * 60; // Simplified

  const metrics = [
    {
      title: "LATENCY",
      ground: baselineLatency,
      mix: currentLatency,
      delta: latencyDelta,
      unit: "ms",
      lowerIsBetter: true,
    },
    {
      title: "ENERGY COST",
      ground: baselineEnergyCost,
      mix: currentEnergyCost,
      delta: energyDelta,
      unit: "$/yr",
      lowerIsBetter: true,
    },
    {
      title: "CARBON",
      ground: baselineCo2,
      mix: currentCo2,
      delta: carbonDelta,
      unit: "t/yr",
      lowerIsBetter: true,
    },
    {
      title: "RESILIENCE",
      ground: 40,
      mix: 40 + resilienceDelta,
      delta: resilienceDelta,
      unit: "%",
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((metric) => {
          const isBetter = metric.lowerIsBetter ? metric.delta < 0 : metric.delta > 0;
          const deltaColor = isBetter ? "text-green-400" : metric.delta === 0 ? "text-gray-400" : "text-red-400";
          const deltaPct = metric.ground > 0 ? (metric.delta / metric.ground) * 100 : 0;

          return (
            <div key={metric.title} className="panel border border-gray-700 p-3" style={{ width: "200px" }}>
              <div className="text-xs font-semibold text-gray-300 mb-2">{metric.title}</div>
              <div className="text-xs text-gray-400 mb-1">Ground: {formatDecimal(metric.ground, 1)} {metric.unit}</div>
              <div className="text-xs text-white mb-1">Orbit Mix: {formatDecimal(metric.mix, 1)} {metric.unit}</div>
              <div className={`text-xs ${deltaColor} mt-2`}>
                Delta: {metric.delta >= 0 ? '+' : ''}{formatDecimal(metric.delta, 1)} {metric.unit} ({deltaPct >= 0 ? '+' : ''}{formatDecimal(deltaPct, 1)}% {isBetter ? 'better' : 'worse'})
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

