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

export default function MissionCard() {
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

  // Calculate deltas
  const opexDelta = baselineEnergyCost > 0 ? ((currentEnergyCost - baselineEnergyCost) / baselineEnergyCost) * 100 : 0;
  const carbonDelta = baselineCo2 > 0 ? ((currentCo2 - baselineCo2) / baselineCo2) * 100 : 0;
  const latencyDelta = currentLatency - baselineLatency;
  const energyDelta = baselineEnergyMwh > 0 ? ((currentEnergyMwh - baselineEnergyMwh) / baselineEnergyMwh) * 100 : 0;
  const resilienceDelta = orbitalShare * 60; // Simplified: 0-60% based on orbital share

  // Check mission progress
  useEffect(() => {
    if (!selectedMission) return;

    const metrics = {
      opexDelta,
      carbonDelta,
      latencyDelta,
      costDelta: 0,
      energyDelta,
      resilienceDelta,
    };

    const result = checkMissionProgress(selectedMission, metrics);

    if (result.completed && !selectedMission.completed) {
      const updatedMission = {
        ...selectedMission,
        completed: true,
        completedAt: Date.now(),
        shareableSummary: generateShareableSummary(selectedMission, metrics),
      };

      setSelectedMission(updatedMission);
      setMissions(missions.map(m => m.id === selectedMission.id ? updatedMission : m));

      window.dispatchEvent(new CustomEvent('mission-completed', { detail: updatedMission }));
      window.dispatchEvent(new CustomEvent('controls-changed'));
    } else if (!result.completed && selectedMission.completed) {
      const updatedMission = {
        ...selectedMission,
        completed: false,
        completedAt: undefined,
        shareableSummary: undefined,
      };
      setSelectedMission(updatedMission);
      setMissions(missions.map(m => m.id === selectedMission.id ? updatedMission : m));
    }
  }, [opexDelta, carbonDelta, latencyDelta, energyDelta, resilienceDelta, selectedMission]);

  if (!selectedMission) return null;

  const metrics = {
    opexDelta,
    carbonDelta,
    latencyDelta,
    costDelta: 0,
    energyDelta,
    resilienceDelta,
  };
  const { completed, progress } = checkMissionProgress(selectedMission, metrics);

  // Get current values for display
  const getCurrentValue = (metric: string): number => {
    switch (metric) {
      case 'opex': return opexDelta;
      case 'carbon': return carbonDelta;
      case 'latency': return latencyDelta;
      case 'energy': return energyDelta;
      case 'resilience': return resilienceDelta;
      default: return 0;
    }
  };

  const formatValue = (metric: string, value: number): string => {
    if (metric === 'latency') {
      return `${value >= 0 ? '+' : ''}${formatDecimal(value, 1)}ms`;
    }
    return `${value >= 0 ? '+' : ''}${formatDecimal(value, 1)}%`;
  };

  return (
    <div className="fixed top-[60px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto" style={{ width: "90%", maxWidth: "400px" }}>
      <div className="flex items-center justify-between mb-2">
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
        {completed && (
          <span className="text-xs font-bold text-green-400 animate-pulse">✓ COMPLETE</span>
        )}
      </div>

      <div className="text-xs text-gray-400 mb-2">Goal:</div>
      <div className="text-xs text-gray-300 mb-3 space-y-0.5">
        {selectedMission.conditions.map((condition, idx) => (
          <div key={idx}>• {condition.description}</div>
        ))}
      </div>

      <div className="text-xs text-gray-400 mb-1">Progress:</div>
      <div className="space-y-1 text-xs">
        {selectedMission.conditions.map((condition, idx) => {
          const current = getCurrentValue(condition.metric);
          const threshold = condition.threshold;
          const isMet = condition.operator === 'lte' ? current <= threshold : current >= threshold;
          
          return (
            <div key={idx} className={`flex justify-between ${isMet ? 'text-green-400' : 'text-gray-300'}`}>
              <span>{condition.metric === 'opex' ? 'OPEX' : condition.metric === 'carbon' ? 'Carbon' : condition.metric === 'latency' ? 'Latency' : condition.metric === 'energy' ? 'Energy' : 'Resilience'}:</span>
              <span>
                {formatValue(condition.metric, current)} (goal {formatValue(condition.metric, threshold)})
              </span>
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

