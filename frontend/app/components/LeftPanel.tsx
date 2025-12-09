"use client";

import { useState } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import MissionPanel from "./MissionPanel";
import FactorySystemsPanel from "./FactorySystemsPanel";

type Mode = "factory" | "orbit" | "missions";

interface LeftPanelProps {
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
}

export default function LeftPanel({ selectedNodeId: propSelectedNodeId, onSelectNode: propOnSelectNode }: LeftPanelProps = {}) {
  const { simState, orbitMode, setOrbitMode, unlockedOrbitModes } = useSandboxStore();
  const [activeMode, setActiveMode] = useState<Mode>("factory");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [internalSelectedNode, setInternalSelectedNode] = useState<string | null>(null);
  
  // Use prop if provided, otherwise use internal state
  const selectedNodeId = propSelectedNodeId !== undefined ? propSelectedNodeId : internalSelectedNode;
  const onSelectNode = propOnSelectNode || setInternalSelectedNode;

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
        className={`fixed top-[70px] left-6 w-64 z-40 panel-glass rounded-xl p-4 shadow-2xl border border-white/10 max-h-[calc(100vh-300px)] overflow-y-auto ${
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
          <FactorySystemsPanel />
        )}

        {activeMode === "orbit" && (
          <div className="space-y-4">
            <div className="text-xs text-gray-400">
              Orbit Mode: <span className="text-white font-semibold">LEO</span> (fixed)
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

