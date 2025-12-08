 "use client";

import { useEffect, useMemo } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { MISSIONS, getMissionById, evaluateMission } from "../game/missionEngine";
import type { SimulationState, MissionDefinition } from "../game/simTypes";

export default function ActiveMissionPanel() {
  const {
    sandboxMode,
    activeMissionId,
    missionProgress,
    orbitalComputeUnits,
    groundDCReduction,
    setActiveMission,
    unlockedMissions,
    completedMissions,
    unlockUnit,
    unlockMission,
    markMissionCompleted,
  } = useSandboxStore();
  const simState = useSimStore((s) => s.state);
  const { units, deploymentQueue } = useOrbitalUnitsStore();
  
  // Calculate orbit share (needed for useMemo dependencies)
  const totalCompute = orbitalComputeUnits + (100 - groundDCReduction);
  const orbitShare = totalCompute > 0 ? (orbitalComputeUnits / totalCompute) * 100 : 0;
  
  // Get mission (needed for useMemo)
  const mission: MissionDefinition | undefined = activeMissionId ? getMissionById(activeMissionId) : undefined;
  
  // Derive a coarse SimulationState from current sandbox + sim metrics
  // MUST be called before any early returns to follow Rules of Hooks
  const simulationState: SimulationState | null = useMemo(() => {
    if (!simState || !activeMissionId) return null;
    if (!simState) return null;

    const satCountApprox = orbitalComputeUnits * 50;
    const totalUnitCost = [...units, ...deploymentQueue].reduce(
      (sum, u) => sum + (u.cost || 0),
      0
    );
    const totalPowerMw =
      simState.metrics.totalGroundPowerMw +
      simState.metrics.totalOrbitalPowerMw;

    const costPerComputeUnit =
      totalPowerMw > 0 ? totalUnitCost / totalPowerMw : totalUnitCost || 0;

    const baselineCarbon =
      simState.metrics.carbonGround + simState.metrics.carbonOrbit;
    const carbonReductionPct =
      baselineCarbon > 0 ? (simState.metrics.carbonGround / baselineCarbon) * 100 : 0;

    const populationServedMillions = satCountApprox * 0.2; // 0.2M per 50-sat pod
    const underservedCoveragePct = Math.min(
      100,
      (orbitShare / 80) * 100
    ); // rough scaling: 80% orbit => ~100% coverage

    const perfLatency = simState.metrics.avgLatencyMs;

    const resilienceScore = Math.min(
      100,
      40 + orbitShare * 0.6
    ); // more orbit => more resilience

    const availabilityPct = Math.min(
      100,
      95 + orbitShare * 0.05
    ); // more orbit => slightly better availability

    return {
      orbit: {
        band: "LEO",
        satellites: satCountApprox,
        altitudeKm: 550,
        inclinationDeg: 53,
      },
      ground: {
        regions: ["GLOBAL"],
        groundDcs: 50,
        reductionPct: groundDCReduction,
      },
      split: {
        orbitSharePct: orbitShare,
        groundSharePct: 100 - orbitShare,
      },
      budgetMillionUsd: totalUnitCost,
      metrics: {
        cost: {
          capexMillionUsd: totalUnitCost,
          opexMillionUsdPerYear: totalPowerMw * 0.5, // arbitrary factor
          costPerComputeUnit,
        },
        perf: {
          avgLatencyMs: perfLatency,
          p95LatencyMs: perfLatency * 1.3,
          resilienceScore,
          availabilityPct,
        },
        sustainability: {
          annualCarbonTons: baselineCarbon,
          carbonReductionPct,
          powerMwhPerYear: totalPowerMw * 8760,
        },
        worldImpact: {
          populationServedMillions,
          underservedCoveragePct,
        },
      },
      currentMissionId: activeMissionId,
      completedMissions,
      unlockedTech: [],
      lastScenarioId: undefined,
    };
  }, [
    simState,
    orbitalComputeUnits,
    groundDCReduction,
    orbitShare,
    units,
    deploymentQueue,
    activeMissionId,
    completedMissions,
  ]);

  const { allObjectivesMet, failedConstraints } = simulationState
    ? evaluateMission(simulationState)
    : { allObjectivesMet: false, failedConstraints: [] };

  const isCompleted = allObjectivesMet && failedConstraints.length === 0;

  // Progress approximation: based on first objective when present
  const primaryObjective = mission?.objectives[0];
  let progress = missionProgress;
  if (simulationState && primaryObjective) {
    const currentValue = (() => {
      const [group, field] = primaryObjective.metric.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metrics: any = simulationState.metrics;
      return metrics?.[group]?.[field] ?? 0;
    })();

    const target = primaryObjective.target;
    if (
      primaryObjective.comparator === "<" ||
      primaryObjective.comparator === "<="
    ) {
      progress = Math.min(
        100,
        ((target / Math.max(currentValue, target)) * 100) || 0
      );
    } else {
      progress = Math.min(
        100,
        ((currentValue / Math.max(target, currentValue)) * 100) || 0
      );
    }
  }
  
  // Unlock units / missions when mission completes
  useEffect(() => {
    if (isCompleted && activeMissionId && mission) {
      markMissionCompleted(activeMissionId);
      mission.rewards.forEach((reward) => {
        if (reward.type === "UNLOCK_MISSION") {
          unlockMission(reward.value);
        } else if (reward.type === "UNLOCK_TECH") {
          unlockUnit(reward.value);
        }
      });
    }
  }, [isCompleted, activeMissionId, mission, markMissionCompleted, unlockMission, unlockUnit]);
  
  // Show missions list when in missions mode and no active mission
  if (sandboxMode === "missions" && !activeMissionId) {
    const availableMissions = MISSIONS.filter((m) =>
      unlockedMissions.includes(m.id)
    );

    return (
      <div className="fixed top-[130px] left-2 sm:left-6 z-40 panel-glass rounded-xl p-3 sm:p-4 w-[calc(100vw-1rem)] sm:w-80 md:w-96 lg:w-[420px] max-w-[calc(100vw-1rem)] shadow-2xl border border-white/10 max-h-[calc(100vh-150px)] overflow-y-auto">
        <h3 className="text-lg font-bold text-accent-blue mb-4">Available Missions</h3>
        <div className="space-y-3">
          {availableMissions.map((mission) => (
            <button
              key={mission.id}
              onClick={() => setActiveMission(mission.id)}
              className="w-full text-left p-3 bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700 rounded-lg transition-all"
            >
              <div className="text-sm font-semibold text-white mb-1">{mission.title}</div>
              <div className="text-xs text-gray-400 mb-2">{mission.shortDescription}</div>
              <div className="text-xs text-accent-green">
                Difficulty: {mission.difficulty}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  
  // Show active mission details
  if (!activeMissionId || !mission) {
    return null;
  }
  
  return (
    <div className="fixed top-[130px] left-2 sm:left-6 z-40 panel-glass rounded-xl p-3 sm:p-4 w-[calc(100vw-1rem)] sm:w-80 md:w-96 lg:w-[420px] max-w-[calc(100vw-1rem)] shadow-2xl border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-accent-blue">{mission.title}</h3>
        <button
          onClick={() => setActiveMission(null)}
          className="text-gray-400 hover:text-white transition text-sm"
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-gray-300 mb-4">{mission.longDescription}</p>
      
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Primary objective progress:</span>
          <span className="text-accent-blue font-semibold">
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all ${isCompleted ? 'bg-accent-green' : 'bg-accent-blue'}`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>
      
      {isCompleted ? (
        <div className="p-3 bg-accent-green/20 border-2 border-accent-green rounded-lg mb-2">
          <div className="text-sm font-bold text-accent-green mb-1">✓ Mission Complete!</div>
          <div className="text-xs text-accent-green font-semibold mb-2">
            🎁 Rewards unlocked:
          </div>
          <ul className="text-xs text-gray-300 list-disc list-inside">
            {mission.rewards.map((r) => (
              <li key={r.id}>{r.label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-xs text-gray-400 mb-2">
          Progress: {progress.toFixed(0)}%
        </div>
      )}

      <div className="mt-2 text-xs text-gray-400">
        Objectives:
        <ul className="mt-1 list-disc list-inside">
          {mission.objectives.map((obj) => (
            <li key={obj.id}>{obj.description}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

