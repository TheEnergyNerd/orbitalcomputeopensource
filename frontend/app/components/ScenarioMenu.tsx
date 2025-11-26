"use client";

import { useState } from "react";
import { useSimStore, Scenario } from "../store/simStore";
import { useScenarioUpdate } from "../hooks/useScenarioUpdate";

const scenarioInfo: Record<Scenario, string> = {
  normal: "Baseline operation",
  price_spike: "Ground energy prices spike",
  solar_storm: "Solar activity degrades orbit capacity",
  fiber_cut: "Fiber issue forces reroutes",
};

export default function ScenarioMenu() {
  const scenario = useSimStore((s) => s.scenario);
  const orbitOffloadPercent = useSimStore((s) => s.orbitOffloadPercent);
  const { updateScenario } = useScenarioUpdate();
  const setScenario = useSimStore((s) => s.setScenario);
  const setOrbitOffloadPercent = useSimStore((s) => s.setOrbitOffloadPercent);

  const [open, setOpen] = useState(false);
  const [showSlider, setShowSlider] = useState(false);

  const handleScenarioChange = (mode: Scenario) => {
    setScenario(mode);
    updateScenario(mode, undefined);
    setOpen(false);
  };

  const handleOffloadChange = (value: number) => {
    setOrbitOffloadPercent(value);
    updateScenario(undefined, value);
  };

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed top-16 left-6 text-sm tracking-wide uppercase bg-accent-blue/80 hover:bg-accent-blue text-dark-bg px-4 py-2 rounded-full shadow-lg transition-all z-30"
      >
        Scenarios ▾
      </button>
      {open && (
        <div className="fixed top-28 left-6 w-64 sm:w-72 max-w-[calc(100vw-12px)] panel-glass rounded-2xl p-3 sm:p-4 shadow-2xl z-40 border border-white/10">
          <h3 className="text-sm font-semibold text-gray-200 mb-3">Select scenario</h3>
          <div className="space-y-2">
            {(Object.keys(scenarioInfo) as Scenario[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleScenarioChange(mode)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all ${
                  scenario === mode
                    ? "bg-accent-blue/20 text-white border border-accent-blue/40"
                    : "bg-transparent text-gray-300 border border-white/5 hover:border-accent-blue/30"
                }`}
              >
                <div className="text-sm font-semibold capitalize">{mode.replace("_", " ")}</div>
                <div className="text-xs text-gray-400">{scenarioInfo[mode]}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-white/5 pt-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-400 mb-1">
              <span>Orbit offload</span>
              <button
                className="text-accent-blue hover:text-white transition text-xs"
                onClick={() => setShowSlider((prev) => !prev)}
              >
                {showSlider ? "Hide slider" : "Adjust"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-white">{orbitOffloadPercent}%</span>
              <div className="text-xs text-gray-400">jobs to orbit</div>
            </div>
            {showSlider && (
              <input
                type="range"
                min={0}
                max={100}
                value={orbitOffloadPercent}
                onChange={(e) => handleOffloadChange(Number(e.target.value))}
                className="mt-2 w-full accent-accent-blue"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

