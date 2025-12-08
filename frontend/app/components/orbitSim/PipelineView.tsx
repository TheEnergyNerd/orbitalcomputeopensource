"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import type { StageId } from "../../lib/orbitSim/orbitSimState";

const STAGE_LABELS: Record<StageId, string> = {
  silicon: 'Silicon',
  chips: 'Chips',
  racks: 'Racks',
  pods: 'Pods',
  launch: 'Launch',
  orbit: 'Orbit',
};

/**
 * PipelineView - Visual horizontal pipeline with flow
 */
export default function PipelineView() {
  const { state } = useOrbitSimStore();
  const stages: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch', 'orbit'];

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
      <div className="text-lg font-semibold text-white mb-4">Pipeline</div>
      <div className="flex items-center gap-4 overflow-x-auto">
        {stages.map((stageId, idx) => {
          const stage = state.stages[stageId];
          const utilization = Math.min(1.5, stage.utilization);
          const barWidth = Math.min(100, (utilization / 1.5) * 100);
          
          const barColor = 
            stage.bottleneckLevel === 'red' ? 'bg-red-500' :
            stage.bottleneckLevel === 'yellow' ? 'bg-yellow-500' :
            'bg-green-500';

          return (
            <div key={stageId} className="flex-shrink-0">
              {/* Arrow connector */}
              {idx > 0 && (
                <div className="flex items-center mb-2">
                  <div className="w-8 h-0.5 bg-gray-600"></div>
                  <div className="w-0 h-0 border-l-4 border-l-gray-600 border-t-2 border-t-transparent border-b-2 border-b-transparent"></div>
                </div>
              )}
              
              {/* Stage Card */}
              <div className={`w-32 p-3 rounded-lg border-2 ${
                stage.bottleneckLevel === 'red' ? 'border-red-500 bg-red-500/10' :
                stage.bottleneckLevel === 'yellow' ? 'border-yellow-500 bg-yellow-500/10' :
                'border-gray-600 bg-gray-700/50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-white">
                    {STAGE_LABELS[stageId]}
                  </div>
                  <div className="text-xs px-1.5 py-0.5 bg-gray-600 rounded text-gray-200">
                    T{stage.tier}
                  </div>
                </div>
                
                {/* Utilization Bar */}
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full ${barColor} transition-all duration-300`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                
                <div className="text-xs text-gray-400">
                  {stage.effectiveThroughput.toFixed(1)}/s
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

