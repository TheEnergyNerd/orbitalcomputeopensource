"use client";

import { useState } from "react";
import type { StageId, StageUpgrades } from "../../lib/orbitSim/factoryModel";
import { getStageLabel, getAllocationCost } from "../../lib/orbitSim/factoryModel";
import { formatDecimal } from "../../lib/utils/formatNumber";

interface StageAllocationRowProps {
  stageId: StageId;
  stage: { upgrades: StageUpgrades };
  computed: { capacity: number; throughput: number; utilization: number; efficiency: number; reliability: number };
  hasActiveEvent: boolean;
  eventDescription?: string;
  allocationRemaining: number;
  onAdjust: (stageId: StageId, field: keyof StageUpgrades, delta: 1 | -1) => void;
}

export default function StageAllocationRow({
  stageId,
  stage,
  computed,
  hasActiveEvent,
  eventDescription,
  allocationRemaining,
  onAdjust,
}: StageAllocationRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`bg-gray-900/50 rounded p-2 border ${
        hasActiveEvent ? 'border-red-500' : 'border-gray-700'
      }`}
    >
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">{getStageLabel(stageId)}</span>
          {hasActiveEvent && (
            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
              {eventDescription}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-gray-400">
            {formatDecimal(computed.capacity, 1)}/deploy | {formatDecimal(computed.utilization * 100, 0)}% util
          </div>
          <button className="text-xs text-gray-500">
            {isExpanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {/* Collapsible allocation controls */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="grid grid-cols-3 gap-2">
            {(['capacityPoints', 'efficiencyPoints', 'reliabilityPoints'] as const).map((field) => {
              const currentPoints = stage.upgrades[field];
              const cost = getAllocationCost(stageId, field, currentPoints);
              const canAdd = allocationRemaining >= cost;

              return (
                <div key={field} className="bg-gray-800/50 rounded p-2">
                  <div className="text-[10px] text-gray-400 mb-1 capitalize">
                    {field.replace('Points', '')}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdjust(stageId, field, -1); }}
                      disabled={currentPoints <= 0}
                      className="px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded"
                    >
                      −
                    </button>
                    <span className="text-[10px] text-white font-semibold min-w-[16px] text-center">
                      {currentPoints}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdjust(stageId, field, 1); }}
                      disabled={!canAdd}
                      className="px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-[9px] text-gray-500 mt-1">
                    {field === 'capacityPoints' && `+${formatDecimal((currentPoints * 0.15) * 100, 0)}%`}
                    {field === 'efficiencyPoints' && `${formatDecimal(computed.efficiency * 100, 0)}%`}
                    {field === 'reliabilityPoints' && `${formatDecimal(computed.reliability * 100, 0)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}




