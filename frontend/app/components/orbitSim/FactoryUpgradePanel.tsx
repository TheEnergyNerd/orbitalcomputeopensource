"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import type { StageId, Tier } from "../../lib/orbitSim/orbitSimState";

const STAGE_LABELS: Record<StageId, string> = {
  silicon: 'Silicon',
  chips: 'Chips',
  racks: 'Racks',
  pods: 'Pods',
  launch: 'Launch',
  orbit: 'Orbit',
};

// Stages that can be upgraded (exclude orbit)
const UPGRADEABLE_STAGES: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch'];

/**
 * FactoryUpgradePanel - Compact controls for upgrading Tier 1–3 for each factory stage
 */
export default function FactoryUpgradePanel() {
  const { state, upgradeStage } = useOrbitSimStore();

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">Factory Upgrades</div>
      <div className="space-y-3">
        {UPGRADEABLE_STAGES.map((stageId) => {
          const stage = state.stages[stageId];
          
          return (
            <div key={stageId} className="flex items-center justify-between">
              <div className="text-xs text-gray-300 w-20">
                {STAGE_LABELS[stageId]}
              </div>
              <div className="flex gap-1">
                {([1, 2, 3] as Tier[]).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => upgradeStage(stageId, tier)}
                    className={`px-3 py-1 text-xs rounded transition ${
                      stage.tier === tier
                        ? 'bg-cyan-500 text-white font-semibold'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title="Higher tier increases throughput but raises ground energy and heat."
                  >
                    T{tier}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Ground Energy Stress Slider */}
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

