"use client";

import { useState, useRef, useEffect } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";
import type { ScenarioKey } from "../../lib/orbitSim/debugState";

/**
 * Scenario Menu Dropdown
 * Shows Baseline, Orbital Bull, and Orbital Bear options
 */
export default function ScenarioMenu() {
  const { selectedScenarioKey, setSelectedScenarioKey } = useSimulationStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const scenarios = [
    { id: "BASELINE" as ScenarioKey, label: "Baseline", color: "emerald", description: "Moderate assumptions" },
    { id: "ORBITAL_BULL" as ScenarioKey, label: "Orbital Bull", color: "cyan", description: "Optimistic tech progress" },
    { id: "ORBITAL_BEAR" as ScenarioKey, label: "Orbital Bear", color: "orange", description: "Conservative assumptions" },
  ];

  const currentScenario = scenarios.find(s => s.id === selectedScenarioKey) || scenarios[0];

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [open]);

  const handleScenarioChange = (scenario: ScenarioKey) => {
    // Use setSelectedScenarioKey instead of updateConfig - this only changes which scenario is displayed
    // It does NOT trigger a recompute or overwrite debug state
    setSelectedScenarioKey(scenario);
    setOpen(false);
  };

  const handleToggle = () => {
    setOpen(prev => !prev);
  };

  return (
    <div className="relative w-full" ref={menuRef} style={{ zIndex: 1000 }}>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggle();
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-600 w-full"
        type="button"
      >
        <span>Scenario:</span>
        <span className={`font-medium ${
          currentScenario.id === "BASELINE" ? "text-emerald-400" :
          currentScenario.id === "ORBITAL_BULL" ? "text-cyan-400" :
          "text-orange-400"
        }`}>
          {currentScenario.label}
        </span>
        <span className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div 
          className="absolute top-full left-0 mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden"
          style={{ zIndex: 1001 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 space-y-1">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleScenarioChange(scenario.id);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all border ${
                  selectedScenarioKey === scenario.id
                    ? scenario.id === "BASELINE"
                      ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-400"
                      : scenario.id === "ORBITAL_BULL"
                      ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-400"
                      : "bg-orange-500/20 border-orange-400/40 text-orange-400"
                    : "bg-transparent border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white"
                }`}
                type="button"
                style={{ pointerEvents: 'auto' }}
              >
                <div className="text-sm font-semibold">{scenario.label}</div>
                <div className="text-xs text-slate-400">{scenario.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

