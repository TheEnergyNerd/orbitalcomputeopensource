"use client";

import { useState } from "react";
import { useOrbitSimStore } from "../../store/orbitSimStore";
import type { StageId, Tier } from "../../lib/orbitSim/orbitSimState";
import { STAGE_TIERS, computeTierPreview } from "../../lib/orbitSim/stageTiers";
import { formatDecimal } from "../../lib/utils/formatNumber";

const STAGE_LABELS: Record<StageId, string> = {
  silicon: 'Silicon',
  chips: 'Chips',
  racks: 'Racks',
  pods: 'Pods',
  launch: 'Launch',
  orbit: 'Orbit',
};

interface StageDetailsPanelProps {
  stageId: StageId;
  onClose: () => void;
}

/**
 * StageDetailsPanel - Right-side drawer showing tier upgrade options with tradeoffs
 */
export default function StageDetailsPanel({ stageId, onClose }: StageDetailsPanelProps) {
  const { state, upgradeStage } = useOrbitSimStore();
  const [hoveredTier, setHoveredTier] = useState<Tier | null>(null);
  const stage = state.stages[stageId];
  const tiers = STAGE_TIERS[stageId];

  const handleUpgrade = (newTier: Tier) => {
    // Calculate cost
    const currentTier = stage.tier;
    let cost = 0;
    if (currentTier === 1 && newTier === 2) {
      cost = 10;
    } else if (currentTier === 2 && newTier === 3) {
      cost = 20;
    } else if (currentTier === 1 && newTier === 3) {
      cost = 30;
    }
    
    // Check if user has enough points
    if (state.allocationPoints < cost) {
      alert(`Not enough Allocation Points! Need ${cost}, have ${state.allocationPoints}.`);
      return;
    }
    
    upgradeStage(stageId, newTier);
    onClose();
  };
  
  const getTierCost = (targetTier: Tier): number => {
    const currentTier = stage.tier;
    if (currentTier === 1 && targetTier === 2) return 10;
    if (currentTier === 2 && targetTier === 3) return 20;
    if (currentTier === 1 && targetTier === 3) return 30;
    return 0;
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-700 shadow-2xl pointer-events-auto overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-semibold text-white">
                {STAGE_LABELS[stageId]} – Tier {stage.tier}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Current throughput: {formatDecimal(stage.effectiveThroughput, 1)} /s
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
          </div>

          {/* Description */}
          <div className="text-sm text-gray-300 mb-6">
            Upgrade this stage to increase throughput and improve efficiency.
          </div>

          {/* Tier Options */}
          <div className="space-y-3">
            {tiers.map((tierConfig) => {
              const isCurrent = tierConfig.tier === stage.tier;
              const preview = computeTierPreview(state, stageId, tierConfig.tier);
              const isHovered = hoveredTier === tierConfig.tier;

              return (
                <div
                  key={tierConfig.tier}
                  onMouseEnter={() => setHoveredTier(tierConfig.tier)}
                  onMouseLeave={() => setHoveredTier(null)}
                  className={`p-4 rounded-lg border-2 ${
                    isCurrent
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-white">
                      Tier {tierConfig.tier}
                    </div>
                    {isCurrent && (
                      <div className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">
                        Current
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="space-y-1 text-xs mb-3">
                    <div className="text-gray-400">
                      Throughput: <span className="text-white">
                        {formatDecimal(tierConfig.throughputMultiplier * 10, 1)} /s
                      </span>
                    </div>
                    <div className={`${
                      preview.opexDeltaPct < 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      OPEX: {preview.opexDeltaPct >= 0 ? '+' : ''}
                      {formatDecimal(preview.opexDeltaPct, 1)}%
                    </div>
                    <div className={`${
                      preview.latencyDeltaMs < 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      Latency: {preview.latencyDeltaMs >= 0 ? '+' : ''}
                      {formatDecimal(preview.latencyDeltaMs, 1)} ms
                    </div>
                    <div className={`${
                      preview.carbonDeltaPct < 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      Carbon: {preview.carbonDeltaPct >= 0 ? '+' : ''}
                      {formatDecimal(preview.carbonDeltaPct, 1)}%
                    </div>
                    {preview.launchStressDelta !== 0 && (
                      <div className={`${
                        preview.launchStressDelta < 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        Launch Stress: {preview.launchStressDelta >= 0 ? '+' : ''}
                        {formatDecimal(preview.launchStressDelta, 2)}x
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {!isCurrent && (
                    <button
                      onClick={() => handleUpgrade(tierConfig.tier)}
                      disabled={state.allocationPoints < getTierCost(tierConfig.tier)}
                      className={`w-full py-2 px-4 text-white text-sm font-semibold rounded transition ${
                        state.allocationPoints >= getTierCost(tierConfig.tier)
                          ? 'bg-cyan-500 hover:bg-cyan-600'
                          : 'bg-gray-600 cursor-not-allowed opacity-50'
                      }`}
                      title={
                        state.allocationPoints < getTierCost(tierConfig.tier)
                          ? `Need ${getTierCost(tierConfig.tier)} AP, have ${state.allocationPoints}`
                          : `Costs ${getTierCost(tierConfig.tier)} Allocation Points`
                      }
                    >
                      Choose Tier {tierConfig.tier} ({getTierCost(tierConfig.tier)} AP)
                    </button>
                  )}

                  {/* Hover Preview */}
                  {isHovered && !isCurrent && (
                    <div className="mt-3 p-3 bg-gray-800 border border-gray-700 rounded text-xs">
                      <div className="font-semibold text-white mb-2">
                        If you upgrade to T{tierConfig.tier}:
                      </div>
                      <ul className="space-y-1 text-gray-300">
                        <li className={preview.opexDeltaPct < 0 ? 'text-green-400' : 'text-red-400'}>
                          • OPEX: {preview.opexDeltaPct >= 0 ? '+' : ''}
                          ${formatDecimal(Math.abs(preview.opexDelta), 1)}M/yr ({preview.opexDeltaPct >= 0 ? '+' : ''}
                          {formatDecimal(preview.opexDeltaPct, 1)}%)
                        </li>
                        <li className={preview.latencyDeltaMs < 0 ? 'text-green-400' : 'text-red-400'}>
                          • Latency: {preview.latencyDeltaMs >= 0 ? '+' : ''}
                          {formatDecimal(Math.abs(preview.latencyDeltaMs), 1)} ms ({preview.latencyDeltaMs >= 0 ? '+' : ''}
                          {formatDecimal((preview.latencyDeltaMs / state.metrics.groundLatency) * 100, 1)}%)
                        </li>
                        <li className={preview.carbonDeltaPct < 0 ? 'text-green-400' : 'text-red-400'}>
                          • Carbon: {preview.carbonDeltaPct >= 0 ? '+' : ''}
                          {formatDecimal(Math.abs(preview.carbonDeltaPct), 1)}%
                        </li>
                        {preview.launchStressDelta !== 0 && (
                          <li className={preview.launchStressDelta < 0 ? 'text-green-400' : 'text-red-400'}>
                            • Launch stress: {preview.launchStressDelta >= 0 ? '+' : ''}
                            {formatDecimal(Math.abs(preview.launchStressDelta), 2)}x rockets/yr
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

