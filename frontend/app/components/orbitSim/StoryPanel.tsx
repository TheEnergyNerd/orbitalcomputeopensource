"use client";

import React, { useState } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface StoryBeat {
  id: string;
  title: string;
  description: string;
  scenario: ScenarioMode;
  targetYear: number;
  highlightCharts: string[]; // Chart IDs to highlight
}

/**
 * Scrollytelling Story Panel
 * - Vertical sidebar with 3-4 story beats
 * - Each beat sets scenario, jumps year slider, highlights relevant visuals
 * - Orchestration layer - no new chart type needed
 */
export default function StoryPanel() {
  const { config, updateConfig, timeline } = useSimulationStore();
  const [activeBeat, setActiveBeat] = useState<string | null>(null);

  const storyBeats: StoryBeat[] = [
    {
      id: "baseline-start",
      title: "Baseline Scenario",
      description: "Starting with conservative tech growth assumptions. Watch how orbital compute evolves under baseline conditions.",
      scenario: "BASELINE",
      targetYear: 2025,
      highlightCharts: ["power-compute-frontier", "opex-streamgraph"]
    },
    {
      id: "bull-scenario",
      title: "Orbital Bull Case",
      description: "What if launch costs drop faster and tech advances accelerate? Explore the optimistic scenario.",
      scenario: "ORBITAL_BULL",
      targetYear: 2030,
      highlightCharts: ["power-compute-frontier", "cost-compute", "carbon-river"]
    },
    {
      id: "bear-scenario",
      title: "Orbital Bear Case",
      description: "Conservative assumptions: slower tech progress, higher launch costs. How does orbital compute fare?",
      scenario: "ORBITAL_BEAR",
      targetYear: 2035,
      highlightCharts: ["opex-streamgraph", "constraint-dial"]
    },
    {
      id: "crossover",
      title: "The Crossover",
      description: "The moment orbital compute becomes cheaper than ground. Watch the cost curves converge.",
      scenario: "BASELINE",
      targetYear: 2032,
      highlightCharts: ["cost-compute", "opex-streamgraph", "carbon-river"]
    }
  ];

  const handleBeatClick = (beat: StoryBeat) => {
    setActiveBeat(beat.id);
    
    // Update scenario
    if (config.scenarioMode !== beat.scenario) {
      updateConfig({ scenarioMode: beat.scenario });
    }

    // Jump to target year (if available in timeline)
    const targetStep = timeline.find(step => step.year === beat.targetYear);
    if (targetStep) {
      // Dispatch custom event to jump to year
      const event = new CustomEvent('jumpToYear', { 
        detail: { year: beat.targetYear } 
      });
      window.dispatchEvent(event);
    }

    // Highlight relevant charts
    beat.highlightCharts.forEach(chartId => {
      const chartElement = document.getElementById(chartId);
      if (chartElement) {
        chartElement.classList.add("ring-2", "ring-amber-500", "ring-opacity-50");
        setTimeout(() => {
          chartElement.classList.remove("ring-2", "ring-amber-500", "ring-opacity-50");
        }, 3000);
      }
    });
  };

  return (
    <div className="w-full max-w-xs bg-slate-900/95 border border-slate-800 rounded-lg p-4">
      <div className="text-sm font-semibold text-slate-100 mb-3">
        Story Beats
      </div>
      
      <div className="space-y-2">
        {storyBeats.map((beat, index) => (
          <button
            key={beat.id}
            onClick={() => handleBeatClick(beat)}
            className={`w-full text-left p-3 rounded-lg border transition ${
              activeBeat === beat.id
                ? "bg-amber-600/20 border-amber-500/50"
                : "bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600"
            }`}
          >
            <div className="flex items-start gap-2 mb-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                activeBeat === beat.id
                  ? "bg-amber-600 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}>
                {index + 1}
              </div>
              <div className="flex-1">
                <div className={`text-xs font-semibold mb-1 ${
                  activeBeat === beat.id ? "text-amber-200" : "text-slate-200"
                }`}>
                  {beat.title}
                </div>
                <div className="text-[10px] text-slate-400 mb-2">
                  {beat.description}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="px-1.5 py-0.5 bg-slate-700 rounded">
                    {beat.scenario.replace("_", " ")}
                  </span>
                  <span>→ {beat.targetYear}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-700 text-[10px] text-slate-500">
        Click a beat to jump to that scenario and year. Charts will highlight automatically.
      </div>
    </div>
  );
}

