"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { getAllMissions } from "../../lib/orbitSim/orbitSimState";

/**
 * MissionPanel - Mission description + progress + suggested moves
 */
export default function MissionPanel() {
  const { state, setCurrentMission } = useOrbitSimStore();
  const allMissions = getAllMissions();

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
      <div className="mb-3">
        <label className="text-xs text-gray-400 block mb-1">Mission:</label>
        <select
          value={state.currentMission.id}
          onChange={(e) => {
            const { setCurrentMission } = useOrbitSimStore.getState();
            setCurrentMission(e.target.value);
          }}
          className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
        >
          {allMissions.map((mission) => (
            <option key={mission.id} value={mission.id}>
              {mission.name}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-gray-300 mb-2">
        {state.currentMission.description}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progress</span>
          <span>{state.currentMission.progress}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              state.currentMission.completed ? 'bg-green-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, state.currentMission.progress))}%` }}
          />
        </div>
        {state.currentMission.completed && (
          <div className="text-xs text-green-400 font-semibold mt-1">
            ✓ COMPLETED
          </div>
        )}
      </div>

      {/* Suggested Moves */}
      {state.suggestedMoves.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="text-xs font-semibold text-gray-300 mb-2">Suggested Moves:</div>
          <ul className="text-xs text-gray-400 space-y-1">
            {state.suggestedMoves.map((move, idx) => (
              <li key={idx} className="flex items-start">
                <span className="text-cyan-400 mr-2">•</span>
                <span>{move}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

