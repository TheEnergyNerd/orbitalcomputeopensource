"use client";

import { useState, useEffect } from "react";
import { useV1SandboxStore } from "../../store/v1SandboxStore";
import { V1_MISSIONS } from "../../lib/missions/v1Missions";
import { checkMissionCompletion } from "../../lib/missions/v1Missions";

/**
 * V1 Mission Panel - Simplified mission selector and progress
 */
export default function V1MissionPanel() {
  const {
    currentMissionId,
    missionProgress,
    missionCompleted,
    setCurrentMission,
  } = useV1SandboxStore();

  const [selectedMissionId, setSelectedMissionId] = useState<string>(
    currentMissionId || ""
  );

  useEffect(() => {
    if (currentMissionId) {
      setSelectedMissionId(currentMissionId);
    }
  }, [currentMissionId]);

  const handleMissionChange = (missionId: string) => {
    setSelectedMissionId(missionId);
    setCurrentMission(missionId || null);
  };

  const currentMission = V1_MISSIONS.find(m => m.id === currentMissionId);

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto w-[95%] max-w-[400px] px-2">
      <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3">
        <div className="mb-2">
          <label className="text-xs text-gray-400 block mb-1">MISSION:</label>
          <select
            value={selectedMissionId}
            onChange={(e) => handleMissionChange(e.target.value)}
            className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
          >
            <option value="">None</option>
            {V1_MISSIONS.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.name}
              </option>
            ))}
          </select>
        </div>

        {currentMission && (
          <>
            <div className="text-xs text-gray-300 mb-2">{currentMission.description}</div>
            <div className="text-xs text-gray-400 mb-1">
              <div className="font-semibold mb-1">Goals:</div>
              {Object.entries(currentMission.goals).map(([key, value]) => (
                <div key={key} className="ml-2">
                  • {key}: {typeof value === 'number' ? value.toFixed(2) : value}
                </div>
              ))}
            </div>
            <div className="mt-2">
              <div className="text-xs text-gray-400 mb-1">Progress: {missionProgress}%</div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    missionCompleted ? 'bg-green-500' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, missionProgress))}%` }}
                />
              </div>
              {missionCompleted && (
                <div className="text-xs text-green-400 font-semibold mt-1">
                  ✓ MISSION COMPLETE
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

