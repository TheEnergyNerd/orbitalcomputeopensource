"use client";

import { useEffect, useState } from "react";
import { useUpgradeStore } from "../../store/upgradeStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * TradeoffsPanel - Shows the impact of upgrades on throughput, OPEX, carbon, and launch risk
 */
export default function TradeoffsPanel() {
  const { getUpgradeMultipliers } = useUpgradeStore();
  const multipliers = getUpgradeMultipliers();
  const [flashState, setFlashState] = useState<'good' | 'bad' | null>(null);

  // Calculate deltas vs baseline (T1 = baseline)
  const throughputDeltaPct = ((multipliers.silicon * multipliers.chips * multipliers.racks * multipliers.launch) - 1) * 100;
  const opexDeltaPct = (multipliers.opexMultiplier - 1) * 100;
  const carbonDeltaPct = (multipliers.carbonMultiplier - 1) * 100;
  const launchRiskDeltaPct = (multipliers.launchRiskBonus * 100);

  // Determine if current combination is "good" or "bad"
  useEffect(() => {
    const isGood = throughputDeltaPct >= 20 && opexDeltaPct <= 10 && carbonDeltaPct <= 10 && launchRiskDeltaPct <= 15;
    const isBad = throughputDeltaPct < 10 && (opexDeltaPct > 15 || carbonDeltaPct > 15 || launchRiskDeltaPct > 20);
    
    if (isGood) {
      setFlashState('good');
      setTimeout(() => setFlashState(null), 1000);
    } else if (isBad) {
      setFlashState('bad');
      setTimeout(() => setFlashState(null), 500);
    }
  }, [throughputDeltaPct, opexDeltaPct, carbonDeltaPct, launchRiskDeltaPct]);

  const MetricCard = ({
    label,
    deltaPct,
    isPositiveGood,
  }: {
    label: string;
    deltaPct: number;
    isPositiveGood: boolean;
  }) => {
    // Clamp delta to ±100% for display
    const clampedDelta = Math.max(-100, Math.min(100, deltaPct));
    const isGood = isPositiveGood ? deltaPct > 0 : deltaPct < 0;
    
    return (
      <div className="bg-gray-900/50 rounded p-2 border border-gray-700">
        <div className="text-[10px] text-gray-400 mb-1.5">{label}</div>
        
        {/* Vertical meter */}
        <div className="relative h-16 bg-gray-800 rounded mb-1.5 overflow-hidden">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
          
          {/* Fill bar */}
          <div
            className={`absolute top-0 bottom-0 transition-all duration-400 ${
              isGood ? 'bg-green-500/60' : 'bg-red-500/60'
            }`}
            style={{
              left: clampedDelta < 0 ? `${50 + clampedDelta}%` : '50%',
              right: clampedDelta > 0 ? `${50 - clampedDelta}%` : '50%',
              width: `${Math.abs(clampedDelta)}%`,
            }}
          />
        </div>
        
        {/* Delta label */}
        <div className={`text-[9px] font-mono ${
          isGood ? 'text-green-400' : deltaPct === 0 ? 'text-gray-400' : 'text-red-400'
        }`}>
          {deltaPct >= 0 ? '+' : ''}{formatDecimal(deltaPct, 1)}% vs baseline
          {!isGood && deltaPct !== 0 && ' (worse)'}
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-gray-800/95 backdrop-blur-sm border rounded-lg p-3 transition-all duration-300 ${
      flashState === 'good' ? 'border-green-500/50 shadow-lg shadow-green-500/20' :
      flashState === 'bad' ? 'border-red-500/50 shadow-lg shadow-red-500/20' :
      'border-gray-700'
    }`}>
      <div className="text-xs font-semibold text-white mb-3">Upgrade Tradeoffs</div>
      <div className="space-y-2">
        <MetricCard
          label="Throughput"
          deltaPct={throughputDeltaPct}
          isPositiveGood={true}
        />
        <MetricCard
          label="OPEX"
          deltaPct={opexDeltaPct}
          isPositiveGood={false}
        />
        <MetricCard
          label="Carbon"
          deltaPct={carbonDeltaPct}
          isPositiveGood={false}
        />
        <MetricCard
          label="Launch Risk"
          deltaPct={launchRiskDeltaPct}
          isPositiveGood={false}
        />
      </div>
    </div>
  );
}




