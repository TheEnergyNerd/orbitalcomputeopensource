"use client";

import { useSandboxStore, type OrbitMode, type DensityMode } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useMemo, useState, useEffect, useRef } from "react";
import { calculateDeploymentEngine, type DeploymentState } from "../lib/deployment/deploymentEngine";
import { POD_TIERS, getAvailableTiers, type PodTierId } from "../lib/deployment/podTiers";
import { LAUNCH_PROVIDERS, type LaunchProviderId } from "../lib/deployment/launchProviders";
import { getDensityBand } from "../lib/deployment/orbitalDensity";
// import type { FacilityType } from "../lib/factory/factoryEngine"; // Not used - using FactoryNodeId instead
// import { FACILITY_BUILD_CONFIG, LINE_POINTS } from "../lib/factory/factoryEngine"; // Not used

export default function StrategyDeck() {
  const {
    selectedPodTier,
    orbitMode,
    activeLaunchProviders,
    offloadPct,
    densityMode,
    groundDCReduction,
    totalPodsBuilt,
    setSelectedPodTier,
    setOrbitMode,
    toggleLaunchProvider,
    setOffloadPct,
    setDensityMode,
    setGroundDCReduction,
    unlockedOrbitModes,
    unlockedLaunchProviders,
    activeMissionId,
    factory,
    factoryBottlenecks,
    // updateFactoryFacility, // Removed - not in SandboxStore
    // upgradeFactoryFacility, // Removed - not in SandboxStore
  } = useSandboxStore();

  const { getDeployedUnits, getQueuedUnits } = useOrbitalUnitsStore();
  const deployedUnits = getDeployedUnits();
  const queuedUnits = getQueuedUnits();
  const totalPodsInOrbit = deployedUnits.length;
  const totalPodsInQueue = queuedUnits.length;

  const { isTutorialActive, tutorialStep } = useSandboxStore();
  
  // Mobile menu state
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Accordion state - all collapsed by default
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    orbit: false,
    launch: false,
    ground: false,
  });

  // Error flash state removed - not using facilities anymore, using factory.lines directly
  // const [rejectionFlash, setRejectionFlash] = useState<Record<string, { reason: string; timestamp: number } | null>>({});

  // Auto-expand accordions during tutorial
  useEffect(() => {
    if (isTutorialActive) {
      if (tutorialStep === 4) {
        // Step 4: Offload - expand Ground Strategy
        setExpandedSections((prev) => ({ ...prev, ground: true }));
      } else if (tutorialStep === 5) {
        // Step 5: Launch Provider - expand Launch Economics
        setExpandedSections((prev) => ({ ...prev, launch: true }));
      }
    }
  }, [isTutorialActive, tutorialStep]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Calculate deployment engine metrics
  // FactoryState doesn't have podsReadyOnGround or launchSlots - use inventory.pods as proxy
  const podsReadyOnGround = factory.inventory.pods ?? 0;
  const launchSlotsAvailable = 0; // Not tracked in current FactoryState
  
  const deploymentState: DeploymentState = {
    totalPodsBuilt,
    totalPodsInOrbit,
    totalPodsInQueue,
    activeLaunchProviders,
    podsReadyOnGround,
    launchSlotsAvailable,
  };

  const engine = useMemo(() => calculateDeploymentEngine(deploymentState), [
    totalPodsBuilt,
    totalPodsInOrbit,
    totalPodsInQueue,
    activeLaunchProviders,
    podsReadyOnGround,
    launchSlotsAvailable,
  ]);

  // Get available pod tiers
  const availableTiers = useMemo(() => getAvailableTiers(totalPodsBuilt), [totalPodsBuilt]);

  // Mission constraints
  const budgetRemaining = activeMissionId ? 200 : null;
  const maxSatellites = activeMissionId ? 100 : null;
  const debrisRisk = densityMode === "Aggressive" ? "HIGH" : densityMode === "Optimized" ? "MED" : "LOW";
  const energyCostMultiplier: number = 1.0;

  return (
    <>
      {/* Mobile: Hamburger menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="sm:hidden fixed top-14 left-2 z-50 w-12 h-12 bg-gray-800/90 hover:bg-gray-700/90 rounded-lg flex items-center justify-center shadow-lg border border-white/10"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile: Overlay when menu is open */}
      {isMobileOpen && (
        <div 
          className="sm:hidden fixed inset-0 bg-black/50 z-[45]"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Strategy Deck: Hidden on mobile unless menu is open, always visible on desktop */}
      <div className={`${isMobileOpen ? 'block' : 'hidden'} sm:!block fixed top-6 left-6 z-40 panel-glass rounded-xl p-4 w-80 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10`} data-tutorial-target="strategy-deck">
      <h3 className="text-sm font-bold text-accent-blue mb-4 uppercase tracking-wide">Strategy Deck</h3>

      {/* SECTION 1: Orbit Architecture (Accordion) */}
      <div className="mb-3 border-b border-gray-700/50 pb-3">
        <button
          onClick={() => toggleSection("orbit")}
          className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 hover:text-white transition mb-2"
        >
          <span className="uppercase">Orbit Architecture</span>
          <span className="text-gray-500">{expandedSections.orbit ? "▼" : "▶"}</span>
        </button>
        {expandedSections.orbit && (
          <div className="space-y-3 mt-3">
            {/* Orbit Mode */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Orbit Mode</label>
              <div className="grid grid-cols-3 gap-1">
                {(["LEO", "MEO", "GEO"] as OrbitMode[]).map((mode) => {
                  const isUnlocked = unlockedOrbitModes.includes(mode);
                  return (
                    <button
                      key={mode}
                      onClick={() => isUnlocked && setOrbitMode(mode)}
                      disabled={!isUnlocked}
                      className={`px-2 py-1.5 rounded text-xs font-semibold transition ${
                        !isUnlocked
                          ? "bg-gray-900 text-gray-600 cursor-not-allowed opacity-50"
                          : orbitMode === mode
                          ? "bg-accent-blue text-dark-bg"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Density Mode */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Density Mode</label>
              <div className="grid grid-cols-3 gap-1">
                {(["Safe", "Optimized", "Aggressive"] as DensityMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDensityMode(mode)}
                    className={`px-2 py-1.5 rounded text-xs font-semibold transition ${
                      densityMode === mode
                        ? "bg-accent-blue text-dark-bg"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Pod Tier Selection */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pod Tier</label>
              <select
                value={selectedPodTier}
                onChange={(e) => setSelectedPodTier(e.target.value as PodTierId)}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-accent-blue"
              >
                {availableTiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label} ({tier.powerKW}kW)
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 mt-1">
                {availableTiers.length < POD_TIERS.length && (
                  <span>Next tier at {POD_TIERS[availableTiers.length]?.unlockAtTotalPods || 0} pods</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Launch Economics (Accordion) */}
      <div className="mb-3 border-b border-gray-700/50 pb-3">
        <button
          onClick={() => toggleSection("launch")}
          className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 hover:text-white transition mb-2"
        >
          <span className="uppercase">Launch Economics</span>
          <span className="text-gray-500">{expandedSections.launch ? "▼" : "▶"}</span>
        </button>
        {expandedSections.launch && (
          <div className="space-y-3 mt-3">
            {/* Launch Providers (multiple can be active) */}
            <div data-tutorial-target="launch-provider">
              <label className="block text-xs text-gray-500 mb-1">Launch Providers</label>
              <div className="space-y-1.5">
                {(Object.keys(LAUNCH_PROVIDERS) as LaunchProviderId[]).map((providerId) => {
                  const provider = LAUNCH_PROVIDERS[providerId];
                  // During tutorial step 5+, temporarily allow Starship so the user can complete the step
                  const tutorialUnlockOverride =
                    isTutorialActive && typeof tutorialStep === "number" && tutorialStep >= 5 && providerId === "Starship";
                  const isUnlocked = unlockedLaunchProviders.includes(providerId) || tutorialUnlockOverride;
                  const isActive = activeLaunchProviders.includes(providerId);
                  return (
                    <label
                      key={providerId}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition ${
                        !isUnlocked
                          ? "bg-gray-900 text-gray-600 opacity-50 cursor-not-allowed"
                          : isActive
                          ? "bg-accent-blue/20 border border-accent-blue"
                          : "bg-gray-800 hover:bg-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        disabled={!isUnlocked || (isActive && activeLaunchProviders.length === 1)}
                        onChange={() => {
                          // Convert LaunchProviderId from deployment format to launchQueue format
                          const queueProviderId = providerId === "F9" ? "f9" : 
                                                 providerId === "Starship" ? "starship" : 
                                                 providerId === "SmallLift" ? "smallLift" : "f9";
                          toggleLaunchProvider(queueProviderId as any);
                        }}
                        className="accent-accent-blue"
                      />
                      <span className="flex-1">
                        {provider.label} ({provider.podsPerLaunch} pod/launch, {provider.launchesPerMonth}/mo)
                      </span>
                      {!isUnlocked && <span className="text-[8px]">🔒</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Deployment Engine Metrics */}
            <div className="space-y-1.5 text-xs pt-2 border-t border-gray-700/50">
              <div className="flex justify-between text-gray-400">
                <span>Production Rate:</span>
                <span className="text-white font-semibold">{engine.manufacturingRatePodsPerMonth.toFixed(2)}/mo</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Launch Capacity:</span>
                <span className="text-white font-semibold">{engine.launchCapacityPodsPerMonth.toFixed(1)}/mo</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Deployment Rate:</span>
                <span className="text-accent-blue font-semibold">{engine.effectiveDeploymentRatePodsPerMonth.toFixed(2)}/mo</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Max Queue:</span>
                <span className="text-white font-semibold">{engine.maxQueue}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Infra Tier:</span>
                <span className="text-white font-semibold capitalize">{engine.infraTier}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Cost/Pod:</span>
                <span className="text-white font-semibold">${engine.costPerPod.toFixed(1)}M</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Build Time:</span>
                <span className="text-white font-semibold">{engine.buildTimePerPod.toFixed(0)}d</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Ground Strategy (Accordion) */}
      <div className="mb-3 border-b border-gray-700/50 pb-3">
        <button
          onClick={() => toggleSection("ground")}
          className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 hover:text-white transition mb-2"
        >
          <span className="uppercase">Ground Strategy</span>
          <span className="text-gray-500">{expandedSections.ground ? "▼" : "▶"}</span>
        </button>
        {expandedSections.ground && (
          <div className="space-y-3 mt-3">
            {/* Offload % */}
            <div data-tutorial-target="offload">
              <div className="flex justify-between text-xs mb-1">
                <label className="text-gray-500">Offload %</label>
                <span className="text-white font-semibold">{offloadPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={offloadPct}
                onChange={(e) => setOffloadPct(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
              />
            </div>

            {/* Ground DC Reduction - constrained by orbital capacity */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="text-gray-500">Ground DC Reduction</label>
                <span className="text-white font-semibold">{groundDCReduction}%</span>
              </div>
              {(() => {
                // Calculate max reduction based on orbital capacity
                const BASE_GROUND_CAPACITY_MW = 42000; // 42 GW
                const deployedOrbitalCapacity = deployedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
                const maxReduction = deployedOrbitalCapacity > 0 
                  ? Math.min(100, Math.round((deployedOrbitalCapacity / BASE_GROUND_CAPACITY_MW) * 100))
                  : 0;
                const constrainedValue = Math.min(groundDCReduction, maxReduction);
                
                return (
                  <>
                    <input
                      type="range"
                      min="0"
                      max={maxReduction}
                      value={constrainedValue}
                      onChange={(e) => setGroundDCReduction(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-orange"
                      disabled={maxReduction === 0}
                    />
                    {maxReduction < 100 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Max: {maxReduction}% (limited by orbital capacity)
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: Orbital Status (always visible) */}
      <div className="mb-3 border-b border-gray-700/50 pb-3">
        <div className="text-xs font-semibold text-gray-400 mb-2 uppercase">Orbital Status</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-400">
            <span>Pods in Orbit:</span>
            <span className="text-white font-semibold">{totalPodsInOrbit}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Queue:</span>
            <span className={`font-semibold ${
              totalPodsInQueue >= engine.maxQueue ? "text-red-400" : "text-white"
            }`}>
              {totalPodsInQueue} / {engine.maxQueue}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Density:</span>
            <span className={`font-semibold ${
              engine.densityBand === "Unsafe" ? "text-red-400" :
              engine.densityBand === "Congested" ? "text-yellow-400" :
              engine.densityBand === "Busy" ? "text-orange-400" :
              "text-green-400"
            }`}>
              {engine.densityBand}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Total Built:</span>
            <span className="text-white font-semibold">{totalPodsBuilt}</span>
          </div>
        </div>
      </div>

      {/* SECTION 5: Constraints (only show if mission active) */}
      {activeMissionId && (
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2 uppercase">Constraints</div>
          <div className="space-y-1.5 text-xs">
            {budgetRemaining !== null && (
              <div className="flex justify-between text-gray-400">
                <span>Budget:</span>
                <span className="text-white font-semibold">${budgetRemaining}M</span>
              </div>
            )}
            {maxSatellites !== null && (
              <div className="flex justify-between text-gray-400">
                <span>Max Sats:</span>
                <span className="text-white font-semibold">{maxSatellites}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-400">
              <span>Debris Risk:</span>
              <span className={`font-semibold ${
                debrisRisk === "HIGH" ? "text-red-400" : 
                debrisRisk === "MED" ? "text-yellow-400" : 
                "text-green-400"
              }`}>
                {debrisRisk}
              </span>
            </div>
            {energyCostMultiplier !== 1.0 && (
              <div className="flex justify-between text-gray-400">
                <span>Energy Mult:</span>
                <span className="text-white font-semibold">{energyCostMultiplier.toFixed(1)}×</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 6: Factory (Facilities & Bottlenecks) */}
      <div className="mt-4 border-t border-gray-800 pt-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Factory Lines
          </h4>
          <span className="text-[10px] text-gray-400">
            Infra: {factory.usedInfraPoints} / {factory.maxInfraPoints} pts
          </span>
        </div>
        <div className="mb-2 space-y-1.5">
          <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
            <span>Infra</span>
            <span>
              {factory.usedInfraPoints} / {factory.maxInfraPoints} pts
            </span>
          </div>
          {podsReadyOnGround > 0 && (
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Pods Ready</span>
              <span className="text-white font-semibold">
                {podsReadyOnGround}
              </span>
            </div>
          )}
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${
                factory.usedInfraPoints >= factory.maxInfraPoints
                  ? "bg-red-500"
                  : factory.usedInfraPoints / factory.maxInfraPoints > 0.85
                  ? "bg-yellow-400"
                  : "bg-accent-blue"
              }`}
              style={{
                width: `${
                  factory.maxInfraPoints > 0
                    ? Math.min(
                        100,
                        (factory.usedInfraPoints / factory.maxInfraPoints) *
                          100
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          {/* Factory lines - using FactoryNodeId from factoryRecipes */}
          {(Object.keys(factory.lines) as Array<keyof typeof factory.lines>).map((nodeId) => {
            const lines = factory.lines[nodeId];
            const utilization = factory.utilization[nodeId] ?? 0;
            const nodeName = nodeId === 'chipFab' ? 'Chip Fab' :
                           nodeId === 'rackLine' ? 'Rack Line' :
                           nodeId === 'podFactory' ? 'Pod Factory' :
                            nodeId === 'fuelDepot' ? 'Fuel Depot' :
                           nodeId === 'launchComplex' ? 'Launch Complex' : nodeId;
            
            return (
              <div key={nodeId} className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 capitalize">{nodeName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">
                      Lines: <span className="text-white font-semibold">{lines}</span>
                      {utilization > 0 && (
                        <span className="ml-1 text-[10px] text-gray-500">
                          ({Math.round(utilization * 100)}% util)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {factoryBottlenecks.length > 0 && (
          <div className="mt-3 text-xs text-gray-400 space-y-1">
            <div className="font-semibold text-gray-300">Bottlenecks</div>
            {factoryBottlenecks.map((b) => {
              const utilPct = b.utilization * 100;
              let label = "Balanced";
              let color = "text-green-400";
              if (b.utilization < 0.7) {
                label = "Starved";
                color = "text-red-400";
              } else if (b.utilization > 1.2) {
                label = "Overbuilt";
                color = "text-yellow-400";
              }
              return (
                <div key={b.resource} className="flex justify-between">
                  <span className="capitalize">
                    {b.resource}{" "}
                    <span className="text-[10px] text-gray-500">({label})</span>
                  </span>
                  <span className={color}>{utilPct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Mobile: Close button */}
      {isMobileOpen && (
        <button
          onClick={() => setIsMobileOpen(false)}
          className="sm:hidden absolute top-2 right-2 text-gray-400 hover:text-white z-50"
        >
          ✕
        </button>
      )}
    </div>
    </>
  );
}
