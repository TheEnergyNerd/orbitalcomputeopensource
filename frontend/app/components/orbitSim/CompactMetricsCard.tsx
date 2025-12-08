"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * CompactMetricsCard - Single 2x2 card showing all key metrics
 */
export default function CompactMetricsCard() {
  const { state } = useOrbitSimStore();
  const { metrics } = state;
  
  const costDelta = (metrics.orbitCostPerCompute - metrics.groundCostPerCompute) / metrics.groundCostPerCompute;
  const opexDelta = (metrics.orbitOpex - metrics.groundOpex) / metrics.groundOpex;
  const latencyDeltaMs = metrics.orbitLatency - metrics.groundLatency;
  const carbonDelta = (metrics.orbitCarbon - metrics.groundCarbon) / metrics.groundCarbon;

  const formatCurrency = (value: number) => {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
  };

  const formatCarbon = (value: number) => {
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
    return `${value.toFixed(0)}`;
  };

  const quadrants = [
    {
      title: "Cost per Compute",
      ground: formatCurrency(metrics.groundCostPerCompute),
      mix: formatCurrency(metrics.orbitCostPerCompute),
      delta: costDelta,
      deltaLabel: `${costDelta >= 0 ? '+' : ''}${formatDecimal(costDelta * 100, 1)}%`,
      better: costDelta < 0,
    },
    {
      title: "Annual OPEX",
      ground: formatCurrency(metrics.groundOpex),
      mix: formatCurrency(metrics.orbitOpex),
      delta: opexDelta,
      deltaLabel: `${opexDelta >= 0 ? '+' : ''}${formatDecimal(opexDelta * 100, 1)}%`,
      better: opexDelta < 0,
    },
    {
      title: "Latency",
      ground: `${formatDecimal(metrics.groundLatency, 1)} ms`,
      mix: `${formatDecimal(metrics.orbitLatency, 1)} ms`,
      delta: latencyDeltaMs,
      deltaLabel: `${latencyDeltaMs >= 0 ? '+' : ''}${formatDecimal(latencyDeltaMs, 1)} ms`,
      better: latencyDeltaMs < 0,
    },
    {
      title: "Carbon",
      ground: formatCarbon(metrics.groundCarbon),
      mix: formatCarbon(metrics.orbitCarbon),
      delta: carbonDelta,
      deltaLabel: `${carbonDelta >= 0 ? '+' : ''}${formatDecimal(carbonDelta * 100, 1)}%`,
      better: carbonDelta < 0,
    },
  ];

  return (
    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">Key Metrics</div>
      <div className="grid grid-cols-2 gap-3">
        {quadrants.map((q) => (
          <div key={q.title} className="p-2 bg-gray-900/50 rounded">
            <div className="text-xs font-semibold text-gray-300 mb-1">{q.title}</div>
            <div className="text-xs text-gray-400 mb-0.5">
              Ground: <span className="text-white">{q.ground}</span>
            </div>
            <div className="text-xs text-gray-400 mb-1">
              Orbit Mix: <span className="text-white">{q.mix}</span>
            </div>
            <div className={`text-xs font-semibold ${
              Math.abs(q.delta) < 0.01
                ? 'text-gray-500'
                : q.better
                ? 'text-green-400'
                : 'text-red-400'
            }`}>
              Δ: {q.deltaLabel} {q.better ? '(better)' : '(worse)'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

