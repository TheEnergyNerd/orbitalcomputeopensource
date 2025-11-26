"use client";

import { useState } from "react";

export type AppMode = "simulator" | "sandbox";

interface ModeSwitcherProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export default function ModeSwitcher({ currentMode, onModeChange }: ModeSwitcherProps) {
  return (
    <div className="fixed top-6 left-6 z-[100] flex gap-2 max-w-[calc(100vw-12px)]">
      <button
        onClick={() => onModeChange("simulator")}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
          currentMode === "simulator"
            ? "bg-accent-blue text-dark-bg"
            : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
        }`}
      >
        Current State
      </button>
      <button
        onClick={() => onModeChange("sandbox")}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
          currentMode === "sandbox"
            ? "bg-accent-blue text-dark-bg"
            : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
        }`}
      >
        Sandbox
      </button>
    </div>
  );
}

