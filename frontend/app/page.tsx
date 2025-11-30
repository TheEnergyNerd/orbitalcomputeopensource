"use client";

import SandboxGlobe from "./components/SandboxGlobe";
import DetailPanel from "./components/DetailPanel";
// Removed old components: SandboxControls, SandboxMetrics, SimulationFeedback, DeploymentQueue, DeploymentTimeDisplay
import OrbitalAdvantagePanelV2 from "./components/OrbitalAdvantagePanelV2";
import OnboardingTutorial from "./components/OnboardingTutorial";
import ModeTabs from "./components/ModeTabs";
import FactorySystemsPanelV2 from "./components/FactorySystemsPanelV2";
import OrbitPanel from "./components/OrbitPanel";
import LeftPanel from "./components/LeftPanel";
import KpiBar from "./components/KpiBar";
import TimeScaleControl from "./components/TimeScaleControl";
import SandboxModeSwitcher from "./components/SandboxModeSwitcher";
import FactoryStrip from "./components/factory/FactoryStrip";
import FactoryHelpPanel from "./components/FactoryHelpPanel";
import FactoryStatusBar from "./components/factory/FactoryStatusBar";
import ShareFactoryButton from "./components/factory/ShareFactoryButton";
import FactoryNarrator, { useFactoryNarrator } from "./components/factory/FactoryNarrator";
import Toast from "./components/Toast";
import { useEffect, useState } from "react";
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
  const [factorySelectedNode, setFactorySelectedNode] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"factory" | "orbit" | "missions">("factory");
  
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
            <div className="text-md text-gray-300 font-mono">Initializing simulation...</div>
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
          <Toast />
          <GlobePositionDebug viewerRef={viewerRef} />
          <ErrorPanel />
          
          {/* Top: Mode Tabs */}
          <ModeTabs activeMode={activeMode} onModeChange={setActiveMode} />
          
          {/* Left Sidebar - Mode-specific content */}
          <div className="fixed top-[50px] left-6 w-64 z-40 panel max-h-[calc(100vh-100px)] overflow-y-auto">
            {activeMode === "factory" && <FactorySystemsPanelV2 />}
            {activeMode === "orbit" && <OrbitPanel />}
            {activeMode === "missions" && (
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                <MissionPanel />
              </div>
            )}
          </div>
          
          {/* Center - Globe (clean, unobstructed) */}
          <TimeScaleControl />
          
          {/* Bottom Center - Orbital Advantage Panel (docked) */}
          <OrbitalAdvantagePanelV2 />
          
          {/* Bottom - Mode-specific panels */}
          {activeMode === "factory" && (
            <FactoryStrip selectedNodeId={factorySelectedNode} onSelectNode={setFactorySelectedNode} highlightNodeId={null} />
          )}
          
          {/* Onboarding Tutorial */}
          <OnboardingTutorial />
        </>
      )}
    </main>
  );
}

