"use client";

import { useState, useEffect } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import BuildPanel from "./BuildPanel";
import CompactLatencyProbe from "./CompactLatencyProbe";

export default function SandboxControls() {
  const { 
    orbitalComputeUnits, 
    setOrbitalComputeUnits, 
    setGroundDCReduction, 
    groundDCReduction, 
    setPreset, 
    currentPreset, 
    resetSandbox,
    activeMissionId,
    sandboxMode,
    isTutorialActive,
    tutorialStep,
    nextTutorialStep,
  } = useSandboxStore();
  const { getDeployedUnits, startBuild, getQueuedUnits, reset: resetUnits, addToQueue } = useOrbitalUnitsStore();
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  
  const handleReset = () => {
    resetUnits();
    resetSandbox();
  };
  
  const deployedUnits = getDeployedUnits();
  const queuedUnits = getQueuedUnits();
  
  // Auto-start building queued units
  useEffect(() => {
    queuedUnits.forEach((unit) => {
      if (unit.status === "queued") {
        startBuild(unit.id);
      }
    });
  }, [queuedUnits, startBuild]);

  // Calculate actual deployed orbital capacity (MW)
  const deployedComputeCapacity = deployedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
  
  // Also include queued/building capacity for display purposes
  const queuedComputeCapacity = queuedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
  const buildingUnits = deployedUnits.filter(u => u.status === "building");
  const buildingComputeCapacity = buildingUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
  
  // Total orbital capacity (deployed + building + queued) for display
  const totalOrbitalCapacity = deployedComputeCapacity + buildingComputeCapacity + queuedComputeCapacity;
  
  // Realistic baseline: ~42 GW (42,000 MW) operational today
  // This matches the global data center capacity from Cushman & Wakefield 2025
  const BASE_GROUND_CAPACITY_GW = 42;
  const baseGroundCapacity = BASE_GROUND_CAPACITY_GW * 1000; // Convert to MW (42,000 MW)
  
  // Remaining ground capacity after reduction
  const remainingGroundCapacity = baseGroundCapacity * (1 - groundDCReduction / 100);
  
  // Total compute capacity = deployed orbital + remaining ground
  // For display, use total orbital capacity (including queued/building)
  const totalComputeCapacity = totalOrbitalCapacity + remainingGroundCapacity;
  
  // Orbit share is based on ACTUAL deployments, not just sliders
  // In freeplay: orbit share = deployed capacity / total capacity
  // In missions: orbit share can be set by slider, but requires deployments to achieve
  // Use total orbital capacity (including queued/building) for share calculation
  const actualOrbitShare = totalComputeCapacity > 0 
    ? (totalOrbitalCapacity / totalComputeCapacity) * 100 
    : 0;
  
  // In freeplay mode, orbit share is read-only (based on deployments)
  // In missions mode, we can show a target vs actual
  const orbitShare = sandboxMode === "freeplay" 
    ? actualOrbitShare 
    : actualOrbitShare; // For now, always use actual
  
  // Update sandbox store when deployments change (for freeplay mode)
  useEffect(() => {
    if (sandboxMode === "freeplay") {
      // Calculate equivalent orbital units from deployed capacity
      // Each LEO pod is ~0.15 MW, so deployedComputeCapacity / 0.15 ≈ units
      const equivalentUnits = Math.round(deployedComputeCapacity / 0.15);
      setOrbitalComputeUnits(equivalentUnits);
    }
  }, [deployedUnits.length, deployedComputeCapacity, sandboxMode, setOrbitalComputeUnits]);
  
  // Check if mission requires highlighting
  const shouldHighlightOrbit = activeMissionId === "stabilize_abilene" || activeMissionId === "surge_event";
  const shouldHighlightGround = activeMissionId === "stabilize_abilene";
  
  // Tutorial highlighting logic
  const shouldHighlightDeployButton = isTutorialActive && tutorialStep === 2;
  const shouldHighlightHybridButton = isTutorialActive && tutorialStep === 2;
  const shouldHighlightPresets = isTutorialActive && tutorialStep === 4;
  const shouldHighlightReset = isTutorialActive && tutorialStep === 4;
  const shouldHighlightSurgeButton = isTutorialActive && tutorialStep === 3;
  
  // Disable controls based on tutorial step
  const isDeployDisabled = isTutorialActive && (tutorialStep === 1 || tutorialStep === 2);
  const isPresetsDisabled = isTutorialActive && tutorialStep !== 2 && tutorialStep !== 4;
  const isResetDisabled = isTutorialActive && tutorialStep !== 4;
  
  // Trigger surge event for tutorial step 4
  const handleSurgeEvent = () => {
    const event = new CustomEvent("surge-event");
    window.dispatchEvent(event);
  };

  return (
    <>
      {/* Mobile: Floating action button */}
      <button
        onClick={() => setBuildPanelOpen(true)}
        disabled={isDeployDisabled}
        data-tutorial-target="build-panel-button"
        className={`sm:hidden fixed bottom-20 right-4 z-50 w-16 h-16 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-full font-semibold text-2xl transition-all shadow-lg flex items-center justify-center ${
          shouldHighlightDeployButton 
            ? 'ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg animate-pulse' 
            : ''
        } ${isDeployDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={shouldHighlightDeployButton ? {
          boxShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4)',
        } : {}}
      >
        🚀
      </button>
      
      {/* Desktop: Full panel */}
      <div className="hidden sm:block fixed top-6 right-6 z-40 panel-glass rounded-xl p-4 w-64 sm:w-80 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10">
      {/* Primary CTA */}
      <button
        onClick={() => setBuildPanelOpen(true)}
        disabled={isDeployDisabled}
        data-tutorial-target="build-panel-button"
        className={`w-full px-6 py-4 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg font-semibold text-lg transition-all hover:scale-105 shadow-lg mb-4 ${
          shouldHighlightDeployButton 
            ? 'ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg animate-pulse' 
            : ''
        } ${isDeployDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={shouldHighlightDeployButton ? {
          boxShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4)',
        } : {}}
      >
        🚀 Deploy Orbital Unit
        {isDeployDisabled && <span className="block text-xs mt-1 text-gray-500">(Disabled in tutorial)</span>}
      </button>
      <BuildPanel isOpen={buildPanelOpen} onClose={() => setBuildPanelOpen(false)} />
      
      {/* Capacity Display - Read-only */}
      <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-300">Orbit Share</label>
          <span className="text-sm font-semibold text-accent-blue">{orbitShare.toFixed(1)}%</span>
        </div>
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Orbital Capacity:</span>
            <span className="text-accent-blue">{(totalOrbitalCapacity / 1000).toFixed(2)} GW</span>
            {queuedComputeCapacity > 0 && (
              <span className="text-xs text-gray-500 ml-1">({(queuedComputeCapacity / 1000).toFixed(2)} GW queued)</span>
            )}
          </div>
          <div className="flex justify-between">
            <span>Ground Capacity:</span>
            <span className="text-accent-orange">{(remainingGroundCapacity / 1000).toFixed(2)} GW</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-700/50">
            <span className="font-semibold">Total Capacity:</span>
            <span className="font-semibold text-white">{(totalComputeCapacity / 1000).toFixed(2)} GW</span>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2 italic">
          Orbit share is automatically calculated from deployed units. All deployed orbital compute is used at full capacity.
        </div>
      </div>

      {/* Ground DC Reduction Slider (missions mode only, for fine-tuning) */}
      {sandboxMode === "missions" && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-300">Reduce Ground DCs</label>
            <span className="text-sm font-semibold text-accent-orange">{groundDCReduction}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={groundDCReduction}
            onChange={(e) => setGroundDCReduction(Number(e.target.value))}
            className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-orange ${
              shouldHighlightGround || (isTutorialActive && tutorialStep === 3 && sandboxMode === "missions")
                ? 'ring-4 ring-accent-orange ring-offset-2 ring-offset-dark-bg animate-pulse' 
                : ''
            }`}
            style={(isTutorialActive && tutorialStep === 3 && sandboxMode === "missions") ? {
              boxShadow: '0 0 20px rgba(255, 152, 0, 0.8), 0 0 40px rgba(255, 152, 0, 0.4)',
            } : {}}
          />
        </div>
      )}

      {/* Presets */}
      <div className={`mb-4 ${shouldHighlightPresets ? 'ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg rounded-lg p-2 animate-pulse' : ''}`}>
        <div className="text-xs text-gray-400 mb-2 font-semibold">Presets</div>
        <div className="grid grid-cols-2 gap-2">
          <PresetButton
            label="All Earth"
            active={currentPreset === "all_earth"}
            disabled={isPresetsDisabled}
            onClick={() => {
              resetUnits(); // Clear all deployments
              setPreset("all_earth");
              // Advance tutorial if in step 4
              if (isTutorialActive && tutorialStep === 4) {
                setTimeout(() => nextTutorialStep(), 1000);
              }
            }}
          />
          <PresetButton
            label="Hybrid"
            active={currentPreset === "hybrid_2035"}
            disabled={isPresetsDisabled}
            highlight={shouldHighlightHybridButton}
            onClick={() => {
              resetUnits(); // Clear all deployments
              setPreset("hybrid_2035");
              
              // Hybrid: Target ~10% orbit share (4.67 GW orbital + 42 GW ground)
              // For performance, use fewer units but same total capacity
              // Mix: 50 server farms (5 MW) = 250 MW, 100 GEO hubs (1 MW) = 100 MW, 28,000 LEO pods (0.15 MW) = 4,200 MW
              // Total: 4,550 MW = 4.55 GW (~10% of 42 GW baseline)
              // BUT for tutorial performance, reduce LEO pods significantly and use more server farms/GEO hubs
              // Tutorial-optimized: 200 server farms (1 GW), 200 GEO hubs (0.2 GW), 500 LEO pods (0.075 GW) = 1.275 GW (~3%)
              
              const serverFarms = 200;
              const geoHubs = 200;
              const leoPods = 500; // Reduced from 7800 for performance (500 pods = 25,000 satellites instead of 390,000)
              const totalMW = (serverFarms * 5.0) + (geoHubs * 1.0) + (leoPods * 0.15);
              
              // Deploy server farms (5 MW each)
              for (let i = 0; i < serverFarms; i++) {
                addToQueue({
                  type: "server_farm",
                  name: "In-Space Server Farm",
                  cost: 500,
                  powerOutputMw: 5.0,
                  latencyMs: 8,
                  lifetimeYears: 10,
                  buildTimeDays: 730,
                });
              }
              
              // Deploy GEO hubs (1 MW each)
              for (let i = 0; i < geoHubs; i++) {
                addToQueue({
                  type: "geo_hub",
                  name: "GEO Compute Hub",
                  cost: 200,
                  powerOutputMw: 1.0,
                  latencyMs: 120,
                  lifetimeYears: 15,
                  buildTimeDays: 365,
                });
              }
              
              // Deploy LEO pods (0.15 MW each)
              for (let i = 0; i < leoPods; i++) {
                addToQueue({
                  type: "leo_pod",
                  name: "Starlink Cluster Compute Pod",
                  cost: 50,
                  powerOutputMw: 0.15,
                  latencyMs: 5,
                  lifetimeYears: 7,
                  buildTimeDays: 180,
                });
              }
              
              // Show notification about deployment
              const deploymentInfo = `Hybrid: Deploying ${(totalMW / 1000).toFixed(2)} GW orbital capacity\n` +
                `(${serverFarms} server farms + ${geoHubs} GEO hubs + ${leoPods} LEO pods)`;
              console.log(deploymentInfo);
              
              // Show temporary notification
              const notification = document.createElement('div');
              notification.className = 'fixed top-24 left-1/2 -translate-x-1/2 z-50 panel-glass rounded-lg p-4 border border-accent-blue/50 shadow-2xl max-w-md';
              notification.innerHTML = `
                <div class="text-sm font-semibold text-accent-blue mb-2">Hybrid Deployment</div>
                <div class="text-xs text-gray-300 mb-1">Deploying ${(totalMW / 1000).toFixed(2)} GW orbital capacity:</div>
                <div class="text-xs text-gray-400 space-y-0.5">
                  <div>• ${serverFarms} Server Farms (${(serverFarms * 5.0 / 1000).toFixed(2)} GW)</div>
                  <div>• ${geoHubs} GEO Hubs (${(geoHubs * 1.0 / 1000).toFixed(2)} GW)</div>
                  <div>• ${leoPods} LEO Pods (${(leoPods * 0.15 / 1000).toFixed(2)} GW)</div>
                </div>
              `;
              document.body.appendChild(notification);
              setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.5s';
                setTimeout(() => notification.remove(), 500);
              }, 5000);
              
              // Advance tutorial if in step 2 or 4
              if (isTutorialActive && tutorialStep === 2) {
                // Step 2: Wait for deployments to start, then auto-advance
                setTimeout(() => nextTutorialStep(), 3000);
              } else if (isTutorialActive && tutorialStep === 4) {
                setTimeout(() => nextTutorialStep(), 1000);
              }
            }}
          />
          <PresetButton
            label="Orbit-Dominant"
            active={currentPreset === "orbit_dominant_2060"}
            disabled={isPresetsDisabled}
            onClick={() => {
              resetUnits(); // Clear all deployments
              setPreset("orbit_dominant_2060");
              // Deploy units to match preset (75 units = ~11.25 MW)
              for (let i = 0; i < 75; i++) {
                addToQueue({
                  type: "leo_pod",
                  name: "Starlink Cluster Compute Pod",
                  cost: 50,
                  powerOutputMw: 0.15,
                  latencyMs: 5,
                  lifetimeYears: 7,
                  buildTimeDays: 180,
                });
              }
              // Advance tutorial if in step 4
              if (isTutorialActive && tutorialStep === 4) {
                setTimeout(() => nextTutorialStep(), 1000);
              }
            }}
          />
          <PresetButton
            label="100% Orbit"
            active={currentPreset === "extreme_100_orbit"}
            disabled={isPresetsDisabled}
            onClick={() => {
              resetUnits(); // Clear all deployments
              setPreset("extreme_100_orbit");
              // Deploy units to match preset - need enough to replace all ground capacity
              // 42 GW ground capacity = 42,000 MW
              // Each LEO pod = 0.15 MW, so need ~280,000 pods for 100% replacement
              // But that's too many, so let's deploy a reasonable amount (e.g., 1000 pods = 150 MW)
              // For 100% orbit, we'll deploy enough to exceed ground capacity
              const targetPods = 1000; // Deploy 1000 pods = 150 MW
              for (let i = 0; i < targetPods; i++) {
                addToQueue({
                  type: "leo_pod",
                  name: "Starlink Cluster Compute Pod",
                  cost: 50,
                  powerOutputMw: 0.15,
                  latencyMs: 5,
                  lifetimeYears: 7,
                  buildTimeDays: 180,
                });
              }
              // Auto-start building all queued units (they'll be picked up by the useEffect)
              // Set ground reduction to 100% to match preset
              setGroundDCReduction(100);
              // Advance tutorial if in step 4
              if (isTutorialActive && tutorialStep === 4) {
                setTimeout(() => nextTutorialStep(), 1000);
              }
            }}
          />
        </div>
      </div>

      {/* Compact Latency Probe */}
      <div className="mb-4">
        <CompactLatencyProbe />
      </div>

      {/* Surge Event Demo Button (for tutorial step 4) */}
      {shouldHighlightSurgeButton && (
        <div className="mb-4">
          <button
            onClick={handleSurgeEvent}
            className="w-full px-6 py-3 bg-accent-orange hover:bg-accent-orange/80 text-dark-bg rounded-lg font-semibold text-sm transition-all ring-4 ring-accent-orange ring-offset-2 ring-offset-dark-bg animate-pulse"
            style={{
              boxShadow: '0 0 20px rgba(255, 152, 0, 0.8), 0 0 40px rgba(255, 152, 0, 0.4)',
            }}
          >
            ⚡ Demo: Surge Event
          </button>
        </div>
      )}

      {/* Reset Button */}
      <button
        onClick={handleReset}
        disabled={isResetDisabled}
        className={`w-full text-xs text-gray-400 hover:text-gray-300 text-center py-2 transition-colors ${
          shouldHighlightReset 
            ? 'ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg rounded-lg animate-pulse' 
            : ''
        } ${isResetDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={shouldHighlightReset ? {
          boxShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4)',
        } : {}}
      >
        Reset Sandbox
      </button>
    </div>
    </>
  );
}

function PresetButton({ label, active, onClick, disabled, highlight }: { label: string; active: boolean; onClick: () => void; disabled?: boolean; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
        active
          ? "bg-accent-blue text-dark-bg"
          : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border border-gray-700/50"
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
        highlight ? 'ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg animate-pulse' : ''
      }`}
      style={highlight ? {
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4)',
      } : {}}
    >
      {label}
    </button>
  );
}

