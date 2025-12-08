"use client";

import { useState } from "react";
import { missions, type MissionId, type Metrics } from "../lib/missions/missions";
import { useSandboxStore } from "../store/sandboxStore";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getGroundEnergyMwhPerYear,
} from "../lib/sim/orbitConfig";

/**
 * MissionPanel - Small card showing selected mission, goal, and progress
 */
export default function MissionPanel() {
  const [selectedMissionId, setSelectedMissionId] = useState<MissionId>('cheap');
  const simState = useSandboxStore((s) => s.simState);
  const { coolingOverhead } = useSandboxStore();

  if (!simState) return null;

  const selectedMission = missions.find(m => m.id === selectedMissionId) || missions[0];
  
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
  // Calculate energy costs only (not including orbital OPEX)
  const groundKw = Math.max(0, targetComputeKw - orbitalComputeKw);
  const groundEnergyMwh = getGroundEnergyMwhPerYear(groundKw, groundSpec) * (1 + coolingOverhead);
  const currentEnergyCost = groundEnergyMwh * groundSpec.energyPricePerMwh; // Only ground energy costs

  // Baseline (ground-only) with cooling overhead
  const baselineEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);
  const baselineCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);
  // Baseline: ground-only energy costs (with cooling overhead)
  const baselineGroundEnergyMwh = getGroundEnergyMwhPerYear(targetComputeKw, groundSpec) * (1 + coolingOverhead);
  const baselineEnergyCost = baselineGroundEnergyMwh * groundSpec.energyPricePerMwh;

  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Simplified resilience (0-100% based on orbital share)
  const baselineResilience = 40;
  const currentResilience = 40 + (orbitalShare * 60);

  // Calculate cost per compute: Energy costs only (same as MetricsGrid)
  const KWH_PER_TFLOP = 1000;
  const HOURS_PER_YEAR = 8760;
  const computeKwToTFLOPyr = HOURS_PER_YEAR / KWH_PER_TFLOP; // 8.76
  
  const groundComputeTFLOPyr = targetComputeKw * computeKwToTFLOPyr;
  const groundEnergyMwhBaseline = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);
  const groundEnergyCostOnly = groundEnergyMwhBaseline * groundSpec.energyPricePerMwh;
  const costPerComputeGround = groundComputeTFLOPyr > 0 
    ? groundEnergyCostOnly / groundComputeTFLOPyr 
    : 0;
  
  const groundKwMix = Math.max(0, targetComputeKw - orbitalComputeKw);
  const groundTFLOPyr = groundKwMix * computeKwToTFLOPyr;
  const groundEnergyMwhMix = getGroundEnergyMwhPerYear(groundKwMix, groundSpec) * (1 + coolingOverhead);
  const groundEnergyCostMix = groundEnergyMwhMix * groundSpec.energyPricePerMwh;
  const groundCostPerTFLOP = groundTFLOPyr > 0 
    ? groundEnergyCostMix / groundTFLOPyr 
    : costPerComputeGround;
  
  const orbitalTFLOPyr = orbitalComputeKw * computeKwToTFLOPyr;
  const orbitalCostPerTFLOP = 0; // Free solar energy
  
  const totalTFLOPyr = groundTFLOPyr + orbitalTFLOPyr;
  const costPerComputeMix = totalTFLOPyr > 0
    ? ((groundTFLOPyr * groundCostPerTFLOP) + (orbitalTFLOPyr * orbitalCostPerTFLOP)) / totalTFLOPyr
    : costPerComputeGround;

  const metrics: Metrics = {
    costPerComputeGround,
    costPerComputeMix,
    opexGround: baselineEnergyCost,
    opexMix: currentEnergyCost,
    latencyGround: baselineLatency,
    latencyMix: currentLatency,
    carbonGround: baselineCo2,
    carbonMix: currentCo2,
    resilienceGround: baselineResilience,
    resilienceMix: currentResilience,
    energyCostGround: baselineEnergyMwh * groundSpec.energyPricePerMwh,
    energyCostMix: currentEnergyMwh * groundSpec.energyPricePerMwh,
  };

  const { complete, progress } = selectedMission.check(metrics);

  // Trigger launch animation on mission completion
  if (complete) {
    window.dispatchEvent(new CustomEvent('mission-completed', { detail: selectedMission }));
  }

  return (
    <div className="fixed top-[60px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto w-[95%] max-w-[400px] px-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300">MISSION:</span>
        <select
          value={selectedMissionId}
          onChange={(e) => {
            const newId = e.target.value as MissionId;
            setSelectedMissionId(newId);
            localStorage.setItem('selectedMissionId', newId);
            window.dispatchEvent(new CustomEvent('mission-selected', { detail: newId }));
          }}
          className="text-xs bg-gray-800 text-white px-2 py-1 rounded border border-gray-600"
        >
          {missions.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {complete && (
          <span className="text-xs font-bold text-green-400 animate-pulse">✓ COMPLETED</span>
        )}
      </div>

      <div className="text-xs text-gray-400 mb-2">Goal:</div>
      <div className="text-xs text-gray-300 mb-3 space-y-0.5">
        {selectedMission.descriptionLines.map((line, idx) => (
          <div key={idx}>• {line}</div>
            ))}
          </div>

      <div className="text-xs text-gray-400 mb-1">Progress:</div>
      <div className="space-y-1 text-xs">
        {progress.map((line, idx) => (
          <div key={idx} className={complete ? 'text-green-400' : 'text-gray-300'}>
            {line}
            </div>
        ))}
      </div>
    </div>
  );
}
