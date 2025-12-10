"use client";

import { useTutorialStore } from "../store/tutorialStore";

export type SurfaceType = "overview" | "deployment" | "futures" | "constraints";

interface SurfaceTabsProps {
  activeSurface: SurfaceType;
  onSurfaceChange: (surface: SurfaceType) => void;
}

export default function SurfaceTabs({ activeSurface, onSurfaceChange }: SurfaceTabsProps) {
  const { startTutorial } = useTutorialStore();
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 border-b border-gray-700 h-12 sm:h-14 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 pointer-events-auto overflow-x-auto">
      {/* Help button */}
      <button
        onClick={startTutorial}
        className="absolute left-2 sm:left-4 px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded transition bg-blue-600 hover:bg-blue-700 text-white"
        title="Start Tutorial"
      >
        Help
      </button>
      <button
        onClick={() => onSurfaceChange("overview")}
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "overview"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        OVERVIEW
      </button>
      <button
        onClick={() => onSurfaceChange("deployment")}
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "deployment"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
        data-tutorial-deployment-tab
      >
        WORLD VIEW
      </button>
      <button
        onClick={() => onSurfaceChange("futures")}
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "futures"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
        data-tutorial-futures-tab
      >
        FUTURES
      </button>
      <button
        onClick={() => onSurfaceChange("constraints")}
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "constraints"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        CONSTRAINTS & RISK
      </button>
    </div>
  );
}

