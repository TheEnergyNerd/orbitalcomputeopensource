"use client";

import { useSandboxWorkloadStore } from "../lib/state/SandboxStore";
import { WorkloadType } from "../lib/types/SystemState";

export default function WorkloadPanel() {
  const { workloads, setWorkloadDemand, setWorkloadOrbitShare, addWorkload, removeWorkload } = useSandboxWorkloadStore();

  const workloadLabels: Record<WorkloadType, string> = {
    ai_inference: "AI Inference",
    video: "Video Processing",
    blockchain: "Blockchain",
  };

  const workloadIcons: Record<WorkloadType, string> = {
    ai_inference: "🤖",
    video: "🎬",
    blockchain: "⛓️",
  };

  return (
    <div className="fixed top-6 left-[340px] z-40 panel-glass rounded-xl p-6 w-96 shadow-2xl border border-white/10">
      <h3 className="text-lg font-bold text-accent-blue mb-4">Workload Configuration</h3>
      
      <div className="space-y-4">
        {workloads.map((workload) => (
          <div key={workload.type} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{workloadIcons[workload.type]}</span>
                <span className="font-semibold text-white">{workloadLabels[workload.type]}</span>
              </div>
              <button
                onClick={() => removeWorkload(workload.type)}
                className="text-gray-400 hover:text-red-400 transition"
              >
                ✕
              </button>
            </div>
            
            {/* Demand Slider */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Demand</span>
                <span className="text-accent-orange font-semibold">{workload.demandMW.toFixed(1)} MW</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={workload.demandMW}
                onChange={(e) => setWorkloadDemand(workload.type, Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-orange"
              />
            </div>
            
            {/* Orbit Share Slider */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Orbit Share</span>
                <span className="text-accent-blue font-semibold">{(workload.orbitShare * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={workload.orbitShare * 100}
                onChange={(e) => setWorkloadOrbitShare(workload.type, Number(e.target.value) / 100)}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
              />
            </div>
          </div>
        ))}
        
        {/* Add Workload Button */}
        <button
          onClick={() => {
            const types: WorkloadType[] = ["ai_inference", "video", "blockchain"];
            const existingTypes = workloads.map((w) => w.type);
            const availableType = types.find((t) => !existingTypes.includes(t));
            if (availableType) {
              addWorkload({
                type: availableType,
                demandMW: 10,
                orbitShare: 0.2,
              });
            }
          }}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-all border border-gray-600"
        >
          + Add Workload Type
        </button>
      </div>
    </div>
  );
}

