"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { getOrbitalComputeKw } from "../lib/sim/orbitConfig";
import { formatDecimal } from "../lib/utils/formatNumber";
import MissionPanel from "./MissionPanel";
import OrbitScorePanel from "./OrbitScorePanel";
import ControlsPanel from "./ControlsPanel";
import MetricsGrid from "./MetricsGrid";
import SuggestedMoves from "./SuggestedMoves";
import LiveReactionMessages from "./LiveReactionMessages";

/**
 * OVERVIEW Surface - Clean, minimal view
 * Only shows:
 * - Mission panel (small)
 * - Orbit Score bar
 * - Control block (6 controls)
 * - Metrics grid (4 cards)
 * - Single sentence explaining outcome
 */
export default function OverviewSurface() {
  const { simState, launchSlotsThisMonth, podsPerLaunchCapacity, launchReliability } = useSandboxStore();

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  // Calculate orbital share
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalComputeKw = getOrbitalComputeKw(
    podsInOrbit,
    simState.orbitalPodSpec,
    simState.podDegradationFactor
  );
  const targetComputeKw = simState.targetComputeKw;
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;

  // Calculate pods required and launches needed
  const podsRequired = podsInOrbit;
  const rawLaunchesNeeded = podsInOrbit > 0 ? Math.ceil(podsInOrbit / (podsPerLaunchCapacity || 1)) : 0;
  const effectiveLaunchesNeeded = launchReliability > 0 ? rawLaunchesNeeded / launchReliability : rawLaunchesNeeded;
  const launchesNeeded = Math.ceil(effectiveLaunchesNeeded);

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      {/* Mission Panel - Top */}
      <div className="w-full px-2">
        <MissionPanel />
      </div>
      
      {/* Orbit Score - Below Mission */}
      <div className="w-full px-2">
        <OrbitScorePanel />
      </div>

      {/* Controls Panel - 6 controls */}
      <div className="w-full px-2">
        <ControlsPanel />
      </div>

      {/* Metrics Grid - 4 cards at bottom */}
      <MetricsGrid />

      {/* Suggested Moves - Below Orbit Score */}
      <SuggestedMoves />

      {/* Live Reaction Messages - Bottom center */}
      <LiveReactionMessages />

      {/* Deployment Summary - Single sentence at bottom */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30 text-xs text-gray-400 text-center pointer-events-none">
        To reach <span className="text-white font-semibold">{formatDecimal(orbitalShare, 1)}%</span> orbital share 
        you need <span className="text-white font-semibold">{formatDecimal(podsRequired, 0)}</span> pods/year 
        and <span className="text-white font-semibold">{formatDecimal(launchesNeeded, 0)}</span> launches/year.
      </div>
    </div>
  );
}

