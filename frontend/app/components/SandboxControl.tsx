"use client";

import { useState, useEffect } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import SurgeEventDemo from "./SurgeEventDemo";
import BuildPanel from "./BuildPanel";

export default function SandboxControl() {
  const { orbitalComputeUnits, addOrbitalCompute, setOrbitalComputeUnits, setGroundDCReduction, groundDCReduction, setPreset, currentPreset, resetSandbox } = useSandboxStore();
  const { getDeployedUnits, startBuild, getQueuedUnits, reset: resetUnits } = useOrbitalUnitsStore();
  const state = useSimStore((s) => s.state);
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  
  const handleReset = () => {
    resetUnits();
    resetSandbox();
  };
  
  const deployedUnits = getDeployedUnits();
  const queuedUnits = getQueuedUnits();
  
  // Auto-start building queued units
  useEffect(() => {
    queuedUnits.forEach((unit) => {
      if (unit.status === "queued") {
        startBuild(unit.id);
      }
    });
  }, [queuedUnits, startBuild]);

  // Calculate orbit share
  const totalCompute = orbitalComputeUnits + (100 - groundDCReduction);
  const orbitShare = totalCompute > 0 ? (orbitalComputeUnits / totalCompute) * 100 : 0;

  return (
    <div className="fixed top-6 right-6 z-40 panel-glass rounded-xl p-3 sm:p-6 w-64 sm:w-80 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10">
      <h2 className="text-xl font-bold text-accent-blue mb-4">Compute Expansion Sandbox</h2>

      {/* Build System */}
      <div className="mb-6">
        <button
          onClick={() => setBuildPanelOpen(true)}
          className="w-full px-6 py-4 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg font-semibold text-lg transition-all hover:scale-105 shadow-lg mb-3"
        >
          🚀 Deploy Orbital Unit
        </button>
        <BuildPanel isOpen={buildPanelOpen} onClose={() => setBuildPanelOpen(false)} />
        
        {deployedUnits.length > 0 && (
          <div className="text-xs text-gray-400 text-center mb-2">
            Deployed: {deployedUnits.length} units
          </div>
        )}
        
        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-all mt-3"
        >
          Reset Sandbox
        </button>
        <div className="text-xs text-gray-400 text-center mb-2">
          Units: {orbitalComputeUnits} | Share: {orbitShare.toFixed(1)}%
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={orbitalComputeUnits}
          onChange={(e) => setOrbitalComputeUnits(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
        />
      </div>

      {/* Ground DC Reduction */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Reduce Ground DCs: {groundDCReduction}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={groundDCReduction}
          onChange={(e) => setGroundDCReduction(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-orange"
        />
      </div>

      {/* Presets */}
      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-300 mb-2">Presets</div>
        <div className="grid grid-cols-2 gap-2">
          <PresetButton
            label="All Earth"
            active={currentPreset === "all_earth"}
            onClick={() => setPreset("all_earth")}
          />
          <PresetButton
            label="Hybrid 2035"
            active={currentPreset === "hybrid_2035"}
            onClick={() => setPreset("hybrid_2035")}
          />
          <PresetButton
            label="Orbit-Dominant"
            active={currentPreset === "orbit_dominant_2060"}
            onClick={() => setPreset("orbit_dominant_2060")}
          />
          <PresetButton
            label="100% Orbit"
            active={currentPreset === "extreme_100_orbit"}
            onClick={() => setPreset("extreme_100_orbit")}
          />
        </div>
      </div>

      {/* Quick Stats */}
      {state && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Latency:</span>
            <span className="text-accent-blue font-semibold">
              {state.metrics.avgLatencyMs.toFixed(1)}ms
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Energy Cost:</span>
            <span className="text-accent-blue font-semibold">
              ${(state.metrics.energyCostGround + state.metrics.energyCostOrbit).toFixed(0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Carbon:</span>
            <span className="text-accent-green font-semibold">
              {state.metrics.carbonGround.toFixed(0)} kg
            </span>
          </div>
        </div>
      )}

      {/* Surge Event Demo Button */}
      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <button
          onClick={() => {
            // Trigger surge event
            const event = new CustomEvent("surge-event");
            window.dispatchEvent(event);
          }}
          className="w-full px-4 py-2 bg-accent-orange hover:bg-accent-orange/80 text-white rounded-lg text-sm font-semibold transition-all mb-3"
        >
          🎬 Demo: Surge Event
        </button>
        
        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-all"
        >
          🔄 Reset Sandbox
        </button>
      </div>
    </div>
  );
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
        active
          ? "bg-accent-blue text-dark-bg"
          : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
      }`}
    >
      {label}
    </button>
  );
}

