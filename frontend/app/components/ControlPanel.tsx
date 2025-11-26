"use client";

import { useSimStore } from "../store/simStore";
import { useScenarioUpdate } from "../hooks/useScenarioUpdate";
import { useState, useEffect } from "react";

export default function ControlPanel() {
  const state = useSimStore((s) => s.state);
  const scenario = useSimStore((s) => s.scenario);
  const orbitOffloadPercent = useSimStore((s) => s.orbitOffloadPercent);
  const performanceMode = useSimStore((s) => s.performanceMode);
  const setScenario = useSimStore((s) => s.setScenario);
  const setOrbitOffloadPercent = useSimStore((s) => s.setOrbitOffloadPercent);
  const setPerformanceMode = useSimStore((s) => s.setPerformanceMode);
  const { updateScenario } = useScenarioUpdate();
  const [orbitOffload, setOrbitOffload] = useState(30);

  // Sync with state when it loads
  useEffect(() => {
    setOrbitOffload(orbitOffloadPercent);
  }, [orbitOffloadPercent]);

  if (!state) return null;

  const handleScenarioChange = (mode: string) => {
    setScenario(mode as any);
    updateScenario(mode, undefined);
  };

  const handleOrbitOffloadChange = (value: number) => {
    setOrbitOffload(value);
    setOrbitOffloadPercent(value);
    updateScenario(undefined, value);
  };

  const scenarioInfo: Record<string, string> = {
    normal: "Baseline operation - no disruptions",
    price_spike: "Energy prices spike 2.5x - orbital compute becomes more attractive",
    solar_storm: "Solar activity degrades satellite capacity and increases latency",
    fiber_cut: "Fiber cut in NoVA region forces traffic through orbital links",
  };

  return (
    <div className="fixed top-6 left-6 panel-glass rounded-xl p-5 w-80 z-20">
      <h2 className="text-xl font-bold text-accent-blue mb-5 tracking-tight">Scenario Control</h2>

      <div className="space-y-2.5 mb-5">
        <button
          onClick={() => handleScenarioChange("normal")}
          className={`w-full px-4 py-2.5 rounded-lg btn-primary ${
            scenario === "normal"
              ? "bg-accent-blue text-dark-bg font-semibold"
              : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
          }`}
        >
          Normal
        </button>
        <button
          onClick={() => handleScenarioChange("price_spike")}
          className={`w-full px-4 py-2.5 rounded-lg btn-primary ${
            scenario === "price_spike"
              ? "bg-accent-orange text-white font-semibold"
              : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
          }`}
        >
          Price Spike
        </button>
        <button
          onClick={() => handleScenarioChange("solar_storm")}
          className={`w-full px-4 py-2.5 rounded-lg btn-primary ${
            scenario === "solar_storm"
              ? "bg-accent-orange text-white font-semibold"
              : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
          }`}
        >
          Solar Storm
        </button>
        <button
          onClick={() => handleScenarioChange("fiber_cut")}
          className={`w-full px-4 py-2.5 rounded-lg btn-primary ${
            scenario === "fiber_cut"
              ? "bg-accent-orange text-white font-semibold"
              : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
          }`}
        >
          Fiber Cut
        </button>
      </div>

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Offload to Orbit: <span className="text-accent-blue font-semibold">{orbitOffload}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={orbitOffload}
          onChange={(e) => setOrbitOffload(Number(e.target.value))}
          onMouseUp={(e) => handleOrbitOffloadChange(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => handleOrbitOffloadChange(Number((e.target as HTMLInputElement).value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
        />
        <p className="text-xs text-gray-400 mt-2">
          {orbitOffload}% of jobs routed to orbit
        </p>
      </div>

      <div className="p-4 bg-gray-800/40 rounded-lg border border-gray-700/30 mb-5">
        <p className="text-accent-blue font-semibold mb-2 text-sm">Current Mode:</p>
        <p className="text-gray-300 text-sm leading-relaxed">{scenarioInfo[scenario] || "Unknown"}</p>
      </div>

      {/* Performance Mode Toggle */}
      <div className="pt-5 border-t border-gray-700/50">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-gray-300">Performance Mode</div>
            <div className="text-xs text-gray-500 mt-1">
              Limit to 500 satellites for better performance
            </div>
          </div>
          <input
            type="checkbox"
            checked={performanceMode}
            onChange={(e) => setPerformanceMode(e.target.checked)}
            className="w-5 h-5 rounded accent-accent-blue cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}

