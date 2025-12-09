"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import type { StageId } from "../../lib/orbitSim/orbitSimState";
import FactoryModule from "./FactoryModule";

const STAGE_LABELS: Record<StageId, { name: string }> = {
  silicon: { name: 'Silicon' },
  chips: { name: 'Chips' },
  racks: { name: 'Racks' },
  pods: { name: 'Pods' },
  launch: { name: 'Launch' },
  orbit: { name: 'Orbit' },
};

const UPGRADEABLE_STAGES: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch'];

/**
 * FactoryStrip - Animated horizontal factory pipeline
 */
export default function FactoryStrip({ onStageClick }: { onStageClick: (stageId: StageId) => void }) {
  const { state } = useOrbitSimStore();
  const stages: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch', 'orbit'];

  // Find bottleneck (lowest throughput)
  const throughputs = stages.map(id => state.stages[id].effectiveThroughput);
  const minThroughput = Math.min(...throughputs);
  const bottleneckStageId = stages.find(id => state.stages[id].effectiveThroughput === minThroughput);

  return (
    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 sm:p-6">
      <div className="text-xs font-semibold text-gray-300 mb-3 text-center">Factory Pipeline</div>
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 overflow-x-auto pb-2">
        {stages.map((stageId, idx) => {
          const stage = state.stages[stageId];
          const utilization = Math.min(1.5, stage.utilization);
          const isBottleneck = stageId === bottleneckStageId && idx < stages.length - 1;
          const isUpgradeable = UPGRADEABLE_STAGES.includes(stageId);
          
          // Border color based on utilization
          let borderColor = 'border-gray-600';
          if (utilization < 0.5) borderColor = 'border-blue-500';
          else if (utilization <= 1.0) borderColor = 'border-green-500';
          else borderColor = 'border-red-500';

          return (
            <div key={stageId} className="flex items-center">
              {/* Stage Card */}
              <div
                onClick={() => isUpgradeable && onStageClick(stageId)}
                className={`relative flex flex-col items-center p-2 sm:p-3 rounded-lg min-w-[60px] sm:min-w-[80px] ${
                  isUpgradeable ? 'cursor-pointer hover:bg-gray-700/50 transition' : ''
                } ${
                  isBottleneck ? 'ring-2 ring-orange-500 ring-opacity-50' : ''
                }`}
                title={
                  stageId === 'silicon' ? 'Faster pipelines, but expensive' :
                  stageId === 'chips' ? 'Increases compute density' :
                  stageId === 'racks' ? 'Improves latency' :
                  stageId === 'pods' ? 'Reduces OPEX' :
                  stageId === 'launch' ? 'Reduces bottlenecks' :
                  ''
                }
              >
                {isUpgradeable && (stageId === 'silicon' || stageId === 'chips' || stageId === 'racks' || stageId === 'pods') ? (
                  <FactoryModule stageId={stageId as 'silicon' | 'chips' | 'racks' | 'pods'} tier={stage.tier} isBottleneck={isBottleneck} />
                ) : (
                  <div className="text-2xl mb-1">{stageId === 'launch' ? '🚀' : '🌍'}</div>
                )}
                <div className="text-xs font-semibold text-white text-center mt-1 mb-1">
                  {STAGE_LABELS[stageId].name}
                </div>
                <div className="text-xs text-gray-400 text-center mb-1">
                  {stage.effectiveThroughput.toFixed(1)} /s
                </div>
                {isBottleneck && (
                  <div className="absolute -top-2 -right-2 text-xs px-1.5 py-0.5 bg-orange-500 rounded text-white">
                    ⚠
                  </div>
                )}
              </div>

              {/* Conveyor Animation */}
              {idx < stages.length - 1 && (
                <div className="relative w-8 sm:w-16 h-1 mx-1 sm:mx-2 flex-shrink-0">
                  <div className="absolute inset-0 bg-gray-700 rounded"></div>
                  <div
                    className={`absolute inset-0 rounded ${
                      isBottleneck ? 'bg-orange-500' : 'bg-green-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (stage.effectiveThroughput / 60) * 100)}%`,
                    }}
                  />
                  {/* Moving dots */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full animate-pulse"
                    style={{
                      left: `${Math.min(90, (stage.effectiveThroughput / 60) * 100)}%`,
                      animationDuration: `${Math.max(0.5, 2 - stage.effectiveThroughput / 30)}s`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Ground Energy Stress Control */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-300">Ground Energy Stress</div>
          <div className="text-xs text-white font-semibold">
            {(state.groundEnergyStress * 100).toFixed(0)}%
          </div>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={state.groundEnergyStress * 100}
          onChange={(e) => {
            const { setGroundEnergyStress } = useOrbitSimStore.getState();
            setGroundEnergyStress(Number(e.target.value) / 100);
          }}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
          title="Simulates energy crisis - increases ground OPEX"
        />
      </div>
    </div>
  );
}

