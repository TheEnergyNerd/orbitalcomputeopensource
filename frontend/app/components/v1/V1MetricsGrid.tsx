"use client";

import { useV1SandboxStore } from "../../store/v1SandboxStore";
import { calculateMetricDeltas } from "../../lib/sim/v1State";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * V1 Metrics Grid - 2x2 cards
 * Shows: Cost per Compute, Annual OPEX, Latency, Carbon
 */
export default function V1MetricsGrid() {
  const { metrics } = useV1SandboxStore();
  const { costDelta, opexDelta, latencyDeltaMs, carbonDelta } = calculateMetricDeltas(metrics);

  const formatCurrency = (value: number) => {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
  };

  const formatCarbon = (value: number) => {
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k tCO₂`;
    return `${value.toFixed(0)} tCO₂`;
  };

  const cards = [
    {
      title: "Cost per Compute",
      ground: formatCurrency(metrics.costPerCompute.ground),
      mix: formatCurrency(metrics.costPerCompute.mix),
      delta: costDelta,
      deltaLabel: `${costDelta >= 0 ? '+' : ''}${formatDecimal(costDelta * 100, 1)}%`,
      better: costDelta < 0,
    },
    {
      title: "Annual OPEX",
      ground: formatCurrency(metrics.opex.ground),
      mix: formatCurrency(metrics.opex.mix),
      delta: opexDelta,
      deltaLabel: `${opexDelta >= 0 ? '+' : ''}${formatDecimal(opexDelta * 100, 1)}%`,
      better: opexDelta < 0,
    },
    {
      title: "Latency",
      ground: `${formatDecimal(metrics.latency.ground, 1)} ms`,
      mix: `${formatDecimal(metrics.latency.mix, 1)} ms`,
      delta: latencyDeltaMs,
      deltaLabel: `${latencyDeltaMs >= 0 ? '+' : ''}${formatDecimal(latencyDeltaMs, 1)} ms`,
      better: latencyDeltaMs < 0,
    },
    {
      title: "Carbon",
      ground: formatCarbon(metrics.carbon.ground),
      mix: formatCarbon(metrics.carbon.mix),
      delta: carbonDelta,
      deltaLabel: `${carbonDelta >= 0 ? '+' : ''}${formatDecimal(carbonDelta * 100, 1)}%`,
      better: carbonDelta < 0,
    },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto w-[95%] max-w-[800px] px-2">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3 md:p-4"
          >
            <div className="text-xs font-semibold text-gray-300 mb-2">{card.title}</div>
            <div className="text-xs text-gray-400 mb-1">
              Ground: <span className="text-white">{card.ground}</span>
            </div>
            <div className="text-xs text-gray-400 mb-2">
              Orbit Mix: <span className="text-white">{card.mix}</span>
            </div>
            <div
              className={`text-xs font-medium ${
                Math.abs(card.delta) < 0.01
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
    </div>
  );
}

