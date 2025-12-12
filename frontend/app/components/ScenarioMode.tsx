"use client";

import { useEffect, useState } from "react";
import { useScenarioStore, SCENARIOS, type ScenarioId } from "../store/scenarioStore";
import { showToast } from "../lib/utils/toast";
import { useSimulationStore } from "../store/simulationStore";

export default function ScenarioMode() {
  const { activeScenario, setActiveScenario, getNarrativeEvents, markNarrativeShown, getActiveConstraints } = useScenarioStore();
  const timeline = useSimulationStore((s) => s.timeline);
  const currentYear = timeline && timeline.length > 0 ? timeline[timeline.length - 1]?.year : 2025;
  
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId | null>(null);
  
  // Check for narrative events
  useEffect(() => {
    if (!activeScenario) return;
    
    const events = getNarrativeEvents(currentYear);
    events.forEach(event => {
      showToast(`${event.title}: ${event.message}`, 'info');
      markNarrativeShown(activeScenario, currentYear);
    });
  }, [currentYear, activeScenario, getNarrativeEvents, markNarrativeShown]);
  
  if (!activeScenario && !selectedScenario) {
    return (
      <div className="panel-glass p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Story Mode</h3>
        <p className="text-sm text-gray-300 mb-4">Choose a scenario to play:</p>
        <div className="space-y-2">
          {Object.values(SCENARIOS).map(scenario => (
            <button
              key={scenario.id}
              onClick={() => setSelectedScenario(scenario.id)}
              className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
            >
              <div className="font-semibold">{scenario.title}</div>
              <div className="text-xs text-gray-400">{scenario.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  
  if (selectedScenario && !activeScenario) {
    const scenario = SCENARIOS[selectedScenario];
    return (
      <div className="panel-glass p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">{scenario.title}</h3>
        <p className="text-sm text-gray-300 mb-4">{scenario.description}</p>
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2">Goals:</div>
          {scenario.goals.map((goal, i) => (
            <div key={i} className="text-xs text-gray-400 mb-1">
              • {goal.description} by {goal.byYear}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setActiveScenario(selectedScenario);
              setSelectedScenario(null);
            }}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-semibold"
          >
            Start Scenario
          </button>
          <button
            onClick={() => setSelectedScenario(null)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  
  const scenario = activeScenario ? SCENARIOS[activeScenario] : null;
  if (!scenario) return null;
  
  const constraints = getActiveConstraints(currentYear);
  
  return (
    <div className="panel-glass p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{scenario.title}</h3>
        <button
          onClick={() => setActiveScenario(null)}
          className="text-gray-400 hover:text-white text-sm"
        >
          Exit
        </button>
      </div>
      <div className="text-xs text-gray-300 mb-3">Year: {currentYear} / {scenario.endYear}</div>
      {constraints.length > 0 && (
        <div className="text-xs text-yellow-400 mb-2">
          Active Constraints: {constraints.map(c => c.type).join(", ")}
        </div>
      )}
      <div className="text-xs">
        <div className="font-semibold mb-1">Goals:</div>
        {scenario.goals.map((goal, i) => (
          <div key={i} className="text-gray-400">
            • {goal.description}
          </div>
        ))}
      </div>
    </div>
  );
}

