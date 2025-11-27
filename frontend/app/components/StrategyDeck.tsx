"use client";

import { useSandboxStore, type OrbitMode, type DensityMode } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useMemo, useState, useEffect } from "react";
import { calculateDeploymentEngine, type DeploymentState } from "../lib/deployment/deploymentEngine";
import { POD_TIERS, getAvailableTiers, type PodTierId } from "../lib/deployment/podTiers";
import { LAUNCH_PROVIDERS, type LaunchProviderId } from "../lib/deployment/launchProviders";
import { getDensityBand } from "../lib/deployment/orbitalDensity";

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
  } = useSandboxStore();

  const { getDeployedUnits, getQueuedUnits } = useOrbitalUnitsStore();
  const deployedUnits = getDeployedUnits();
  const queuedUnits = getQueuedUnits();
  const totalPodsInOrbit = deployedUnits.length;
  const totalPodsInQueue = queuedUnits.length;

  const { isTutorialActive, tutorialStep } = useSandboxStore();
  
  // Accordion state - all collapsed by default
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    orbit: false,
    launch: false,
    ground: false,
  });

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
  const deploymentState: DeploymentState = {
    totalPodsBuilt,
    totalPodsInOrbit,
    totalPodsInQueue,
    activeLaunchProviders,
  };

  const engine = useMemo(() => calculateDeploymentEngine(deploymentState), [
    totalPodsBuilt,
    totalPodsInOrbit,
    totalPodsInQueue,
    activeLaunchProviders,
  ]);

  // Get available pod tiers
  const availableTiers = useMemo(() => getAvailableTiers(totalPodsBuilt), [totalPodsBuilt]);

  // Mission constraints
  const budgetRemaining = activeMissionId ? 200 : null;
  const maxSatellites = activeMissionId ? 100 : null;
  const debrisRisk = densityMode === "Aggressive" ? "HIGH" : densityMode === "Optimized" ? "MED" : "LOW";
  const energyCostMultiplier: number = 1.0;

  return (
    <div className="fixed top-6 left-6 z-40 panel-glass rounded-xl p-4 w-80 max-w-[calc(100vw-12px)] shadow-2xl border border-white/10" data-tutorial-target="strategy-deck">
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
                        onChange={() => toggleLaunchProvider(providerId)}
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
    </div>
  );
}
