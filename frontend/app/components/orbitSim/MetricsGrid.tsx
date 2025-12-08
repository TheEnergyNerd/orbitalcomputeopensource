"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * MetricsGrid - 2x2 cards showing Cost per Compute, OPEX Delta, Latency Delta, Carbon Delta
 */
export default function MetricsGrid() {
  const { state } = useOrbitSimStore();
  const { metrics } = state;
  
  const costDelta = metrics.orbitCostPerCompute - metrics.groundCostPerCompute;
  const costDeltaPct = (costDelta / metrics.groundCostPerCompute) * 100;
  
  const opexDelta = metrics.orbitOpex - metrics.groundOpex;
  const opexDeltaPct = (opexDelta / metrics.groundOpex) * 100;
  
  const latencyDelta = metrics.orbitLatency - metrics.groundLatency;
  
  const carbonDelta = metrics.orbitCarbon - metrics.groundCarbon;
  const carbonDeltaPct = (carbonDelta / metrics.groundCarbon) * 100;

  const cards = [
    {
      title: "Cost per Compute",
      ground: `$${formatDecimal(metrics.groundCostPerCompute, 0)}`,
      orbit: `$${formatDecimal(metrics.orbitCostPerCompute, 0)}`,
      delta: costDeltaPct,
      deltaLabel: `${costDeltaPct >= 0 ? '+' : ''}${formatDecimal(costDeltaPct, 1)}%`,
      better: costDeltaPct < 0,
    },
    {
      title: "OPEX Delta",
      ground: `$${formatDecimal(metrics.groundOpex, 0)}`,
      orbit: `$${formatDecimal(metrics.orbitOpex, 0)}`,
      delta: opexDeltaPct,
      deltaLabel: `${opexDeltaPct >= 0 ? '+' : ''}${formatDecimal(opexDeltaPct, 1)}%`,
      better: opexDeltaPct < 0,
    },
    {
      title: "Latency Delta",
      ground: `${formatDecimal(metrics.groundLatency, 1)} ms`,
      orbit: `${formatDecimal(metrics.orbitLatency, 1)} ms`,
      delta: latencyDelta,
      deltaLabel: `${latencyDelta >= 0 ? '+' : ''}${formatDecimal(latencyDelta, 1)} ms`,
      better: latencyDelta < 0,
    },
    {
      title: "Carbon Delta",
      ground: `${formatDecimal(metrics.groundCarbon, 0)}`,
      orbit: `${formatDecimal(metrics.orbitCarbon, 0)}`,
      delta: carbonDeltaPct,
      deltaLabel: `${carbonDeltaPct >= 0 ? '+' : ''}${formatDecimal(carbonDeltaPct, 1)}%`,
      better: carbonDeltaPct < 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3"
        >
          <div className="text-xs font-semibold text-gray-300 mb-2">{card.title}</div>
          <div className="text-xs text-gray-400 mb-1">
            Ground: <span className="text-white">{card.ground}</span>
          </div>
          <div className="text-xs text-gray-400 mb-2">
            Orbit: <span className="text-white">{card.orbit}</span>
          </div>
          <div
            className={`text-xs font-medium ${
              Math.abs(card.delta) < 0.1
                ? 'text-gray-500'
                : card.better
                ? 'text-green-400'
                : 'text-red-400'
            }`}
          >
            Delta: {card.deltaLabel}
          </div>
        </div>
      ))}
    </div>
  );
}

