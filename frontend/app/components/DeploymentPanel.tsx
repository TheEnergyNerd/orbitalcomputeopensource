"use client";

import { useSandboxStore } from "../store/sandboxStore";
import LaunchControlsPanel from "./deployment/LaunchControlsPanel";
import LaunchImpactPanel from "./deployment/LaunchImpactPanel";
import DeploymentTopStrip from "./deployment/DeploymentTopStrip";
import LaunchAnimation from "./deployment/LaunchAnimation";
import LaunchGlobeEffects from "./deployment/LaunchGlobeEffects";
import DeploymentTutorial from "./deployment/DeploymentTutorial";

export default function DeploymentPanel() {
  const { simState } = useSandboxStore();

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading deployment state...</div>;
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 10 }}>
      {/* Top Strip */}
      <DeploymentTopStrip />
      
      {/* Launch Animation Overlay */}
      <LaunchAnimation />
      <LaunchGlobeEffects />
      
      {/* Deployment Tutorial */}
      <DeploymentTutorial />
      
      {/* Main Layout */}
      <div className="flex-1 flex gap-4 pt-12 pb-4 px-4">
        {/* Left Column - Launch Controls */}
        <div className="w-80 flex-shrink-0">
          <LaunchControlsPanel />
        </div>
        
        {/* Center - Globe (reuse existing) */}
        <div className="flex-1 min-w-0">
          {/* Globe is rendered separately in page.tsx */}
        </div>
        
        {/* Right Column - Launch Impact */}
        <div className="w-80 flex-shrink-0">
          <LaunchImpactPanel />
        </div>
      </div>
    </div>
  );
}

