"use client";

import { useEffect } from "react";

export type Mode = "overview" | "advanced" | "deployment" | "orbit" | "missions";

interface ModeTabsProps {
  activeMode: Mode;
  onModeChange: (mode: Mode) => void;
}

export default function ModeTabs({ activeMode, onModeChange }: ModeTabsProps) {
  // Listen for switchMode events from SimpleView
  useEffect(() => {
    const handleSwitchMode = (e: CustomEvent) => {
      onModeChange(e.detail as Mode);
    };
    window.addEventListener('switchMode' as any, handleSwitchMode);
    return () => window.removeEventListener('switchMode' as any, handleSwitchMode);
  }, [onModeChange]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 border-b border-gray-700/50">
      <div className="flex items-center justify-center gap-1 px-4 py-2">
        <button
          onClick={() => onModeChange("overview")}
          className={`px-4 py-2 text-sm font-semibold rounded-t transition ${
            activeMode === "overview"
              ? "bg-gray-800 text-accent-blue border-t border-x border-gray-700"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => onModeChange("advanced")}
          className={`px-4 py-2 text-sm font-semibold rounded-t transition ${
            activeMode === "advanced"
              ? "bg-gray-800 text-accent-blue border-t border-x border-gray-700"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Advanced
        </button>
        <button
          onClick={() => onModeChange("deployment")}
          className={`px-4 py-2 text-sm font-semibold rounded-t transition ${
            activeMode === "deployment"
              ? "bg-gray-800 text-accent-blue border-t border-x border-gray-700"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Deployment
        </button>
        <button
          onClick={() => onModeChange("orbit")}
          className={`px-4 py-2 text-sm font-semibold rounded-t transition ${
            activeMode === "orbit"
              ? "bg-gray-800 text-accent-blue border-t border-x border-gray-700"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Orbit
        </button>
        <button
          onClick={() => onModeChange("missions")}
          className={`px-4 py-2 text-sm font-semibold rounded-t transition ${
            activeMode === "missions"
              ? "bg-gray-800 text-accent-blue border-t border-x border-gray-700"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Missions
        </button>
      </div>
    </div>
  );
}

