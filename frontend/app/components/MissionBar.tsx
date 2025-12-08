"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useState, useEffect } from "react";
import { MISSION_PRESETS, checkMissionProgress, type Mission } from "../lib/missions/missionTypes";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getOrbitHybridEnergyCostPerYear,
} from "../lib/sim/orbitConfig";
import { formatDecimal } from "../lib/utils/formatNumber";

export default function MissionBar() {
  const simState = useSandboxStore((s) => s.simState);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(MISSION_PRESETS[0]);
  const [missions, setMissions] = useState<Mission[]>(MISSION_PRESETS);

  if (!simState) return null;

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;

  // Calculate current metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) : 0;

  const currentEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );

  // Baseline (ground-only)
  const baselineEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );

  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Calculate deltas (negative = better for cost/opex/carbon, negative = better for latency)
  const opexDelta = baselineEnergyCost > 0 ? ((currentEnergyCost - baselineEnergyCost) / baselineEnergyCost) * 100 : 0;
  const carbonDelta = baselineCo2 > 0 ? ((currentCo2 - baselineCo2) / baselineCo2) * 100 : 0;
  const latencyDelta = currentLatency - baselineLatency; // Positive = worse (higher latency)
  const costDelta = 0; // Cost per compute not calculated here, using 0 for now

  // Check mission progress
  useEffect(() => {
    if (!selectedMission) return;

    const metrics = {
      opexDelta,
      carbonDelta,
      latencyDelta,
      costDelta,
    };

    const result = checkMissionProgress(selectedMission, metrics);

    if (result.completed && !selectedMission.completed) {
      // Mission just completed!
      const updatedMission = {
        ...selectedMission,
        completed: true,
        completedAt: Date.now(),
        shareableSummary: generateShareableSummary(selectedMission, metrics),
      };

      setSelectedMission(updatedMission);
      setMissions(missions.map(m => m.id === selectedMission.id ? updatedMission : m));

      // Trigger celebration and launch animations
      window.dispatchEvent(new CustomEvent('mission-completed', { detail: updatedMission }));
      
      // Trigger launch burst for celebration
      window.dispatchEvent(new CustomEvent('controls-changed'));
    } else if (!result.completed && selectedMission.completed) {
      // Mission no longer completed (player changed settings)
      const updatedMission = {
        ...selectedMission,
        completed: false,
        completedAt: undefined,
        shareableSummary: undefined,
      };
      setSelectedMission(updatedMission);
      setMissions(missions.map(m => m.id === selectedMission.id ? updatedMission : m));
    }
  }, [opexDelta, carbonDelta, latencyDelta, costDelta, selectedMission]);

  if (!selectedMission) return null;

  const metrics = {
    opexDelta,
    carbonDelta,
    latencyDelta,
    costDelta,
  };
  const { completed, progress } = checkMissionProgress(selectedMission, metrics);

  return (
    <div className="fixed top-[50px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto mb-2" style={{ width: "90%", maxWidth: "800px" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-300">MISSION:</span>
          <select
            value={selectedMission.id}
            onChange={(e) => {
              const mission = missions.find(m => m.id === e.target.value);
              if (mission) setSelectedMission(mission);
            }}
            className="text-xs bg-gray-800 text-white px-2 py-1 rounded border border-gray-600"
          >
            {missions.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        {completed && (
          <div className="flex items-center gap-2 animate-pulse">
            <span className="text-xs font-bold text-green-400">✓ COMPLETED</span>
            {selectedMission.shareableSummary && (
              <span className="text-[10px] text-gray-400">{selectedMission.shareableSummary}</span>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-400 mb-2">{selectedMission.description}</div>

      <div className="space-y-1.5">
        {selectedMission.conditions.map((condition, idx) => {
          const progressValue = progress[condition.metric] || 0;
          const isComplete = completed || progressValue >= 100;
          
          return (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-32 text-[10px] text-gray-400">{condition.description}</div>
              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isComplete ? "bg-green-500" : "bg-cyan-500"
                  }`}
                  style={{ width: `${Math.min(100, progressValue)}%` }}
                />
              </div>
              <div className="w-16 text-[10px] text-right">
                {isComplete ? (
                  <span className="text-green-400">✓</span>
                ) : (
                  <span className="text-gray-500">{formatDecimal(progressValue, 0)}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function generateShareableSummary(mission: Mission, metrics: any): string {
  const parts: string[] = [];
  
  if (metrics.carbonDelta < -30) {
    parts.push(`-${formatDecimal(Math.abs(metrics.carbonDelta), 0)}% carbon`);
  }
  if (metrics.opexDelta < -10) {
    parts.push(`${formatDecimal(metrics.opexDelta, 0)}% cost`);
  } else if (metrics.opexDelta > 0) {
    parts.push(`+${formatDecimal(metrics.opexDelta, 0)}% cost`);
  }
  if (metrics.latencyDelta < -3) {
    parts.push(`${formatDecimal(metrics.latencyDelta, 1)}ms latency`);
  }
  
  return `I built a ${mission.name} architecture: ${parts.join(', ')}.`;
}

