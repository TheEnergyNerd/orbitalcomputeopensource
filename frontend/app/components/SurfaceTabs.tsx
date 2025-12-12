"use client";

import { useTutorialStore } from "../store/tutorialStore";

export type SurfaceType = "overview" | "world" | "futures" | "constraints" | "physics";

interface SurfaceTabsProps {
  activeSurface: SurfaceType;
  onSurfaceChange: (surface: SurfaceType) => void;
}

export default function SurfaceTabs({ activeSurface, onSurfaceChange }: SurfaceTabsProps) {
  const { startTutorial } = useTutorialStore();
  
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-gray-900/95 border-b border-gray-700 h-12 sm:h-14 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 pointer-events-auto overflow-x-auto">
      {/* Help button - hidden on mobile (shown in menu instead) */}
      <button
        onClick={startTutorial}
        className="hidden sm:block absolute left-2 sm:left-4 px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded transition bg-blue-600 hover:bg-blue-700 text-white"
        title="Start Tutorial"
      >
        Help
      </button>
      <button
        onClick={() => onSurfaceChange("overview")}
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[8px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "overview"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        SYSTEM OVERVIEW
      </button>
      <button
        onClick={() => onSurfaceChange("world")}
        data-tutorial-world-tab
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[8px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "world"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        WORLD VIEW
      </button>
      <button
        onClick={() => onSurfaceChange("futures")}
        data-tutorial-futures-tab
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[8px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "futures"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        FUTURES
      </button>
      <button
        onClick={() => onSurfaceChange("constraints")}
        data-tutorial-constraints-tab
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[8px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "constraints"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        CONSTRAINTS & RISK
      </button>
      <button
        onClick={() => onSurfaceChange("physics")}
        data-tutorial-physics-tab
        className={`px-2 sm:px-4 py-1.5 sm:py-2 text-[8px] sm:text-xs font-semibold rounded transition whitespace-nowrap ${
          activeSurface === "physics"
            ? "bg-cyan-500 text-white"
            : "text-gray-400 hover:text-white"
        }`}
      >
        PHYSICS & LIMITS
      </button>
    </div>
  );
}

