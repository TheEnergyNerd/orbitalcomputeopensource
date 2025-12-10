"use client";

import { useSimulationStore } from "../store/simulationStore";
import type { SurfaceType } from "./SurfaceTabs";
import { useEffect } from "react";

/**
 * YearCounter - Displays the current simulation year
 * Updates automatically when user advances the year
 * Only shown in overview tab
 * Includes deploy buttons above and AI Router/Constellation buttons below
 */
interface YearCounterProps {
  activeSurface: SurfaceType;
}

export default function YearCounter({ activeSurface }: YearCounterProps) {
  const { timeline, config, deployNextYear, extendYears } = useSimulationStore();
  
  const currentYear = timeline.length > 0 
    ? timeline[timeline.length - 1]?.year || config.startYear
    : config.startYear;

  // Listen for tutorial button clicks
  useEffect(() => {
    const handleDeploy1Year = () => deployNextYear();
    const handleDeploy5Years = () => extendYears(5);
    const handleOpenAiRouter = () => {
      const event = new CustomEvent('open-ai-router');
      window.dispatchEvent(event);
    };

    window.addEventListener('tutorial-deploy-1-year', handleDeploy1Year);
    window.addEventListener('tutorial-deploy-5-years', handleDeploy5Years);
    window.addEventListener('tutorial-open-ai-router', handleOpenAiRouter);

    return () => {
      window.removeEventListener('tutorial-deploy-1-year', handleDeploy1Year);
      window.removeEventListener('tutorial-deploy-5-years', handleDeploy5Years);
      window.removeEventListener('tutorial-open-ai-router', handleOpenAiRouter);
    };
  }, [deployNextYear, extendYears]);

  // Only show in overview tab
  if (activeSurface !== "overview") {
    return null;
  }

  return (
    <div className="fixed top-28 sm:top-24 right-2 sm:right-4 lg:right-6 pointer-events-none" style={{ zIndex: 200 }} data-tutorial-year-counter>
      {/* Year counter */}
      <div className="panel-glass rounded-lg px-4 py-3 border border-cyan-500/50 shadow-lg backdrop-blur-sm">
        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Year</div>
        <div className="text-3xl font-bold text-cyan-400 font-mono">
          {currentYear}
        </div>
      </div>
      
      {/* Control Buttons - Below Year Counter */}
      <div className="mt-3 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={deployNextYear}
          className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-lg transition"
          data-tutorial-deploy-button
        >
          Deploy 1 year
        </button>
        <button
          onClick={() => extendYears(5)}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition"
        >
          +5 years
        </button>
        <button
          onClick={() => {
            const event = new CustomEvent('open-ai-router');
            window.dispatchEvent(event);
          }}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition"
          data-tutorial-ai-router-button
        >
          AI Router
        </button>
      </div>
    </div>
  );
}
