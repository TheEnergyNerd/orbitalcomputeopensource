"use client";

import { useState } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import ResourceChainPanel from "./ResourceChainPanel";
import MachineCard from "./MachineCard";
import { getMachineUtilization } from "../lib/sim/engine";
import type { MachineId } from "../lib/sim/model";
import MissionPanel from "./MissionPanel";

type Mode = "factory" | "orbit" | "missions";

export default function LeftPanel() {
  const { simState, updateMachineLines, orbitMode, setOrbitMode, unlockedOrbitModes } = useSandboxStore();
  const [activeMode, setActiveMode] = useState<Mode>("factory");
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading simulation state...</div>;
  }

  const { machines, resources } = simState;

  return (
    <>
      {/* Mobile: Hamburger menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="sm:hidden fixed top-14 left-2 z-40 bg-gray-800/90 border border-gray-700 rounded-lg p-2 text-white"
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div
        className={`fixed top-[70px] left-6 w-80 z-40 panel-glass rounded-xl p-4 shadow-2xl border border-white/10 ${
          isMobileOpen ? "block" : "hidden sm:block"
        }`}
      >
        {/* Mode buttons */}
        <div className="flex gap-1 mb-4 border-b border-gray-700/50 pb-2">
          <button
            onClick={() => setActiveMode("factory")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeMode === "factory"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Factory
          </button>
          <button
            onClick={() => setActiveMode("orbit")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeMode === "orbit"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Orbit
          </button>
          <button
            onClick={() => setActiveMode("missions")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeMode === "missions"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Missions
          </button>
        </div>

        {/* Content */}
        {activeMode === "factory" && (
          <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            <ResourceChainPanel />
            
            <div className="mt-6 pt-4 border-t border-gray-700/50">
              <div className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                Machines
              </div>
              <div className="space-y-3">
                {(Object.keys(machines) as MachineId[]).map((machineId) => {
                  const machine = machines[machineId];
                  const utilization = getMachineUtilization(machine, resources);
                  return (
                    <MachineCard
                      key={machineId}
                      machine={machine}
                      utilization={utilization}
                      onChangeLines={(lines) => updateMachineLines(machineId, lines)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeMode === "orbit" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Orbit Mode</label>
              <div className="flex gap-2">
                {(["LEO", "MEO", "GEO"] as Array<"LEO" | "MEO" | "GEO">).map((mode) => {
                  const isUnlocked = unlockedOrbitModes.includes(mode);
                  return (
                    <button
                      key={mode}
                      onClick={() => isUnlocked && setOrbitMode(mode)}
                      disabled={!isUnlocked}
                      className={`px-3 py-1.5 text-xs rounded transition ${
                        !isUnlocked
                          ? "bg-gray-900 text-gray-600 opacity-50 cursor-not-allowed"
                          : orbitMode === mode
                          ? "bg-accent-blue text-white"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Pod Type</label>
              <select className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300">
                <option>Tier 1 Pod (150 kW)</option>
                <option>Tier 2 Pod (1 MW)</option>
                <option>Tier 3 Pod (5 MW)</option>
              </select>
            </div>
          </div>
        )}

        {activeMode === "missions" && (
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <MissionPanel />
          </div>
        )}
      </div>
    </>
  );
}

