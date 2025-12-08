"use client";

import { useOrbitSimStore } from "../../store/orbitSimStore";
import { getAllMissions } from "../../lib/orbitSim/orbitSimState";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * MissionCard - Shows mission with inline progress
 */
export default function MissionCard() {
  const { state, setCurrentMission } = useOrbitSimStore();
  const allMissions = getAllMissions();
  const opexDelta = (state.metrics.orbitOpex - state.metrics.groundOpex) / state.metrics.groundOpex;
  const latencyDeltaMs = state.metrics.orbitLatency - state.metrics.groundLatency;
  const carbonDelta = (state.metrics.orbitCarbon - state.metrics.groundCarbon) / state.metrics.groundCarbon;

  // Get mission-specific progress
  const getMissionProgress = () => {
    const mission = state.currentMission;
    switch (mission.id) {
      case 'cheap_orbit':
        return {
          goals: [
            { label: 'OPEX', value: opexDelta, target: -0.20, unit: '%' },
            { label: 'Latency', value: latencyDeltaMs, target: 5, unit: 'ms' },
          ],
        };
      case 'green_leap':
        return {
          goals: [
            { label: 'Carbon', value: carbonDelta, target: -0.60, unit: '%' },
            { label: 'OPEX', value: opexDelta, target: 0.10, unit: '%' },
          ],
        };
      case 'energy_collapse':
        return {
          goals: [
            { label: 'Energy Stress', value: state.groundEnergyStress, target: 0.7, unit: '' },
            { label: 'Breakpoint', value: state.breakpointReached ? 1 : 0, target: 1, unit: '' },
          ],
        };
      case 'launch_surge':
        return {
          goals: [
            { label: 'Launch Failures', value: state.flow.launchFailureRate, target: 0.2, unit: '' },
            { label: 'Backlog', value: state.flow.backlogFactor, target: 1.0, unit: '' },
          ],
        };
      case 'orbital_era':
        return {
          goals: [
            { label: 'Orbit Share', value: state.orbitComputeShare, target: 0.60, unit: '%' },
            { label: 'Breakpoint', value: state.breakpointReached ? 1 : 0, target: 1, unit: '' },
          ],
        };
      default:
        return { goals: [] };
    }
  };

  const progress = getMissionProgress();

  return (
    <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-white mb-1">
            Your Mission: Make orbital compute cheaper, cleaner, and faster than pure ground.
          </div>
          <div className="text-xs text-gray-400">
            You have <span className="text-cyan-400 font-semibold">{state.allocationPoints}</span> Allocation Points to tune the system.
          </div>
        </div>
        <div className="ml-4">
          <label className="text-xs text-gray-400 block mb-1">Mission:</label>
          <select
            value={state.currentMission.id}
            onChange={(e) => {
              const { setCurrentMission } = useOrbitSimStore.getState();
              setCurrentMission(e.target.value);
            }}
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
          >
            {allMissions.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-gray-300 mb-3">
        {state.currentMission.description}
      </div>

      {/* Inline Progress */}
      <div className="space-y-2 mb-3">
        {progress.goals.map((goal, idx) => {
          let met = false;
          let displayValue = '';
          
          if (goal.label === 'OPEX') {
            met = opexDelta <= goal.target;
            displayValue = `${formatDecimal(opexDelta * 100, 1)}%`;
          } else if (goal.label === 'Latency') {
            met = latencyDeltaMs <= goal.target;
            displayValue = `${formatDecimal(latencyDeltaMs, 1)} ms`;
          } else if (goal.label === 'Carbon') {
            met = carbonDelta <= goal.target;
            displayValue = `${formatDecimal(carbonDelta * 100, 1)}%`;
          } else if (goal.label === 'Energy Stress') {
            met = goal.value >= goal.target;
            displayValue = `${formatDecimal(goal.value * 100, 0)}%`;
          } else if (goal.label === 'Breakpoint') {
            met = goal.value >= goal.target;
            displayValue = goal.value >= goal.target ? 'Reached' : 'Not reached';
          } else if (goal.label === 'Orbit Share') {
            met = goal.value >= goal.target;
            displayValue = `${formatDecimal(goal.value * 100, 1)}%`;
          } else {
            met = goal.value <= goal.target;
            displayValue = formatDecimal(goal.value, 2);
          }

          return (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{goal.label}:</span>
              <span className={met ? 'text-green-400' : 'text-yellow-400'}>
                {displayValue} {met ? '✓' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Overall Progress */}
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
        <div className="pt-3 border-t border-gray-700">
          <div className="text-xs font-semibold text-gray-300 mb-1">Suggested moves:</div>
          <div className="text-xs text-gray-400">
            {state.suggestedMoves.join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}

