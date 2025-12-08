"use client";

import { useV1SandboxStore } from "../../store/v1SandboxStore";
import V1MissionPanel from "./V1MissionPanel";
import ThreeLeverControls from "./ThreeLeverControls";
import V1MetricsGrid from "./V1MetricsGrid";
import { computeSuggestedMoves } from "../../lib/missions/v1SuggestedMoves";
import { V1_MISSIONS } from "../../lib/missions/v1Missions";

/**
 * V1 Overview Surface - Clean 3-lever design
 * Shows: Mission panel, 3 sliders, 2x2 metrics grid, suggested moves
 */
export default function V1OverviewSurface() {
  const state = useV1SandboxStore();
  const mission = state.currentMissionId 
    ? V1_MISSIONS.find(m => m.id === state.currentMissionId) || null
    : null;
  const suggestedMoves = computeSuggestedMoves(state, mission);

  // Calculate summary sentence
  const summary = `To reach ${(state.orbitalShare * 100).toFixed(1)}% orbital share, you need ${state.podsPerYear.toFixed(0)} pods/year and ${state.launchesPerYear.toFixed(0)} launches/year.`;

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      {/* Mission Panel */}
      <V1MissionPanel />

      {/* Three Lever Controls */}
      <ThreeLeverControls />

      {/* Metrics Grid */}
      <V1MetricsGrid />

      {/* Suggested Moves */}
      {suggestedMoves.length > 0 && (
        <div className="fixed top-[320px] right-4 z-30 panel pointer-events-auto w-[95%] max-w-[300px] px-2">
          <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-300 mb-2">Suggested Moves:</div>
            <ul className="text-xs text-gray-400 space-y-1">
              {suggestedMoves.map((move, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-cyan-400 mr-2">•</span>
                  <span>{move}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Summary Sentence */}
      <div className="fixed bottom-[200px] left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
        <div className="text-xs text-gray-400 text-center px-4">
          {summary}
        </div>
      </div>
    </div>
  );
}

