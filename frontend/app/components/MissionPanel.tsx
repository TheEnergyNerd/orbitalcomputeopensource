"use client";

import { useState, useEffect } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { evaluateMission } from "../lib/missions/missionEvaluator";
import type { MissionDefinition, MissionProgress } from "../game/missionTypes";
import { MISSIONS } from "../game/missions";
import MissionCompleteAnimation from "./MissionCompleteAnimation";

export default function MissionPanel() {
  const {
    activeMissionId,
    unlockedMissions,
    completedMissions,
    setActiveMission,
    markMissionCompleted,
    sandboxMode,
  } = useSandboxStore();
  const [missions, setMissions] = useState<MissionDefinition[]>([]);
  const [missionProgress, setMissionProgress] = useState<MissionProgress | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);

  // Load missions
  useEffect(() => {
    setMissions(MISSIONS);
  }, []);

  // Evaluate active mission
  useEffect(() => {
    if (!activeMissionId) {
      setMissionProgress(null);
      return;
    }

    const mission = missions.find((m) => m.id === activeMissionId);
    if (!mission) return;

    const interval = setInterval(() => {
      const progress = evaluateMission(mission);
      setMissionProgress(progress);

      // Check for completion
      if (progress.isComplete && !progress.hasFailed) {
        clearInterval(interval);
        setShowCompletionAnimation(true);
        markMissionCompleted(activeMissionId);
      }

      // Check for failure
      if (progress.hasFailed) {
        clearInterval(interval);
        // Show failure message - mission will be abandoned
      }
    }, 1000); // Evaluate every second

    return () => clearInterval(interval);
  }, [activeMissionId, missions, markMissionCompleted, setActiveMission]);

  const activeMission = missions.find((m) => m.id === activeMissionId);
  const availableMissions = missions.filter(
    (m) => unlockedMissions.includes(m.id) && !completedMissions.includes(m.id)
  );

  // Position next to Strategy Deck (left side, below it)
  // Only show collapsed button in freeplay mode when not expanded and not in missions mode
  if (sandboxMode === "freeplay" && !isExpanded && !activeMissionId) {
    return null; // Hide collapsed missions button - use mode switcher instead
  }

  return (
    <div className="hidden sm:block fixed top-[280px] left-6 z-40 panel-glass rounded-xl p-4 w-80 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10 max-h-[60vh] overflow-y-auto" data-tutorial-target="missions">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-accent-blue">Missions</h2>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Active Mission Progress */}
      {activeMission && missionProgress && (
        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-accent-blue/50">
          <h3 className="text-lg font-semibold text-white mb-2">{activeMission.title}</h3>
          <p className="text-xs text-gray-400 mb-4">{activeMission.description}</p>

          {/* Objectives */}
          <div className="space-y-2 mb-4">
            <div className="text-xs font-semibold text-gray-400">Objectives:</div>
            {Object.entries(missionProgress.objectives).map(([key, obj]) => (
              <div key={key} className="text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-300">{key}:</span>
                  <span className={obj.met ? "text-accent-green" : "text-gray-500"}>
                    {obj.met ? "✓" : "○"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        obj.met ? "bg-accent-green" : "bg-accent-blue"
                      }`}
                      style={{
                        width: `${Math.min(100, (obj.current / obj.target) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {obj.current.toFixed(1)} / {obj.target}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Constraints */}
          {Object.entries(missionProgress.constraints).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-400">Constraints:</div>
              {Object.entries(missionProgress.constraints).map(([key, constraint]) => (
                <div
                  key={key}
                  className={`text-xs ${
                    constraint.violated ? "text-accent-orange" : "text-gray-300"
                  }`}
                >
                  {key}: {constraint.violated ? "⚠ Violated" : "✓ OK"}
                </div>
              ))}
            </div>
          )}

          {missionProgress.hasFailed && (
            <div className="mt-4 p-2 bg-accent-orange/20 border border-accent-orange/50 rounded text-xs text-accent-orange">
              Mission Failed: {missionProgress.failureReason}
            </div>
          )}

          {missionProgress.isComplete && (
            <div className="mt-4 p-2 bg-accent-green/20 border border-accent-green/50 rounded text-xs text-accent-green">
              Mission Complete! ✓
            </div>
          )}

          <button
            onClick={() => setActiveMission(null)}
            className="mt-4 w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-semibold"
          >
            Abandon Mission
          </button>
        </div>
      )}

      {/* Available Missions */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-gray-400 mb-2">
          {activeMission ? "Available Missions" : "Start a Mission"}
        </div>
        {availableMissions.map((mission) => (
          <button
            key={mission.id}
            onClick={() => setActiveMission(mission.id)}
            disabled={activeMissionId !== null}
            className={`w-full text-left p-3 rounded-lg border-2 transition ${
              activeMissionId !== null
                ? "border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed"
                : "border-gray-700 bg-gray-800/50 hover:border-accent-blue/50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white">{mission.title}</span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  mission.difficulty === "EASY"
                    ? "bg-green-500/20 text-green-400"
                    : mission.difficulty === "MEDIUM"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : mission.difficulty === "HARD"
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {mission.difficulty}
              </span>
            </div>
            <p className="text-xs text-gray-400">{mission.description}</p>
          </button>
        ))}

        {/* Completed Missions */}
        {completedMissions.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold text-gray-400 mb-2">Completed</div>
            {missions
              .filter((m) => completedMissions.includes(m.id))
              .map((mission) => (
                <div
                  key={mission.id}
                  className="p-3 rounded-lg border border-gray-700 bg-gray-800/30 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-500">{mission.title}</span>
                    <span className="text-accent-green">✓</span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Mission Completion Animation */}
      <MissionCompleteAnimation
        isVisible={showCompletionAnimation}
        missionTitle={activeMission?.title}
        onComplete={() => {
          setShowCompletionAnimation(false);
          setActiveMission(null);
        }}
      />
    </div>
  );
}

