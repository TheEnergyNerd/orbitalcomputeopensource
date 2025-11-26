"use client";

import { useState } from "react";
import { useSandboxStore, type TechLevel, type OrbitMode, type LaunchProvider, type DensityMode } from "../store/sandboxStore";

export default function AdvancedControls() {
  const {
    techLevel,
    orbitMode,
    launchProvider,
    offloadPct,
    densityMode,
    setTechLevel,
    setOrbitMode,
    setLaunchProvider,
    setOffloadPct,
    setDensityMode,
    unlockedTech,
    unlockedOrbitModes,
    unlockedLaunchProviders,
  } = useSandboxStore();

  const [isExpanded, setIsExpanded] = useState(true); // Expanded by default so users can see it

  return (
    <div className="mt-4 border-t border-gray-700/50 pt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-sm font-semibold text-gray-300 hover:text-white transition"
      >
        <span>Advanced Controls</span>
        <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Tech Level */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Orbit Tech Level
            </label>
            <select
              value={techLevel}
              onChange={(e) => setTechLevel(Number(e.target.value) as TechLevel)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-accent-blue"
            >
              <option value={1}>
                Tier 1: +5ms latency, +20% power
              </option>
              <option value={2}>
                Tier 2: Baseline
              </option>
              <option value={3} disabled={!unlockedTech.includes("tech_level_3")}>
                Tier 3: -10% latency, -10% power {!unlockedTech.includes("tech_level_3") && "🔒"}
              </option>
              <option value={4} disabled={!unlockedTech.includes("tech_level_4")}>
                Tier 4: -30% cooling, +10% capex {!unlockedTech.includes("tech_level_4") && "🔒"}
              </option>
            </select>
          </div>

          {/* Orbit Mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Orbital Altitude Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["LEO", "MEO", "GEO"] as OrbitMode[]).map((mode) => {
                const isUnlocked = unlockedOrbitModes.includes(mode);
                return (
                  <button
                    key={mode}
                    onClick={() => isUnlocked && setOrbitMode(mode)}
                    disabled={!isUnlocked}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition relative ${
                      !isUnlocked
                        ? "bg-gray-900 text-gray-600 cursor-not-allowed opacity-50"
                        : orbitMode === mode
                        ? "bg-accent-blue text-dark-bg"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {mode}
                    {!isUnlocked && <span className="absolute top-0 right-0 text-[8px]">🔒</span>}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {orbitMode === "LEO" && "−10ms, +20% capex, 1.4× sats"}
              {orbitMode === "MEO" && "Baseline"}
              {orbitMode === "GEO" && "+200ms, −40% capex, 3× coverage"}
            </div>
          </div>

          {/* Launch Provider */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Launch Provider
            </label>
            <select
              value={launchProvider}
              onChange={(e) => setLaunchProvider(e.target.value as LaunchProvider)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-accent-blue"
            >
              <option value="Rideshare" disabled={!unlockedLaunchProviders.includes("Rideshare")}>
                Rideshare: 0.7× cost, 2× time, 3% risk {!unlockedLaunchProviders.includes("Rideshare") && "🔒"}
              </option>
              <option value="F9" disabled={!unlockedLaunchProviders.includes("F9")}>
                F9: Baseline (1× cost, 1× time, 1% risk) {!unlockedLaunchProviders.includes("F9") && "🔒"}
              </option>
              <option value="Starship" disabled={!unlockedLaunchProviders.includes("Starship")}>
                Starship: 0.4× cost, 0.5× time, 2% risk {!unlockedLaunchProviders.includes("Starship") && "🔒"}
              </option>
              <option value="NuclearTug" disabled={!unlockedLaunchProviders.includes("NuclearTug")}>
                Nuclear Tug: 1.5× cost, 0.3× time, 0.2% risk {!unlockedLaunchProviders.includes("NuclearTug") && "🔒"}
              </option>
            </select>
          </div>

          {/* Ground Offload Strategy */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Ground Offload: {offloadPct}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={offloadPct}
              onChange={(e) => setOffloadPct(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0% (All Ground)</span>
              <span>100% (All Orbit)</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Weighted latency, +0.2× resilience per %, −0.1× energy per %
            </div>
          </div>

          {/* Constellation Density Mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Constellation Density Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Safe", "Aggressive", "Optimized"] as DensityMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDensityMode(mode)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    densityMode === mode
                      ? "bg-accent-blue text-dark-bg"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {densityMode === "Safe" && "−5ms, 0.5× failure risk, 1.2× build time"}
              {densityMode === "Aggressive" && "−10ms, 1.5× failure risk, 2× debris risk"}
              {densityMode === "Optimized" && "−7ms, baseline risk, 1.1× energy efficiency"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

