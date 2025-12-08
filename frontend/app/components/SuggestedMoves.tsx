"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { missions, type MissionId } from "../lib/missions/missions";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getOrbitHybridEnergyCostPerYear,
} from "../lib/sim/orbitConfig";
import { useState, useEffect } from "react";

/**
 * SuggestedMoves - Auto-generated hints based on current mission progress
 */
export default function SuggestedMoves() {
  const [selectedMissionId, setSelectedMissionId] = useState<MissionId>('cheap');
  const simState = useSandboxStore((s) => s.simState);
  const { coolingOverhead, launchSlotsThisMonth, podsPerLaunchCapacity, launchReliability } = useSandboxStore();

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
  const currentEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );

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
  const baselineEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  ) * (1 + coolingOverhead);

  // Simplified latency calculation
  const baselineLatency = 120;
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);

  // Simplified resilience
  const baselineResilience = 40;
  const currentResilience = 40 + (orbitalShare * 60);

  // Calculate launch stress
  const rawLaunchesNeeded = podsInOrbit > 0 ? Math.ceil(podsInOrbit / (podsPerLaunchCapacity || 1)) : 0;
  const effectiveLaunchesNeeded = launchReliability > 0 ? rawLaunchesNeeded / launchReliability : rawLaunchesNeeded;
  const launchCapacity = launchSlotsThisMonth || 1;
  const launchCapacityPerYear = launchCapacity * 12;
  const effectiveLaunchesNeededPerYear = effectiveLaunchesNeeded * 12;
  const launchStress = launchCapacityPerYear > 0 ? effectiveLaunchesNeededPerYear / launchCapacityPerYear : 0;

  // Calculate deltas
  const opexDeltaPct = baselineEnergyCost > 0 ? ((currentEnergyCost - baselineEnergyCost) / baselineEnergyCost) * 100 : 0;
  const latencyDelta = currentLatency - baselineLatency;
  const carbonDeltaPct = baselineCo2 > 0 ? ((currentCo2 - baselineCo2) / baselineCo2) * 100 : 0;
  const resilienceDeltaPct = baselineResilience > 0 ? ((currentResilience - baselineResilience) / baselineResilience) * 100 : 0;

  // Generate suggestions based on mission
  const suggestions: string[] = [];

  if (selectedMission.id === 'cheap') {
    // Need OPEX ≤ -15% and Latency ≤ +2ms
    if (opexDeltaPct > -15) {
      suggestions.push("Try lowering Orbital Share to reduce OPEX");
      suggestions.push("Consider Pod Gen 2 for cleaner, cheaper compute");
      suggestions.push("Increase Cooling Overhead to weaken ground baseline");
    }
    if (latencyDelta > 2) {
      suggestions.push("Reduce Orbital Share to keep latency low");
    }
    if (launchStress > 1) {
      suggestions.push("Raise Launch Capacity to prevent bottlenecks");
    }
  } else if (selectedMission.id === 'green') {
    // Need Carbon ≤ -40% and OPEX ≤ +5%
    if (carbonDeltaPct > -40) {
      suggestions.push("Increase Orbital Share to 40-60%");
      suggestions.push("Use Gen 3 pods for maximum carbon savings");
      suggestions.push("Increase Cooling Overhead to 25-50%");
    }
    if (opexDeltaPct > 5) {
      suggestions.push("Lower Orbital Share to control OPEX");
      suggestions.push("Consider Gen 2 instead of Gen 3");
    }
  } else if (selectedMission.id === 'edge') {
    // Need Latency ≤ -5ms and Energy Cost ≤ +15%
    if (latencyDelta > -5) {
      suggestions.push("Increase Orbital Share to 15-30%");
      suggestions.push("Use Gen 2 or Gen 3 pods");
    }
    const energyDeltaPct = baselineEnergyMwh > 0 ? ((currentEnergyMwh - baselineEnergyMwh) / baselineEnergyMwh) * 100 : 0;
    if (energyDeltaPct > 15) {
      suggestions.push("Don't push Orbital Share too high");
      suggestions.push("Consider Gen 1 pods to reduce energy cost");
    }
  } else if (selectedMission.id === 'resilient') {
    // Need Resilience ≥ +10% and OPEX ≤ +10%
    if (resilienceDeltaPct < 10) {
      suggestions.push("Increase Orbital Share modestly");
    }
    if (opexDeltaPct > 10) {
      suggestions.push("Keep Orbital Share moderate");
    }
    if (launchStress > 1) {
      suggestions.push("Raise Launch Capacity");
      suggestions.push("Increase Launch Reliability");
    }
  } else if (selectedMission.id === 'balanced') {
    // Need all metrics balanced
    if (opexDeltaPct > 0) {
      suggestions.push("Lower Orbital Share slightly");
    }
    if (latencyDelta > 0) {
      suggestions.push("Increase Orbital Share or use higher-gen pods");
    }
    if (carbonDeltaPct > -20) {
      suggestions.push("Increase Orbital Share to 25-40%");
      suggestions.push("Use Gen 2 pods");
    }
    if (resilienceDeltaPct < 5) {
      suggestions.push("Increase Orbital Share");
    }
    if (launchStress > 1) {
      suggestions.push("Raise Launch Capacity");
      suggestions.push("Increase Launch Reliability");
    }
  }

  // Sync with MissionPanel selection
  useEffect(() => {
    const stored = localStorage.getItem('selectedMissionId');
    if (stored) {
      setSelectedMissionId(stored as MissionId);
    }

    const handleMissionSelected = (e: CustomEvent) => {
      setSelectedMissionId(e.detail);
    };

    window.addEventListener('mission-selected', handleMissionSelected as EventListener);
    return () => window.removeEventListener('mission-selected', handleMissionSelected as EventListener);
  }, []);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-[320px] right-4 z-30 panel pointer-events-auto w-[280px] max-w-[95vw] px-2">
      <div className="text-xs font-semibold text-gray-300 mb-2">SUGGESTED MOVES</div>
      <div className="space-y-1 text-xs text-gray-400">
        {suggestions.slice(0, 3).map((suggestion, idx) => (
          <div key={idx}>• {suggestion}</div>
        ))}
      </div>
    </div>
  );
}

