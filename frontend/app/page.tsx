"use client";

// import SandboxGlobe from "./components/SandboxGlobe"; // Cesium - not used
import OrbitalAdvantagePanelV2 from "./components/OrbitalAdvantagePanelV2";
import OnboardingTutorial from "./components/OnboardingTutorial";
import ModeTabs from "./components/ModeTabs";
import FactorySystemsPanelV2 from "./components/FactorySystemsPanelV2";
import OrbitPanel from "./components/OrbitPanel";
import MissionPanel from "./components/MissionPanel";
import DeploymentPanel from "./components/DeploymentPanel";
import OverviewSurface from "./components/OverviewSurface";
import AdvancedView from "./components/AdvancedView";
import DeploymentSurface from "./components/DeploymentSurface";
// V1 Simplified components
import V1OverviewSurface from "./components/v1/V1OverviewSurface";
import V1DeploymentSurface from "./components/v1/V1DeploymentSurface";
// New Orbit Sim components
import OrbitSimRoot from "./components/orbitSim/OrbitSimRoot";
import SimpleModeView from "./components/orbitSim/SimpleModeView";
import SurfaceTabs, { type SurfaceType } from "./components/SurfaceTabs";
import SystemOverviewView from "./components/orbitSim/SystemOverviewView";
import EconomicsView from "./components/orbitSim/EconomicsView";
import PhysicsEngineeringView from "./components/orbitSim/PhysicsEngineeringView";
import ScenariosView from "./components/orbitSim/ScenariosView";
import DetailPanel from "./components/DetailPanel";
import TimeScaleControl from "./components/TimeScaleControl";
import Toast from "./components/Toast";
import FuturesMarketView from "./components/futures/FuturesMarketView";
import ConstraintsRiskView from "./components/orbitSim/ConstraintsRiskView";
import PhysicsLimitsTab from "./components/PhysicsLimitsTab";
import { useEffect, useState } from "react";
import { useSimStore } from "./store/simStore";
import ErrorPanel from "./components/ErrorPanel";
// import { useCesiumViewer, getSafeMode } from "./hooks/useCesiumViewer"; // Cesium - not used
import { logGpuEvent } from "./lib/debugGpu";
import OrbitalScene from "./three/OrbitalScene";
import DebugHud from "./components/DebugHud";
import YearCounter from "./components/YearCounter";
import TutorialSystem from "./components/TutorialSystem";
import DebugExportPanel from "./components/DebugExportPanel";
import { SatelliteCounters } from "./components/SatelliteCounters";
import { PerformanceWarning } from "./components/PerformanceWarning";
import { VisualGlossary } from "./components/VisualGlossary";

// Always use lightweight Three.js globe (OrbitalScene)
export default function Home() {
  // Cesium removed - using Three.js OrbitalScene only
  const [activeSurface, setActiveSurface] = useState<SurfaceType>("overview");
  
  // Log GPU event on mount
  useEffect(() => {
    logGpuEvent("app_mounted", {});
  }, []);

  // Listen for navigation events from SimpleModeView tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleNavigate = (e: CustomEvent<{ surface: SurfaceType }>) => {
      setActiveSurface(e.detail.surface);
      // Also dispatch to update other components
      window.dispatchEvent(new CustomEvent('surface-changed', { detail: { surface: e.detail.surface } }));
    };
    window.addEventListener('navigate-surface', handleNavigate as EventListener);
    return () => {
      window.removeEventListener('navigate-surface', handleNavigate as EventListener);
    };
  }, []);
  const loading = useSimStore((s) => s.loading);
  const error = useSimStore((s) => s.error);
  // Sandbox tutorial auto-start is handled inside SandboxTutorial component
  
  // New OrbitSim doesn't need backend - don't block UI if backend is down
  // Only show loading if we're actually waiting for backend AND it's not a 500/404 error
  const shouldShowLoading = loading && !error;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto' }}>
      {/* Globe container - only show on overview and world tabs */}
      {(activeSurface === "overview" || activeSurface === "world") && (
        <div className="fixed inset-0 w-full h-full" style={{ pointerEvents: 'auto', zIndex: 0 }}>
          <OrbitalScene />
          <SatelliteCounters />
          <PerformanceWarning />
        </div>
      )}
      
      <main className="relative w-full" style={{ minHeight: '200vh', position: 'relative', zIndex: 2, pointerEvents: 'none', overflowY: 'auto' }}>
      

      {/* Loading overlay removed - new OrbitSim doesn't need backend */}
      {false && shouldShowLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-dark-bg/80 z-50">
          <div className="text-center panel-glass rounded-xl p-8 shadow-2xl">
            <div className="text-3xl font-bold text-accent-blue mb-4 font-mono">Loading Simulation...</div>
            <div className="text-md text-gray-300 font-mono">Initializing simulation...</div>
            <div className="mt-6 w-full bg-gray-700 rounded-full h-2.5">
              <div className="bg-accent-blue h-2.5 rounded-full animate-pulse" style={{ width: "100%" }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Always show UI - new OrbitSim doesn't need backend */}
      <>
        <Toast />
        <ErrorPanel />
        
        {/* Top: Surface Tabs */}
        <SurfaceTabs activeSurface={activeSurface} onSurfaceChange={setActiveSurface} />
        
        {/* Year Counter - only in overview */}
        <YearCounter activeSurface={activeSurface} />
        
        {/* Main Content - Surface-specific views */}
        {/* Globe is always visible as background */}
        {activeSurface === "overview" && (
          <>
            <SimpleModeView />
            <SystemOverviewView />
          </>
        )}
        
        {activeSurface === "world" && (
          <V1DeploymentSurface />
        )}
        
        {activeSurface === "futures" && (
          <ScenariosView />
        )}
        
        {activeSurface === "constraints" && (
          <ConstraintsRiskView />
        )}
        
        {activeSurface === "physics" && (
          <PhysicsEngineeringView />
        )}
        
        
        {/* Entity Detail Panel - shows when entity is selected (only in deployment section) */}
        <DetailPanel activeSurface={activeSurface} />
        
        {/* Debug HUD - dev mode only, only in futures tab */}
        <DebugHud activeSurface={activeSurface} />
        
        {/* Integrity HUD - always visible */}
        
        {/* Debug Export Panel - always visible */}
        <DebugExportPanel />
        
        {/* Tutorial System */}
        <TutorialSystem activeSurface={activeSurface} onSurfaceChange={setActiveSurface} />
        
        {/* Visual Glossary - show in world view */}
        {activeSurface === "world" && <VisualGlossary activeSurface={activeSurface} />}
      </>
      </main>
    </div>
  );
}


