"use client";

import SandboxGlobe from "./components/SandboxGlobe";
import DetailPanel from "./components/DetailPanel";
// Removed old components: SandboxControls, SandboxMetrics, SimulationFeedback, DeploymentQueue, DeploymentTimeDisplay
import SandboxVisualizations from "./components/SandboxVisualizations";
import NewTutorial from "./components/NewTutorial";
import MissionPanel from "./components/MissionPanel";
import LeftPanel from "./components/LeftPanel";
import KpiBar from "./components/KpiBar";
import SunClockSimplified from "./components/SunClockSimplified";
import TimeScaleControl from "./components/TimeScaleControl";
import SandboxModeSwitcher from "./components/SandboxModeSwitcher";
import FactoryView from "./components/factory/FactoryView";
import { useEffect } from "react";
import { useSimStore } from "./store/simStore";
import { useSandboxStore } from "./store/sandboxStore";
import GlobePositionDebug from "./components/GlobePositionDebug";
import SunClock from "./components/SunClock";
import ErrorPanel from "./components/ErrorPanel";
import { useCesiumViewer, getSafeMode } from "./hooks/useCesiumViewer";
import { logGpuEvent } from "./lib/debugGpu";

export default function Home() {
  // Use shared Cesium viewer hook - single instance for entire app
  const viewerRef = useCesiumViewer("cesium-globe-container");
  const safeMode = getSafeMode();
  
  // Log GPU event on mount
  useEffect(() => {
    logGpuEvent("app_mounted", { safeMode });
  }, [safeMode]);
  const loading = useSimStore((s) => s.loading);
  const error = useSimStore((s) => s.error);
  // Sandbox tutorial auto-start is handled inside SandboxTutorial component

  return (
    <main className="fixed inset-0 w-full h-full overflow-hidden bg-dark-bg">
      {/* Single shared globe container - viewer is managed by hook */}
      <div id="cesium-globe-container" className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }} />
      
      {/* Globe Rendering - sandbox only, components just add entities */}
      <SandboxGlobe viewerRef={viewerRef} />

      {loading && (
        <div className="fixed inset-0 flex items-center justify-center bg-dark-bg/80 z-50">
          <div className="text-center panel-glass rounded-xl p-8 shadow-2xl">
            <div className="text-3xl font-bold text-accent-blue mb-4 font-mono">Loading Simulation...</div>
            <div className="text-md text-gray-300 font-mono">Connecting to backend and initializing 3D globe</div>
            {error && (
              <div className="mt-4 text-sm text-accent-orange font-mono">
                {error}
              </div>
            )}
            <div className="mt-6 w-full bg-gray-700 rounded-full h-2.5">
              <div className="bg-accent-blue h-2.5 rounded-full animate-pulse" style={{ width: "100%" }}></div>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <GlobePositionDebug viewerRef={viewerRef} />
          <ErrorPanel />
          <SandboxModeSwitcher />
          <LeftPanel />
          <SunClockSimplified />
          <TimeScaleControl />
          <KpiBar />
          <FactoryView />
          <SandboxVisualizations />
          <NewTutorial />
          <DetailPanel />
        </>
      )}
    </main>
  );
}

