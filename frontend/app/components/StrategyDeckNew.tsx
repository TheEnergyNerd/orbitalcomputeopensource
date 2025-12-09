"use client";

import { useSandboxStore, type OrbitMode } from "../store/sandboxStore";
import { useState } from "react";
import type { RecipeFactoryNodeId } from "../lib/factory/factoryRecipes";
import { FACTORY_RECIPES } from "../lib/factory/factoryRecipes";
import type { LaunchProviderId } from "../lib/launch/launchQueue";
import { DEFAULT_LAUNCH_PROVIDERS, calculateDeploymentRate } from "../lib/launch/launchQueue";
import { calculateMetrics } from "../lib/metrics/calculateMetrics";
import MissionPanel from "./MissionPanel";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";

type Tab = "orbit" | "factory" | "space" | "missions";

export default function StrategyDeckNew() {
  const {
    orbitMode,
    setOrbitMode,
    factory,
    factoryBottlenecks,
    launchState,
    updateFactoryLines,
    toggleLaunchProvider,
    setPreset,
    unlockedOrbitModes,
  } = useSandboxStore();

  const [activeTab, setActiveTab] = useState<Tab>("orbit");
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Calculate metrics for display
  const orbitPods = Math.floor(factory.inventory.orbitPods ?? 0); // orbitPods is a valid ResourceId
  const orbitalCapacityMW = orbitPods * 0.15; // 150kW per pod
  const BASE_GROUND_CAPACITY_GW = 42;
  const baseGroundCapacityMW = BASE_GROUND_CAPACITY_GW * 1000;
  const totalCapacity = orbitalCapacityMW + baseGroundCapacityMW;
  const orbitShare = totalCapacity > 0 ? (orbitalCapacityMW / totalCapacity) * 100 : 0;

  const metrics = calculateMetrics({
    deployedOrbitalCapacity: orbitalCapacityMW,
    remainingGroundCapacity: baseGroundCapacityMW,
    baseGroundCapacity: baseGroundCapacityMW,
    isSurgeActive: false,
    podTier: "tier1",
    orbitMode,
    offloadPct: orbitShare,
    densityMode: "Safe",
    cumulativeDeployedUnits: orbitPods,
    orbitalDensity: orbitPods * 50,
  });

  const deploymentRate = calculateDeploymentRate(launchState);

  return (
    <>
      {/* Mobile: Hamburger menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="sm:hidden fixed top-14 left-2 z-40 bg-gray-800/90 border border-gray-700 rounded-lg p-2 text-white"
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div
        className={`fixed top-[70px] left-6 w-80 z-40 panel-glass rounded-xl p-4 shadow-2xl border border-white/10 ${
          isMobileOpen ? "block" : "hidden sm:block"
        }`}
      >
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-700/50 pb-2">
          <button
            onClick={() => setActiveTab("orbit")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeTab === "orbit"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Orbit Plan
          </button>
          <button
            onClick={() => setActiveTab("factory")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeTab === "factory"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Factory
          </button>
          <button
            onClick={() => setActiveTab("space")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeTab === "space"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Space Ops
          </button>
          <button
            onClick={() => setActiveTab("missions")}
            className={`px-3 py-1 text-xs font-semibold rounded transition ${
              activeTab === "missions"
                ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/50"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Missions
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "orbit" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Orbit Mode</label>
              <div className="flex gap-2">
                {(["LEO", "MEO", "GEO"] as OrbitMode[]).map((mode) => {
                  const isUnlocked = unlockedOrbitModes.includes(mode);
                  return (
                    <button
                      key={mode}
                      onClick={() => isUnlocked && setOrbitMode(mode)}
                      disabled={!isUnlocked}
                      className={`px-3 py-1.5 text-xs rounded transition ${
                        !isUnlocked
                          ? "bg-gray-900 text-gray-600 opacity-50 cursor-not-allowed"
                          : orbitMode === mode
                          ? "bg-accent-blue text-white"
                          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Scenario Presets</label>
              <div className="space-y-1.5">
                {[
                  { id: "all_earth", label: "All Earth" },
                  { id: "hybrid_2035", label: "Hybrid 2035" },
                  { id: "orbit_dominant_2060", label: "Orbit-Dominant 2060" },
                  { id: "extreme_100_orbit", label: "100% Orbit" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setPreset(preset.id as any)}
                    className="w-full px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-left text-gray-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Pod Type</label>
              <select className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300">
                <option>Tier 1 Pod (150 kW)</option>
                <option>Tier 2 Pod (1 MW)</option>
                <option>Tier 3 Pod (5 MW)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Launch Providers</label>
              <div className="space-y-1.5">
                {(Object.keys(DEFAULT_LAUNCH_PROVIDERS) as LaunchProviderId[]).map((providerId) => {
                  const provider = DEFAULT_LAUNCH_PROVIDERS[providerId];
                  const isEnabled = launchState.providers[providerId]?.enabled ?? false;
                  return (
                    <label
                      key={providerId}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition bg-gray-800 hover:bg-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleLaunchProvider(providerId)}
                        className="accent-accent-blue"
                      />
                      <span className="flex-1 capitalize">
                        {providerId} ({provider.podsPerLaunch} pod/launch, {provider.launchesPerMonth}/mo)
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Deployment Rate:</span>
                  <span className="text-white font-semibold">{formatSigFigs(deploymentRate)} pods/mo</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Queue:</span>
                  <span className="text-white font-semibold">{launchState.maxQueue}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "factory" && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Infra</span>
                <span>
                  {factory.usedInfraPoints} / {factory.maxInfraPoints} pts
                </span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full ${
                    factory.usedInfraPoints >= factory.maxInfraPoints
                      ? "bg-red-500"
                      : factory.usedInfraPoints / factory.maxInfraPoints > 0.85
                      ? "bg-yellow-400"
                      : "bg-accent-blue"
                  }`}
                  style={{
                    width: `${Math.min(100, (factory.usedInfraPoints / factory.maxInfraPoints) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-3">
              {(Object.keys(FACTORY_RECIPES) as FactoryNodeId[]).map((nodeId) => {
                const lines = factory.lines[nodeId] ?? 0;
                const utilization = factory.utilization[nodeId] ?? 0;
                const recipe = FACTORY_RECIPES[nodeId];
                const outputResourceKey = Object.keys(recipe.output)[0] as keyof typeof factory.buffers;
                const buffer = factory.buffers[outputResourceKey] ?? 0;

                return (
                  <div key={nodeId} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className={`capitalize ${
                        utilization > 1 ? "text-red-400 font-semibold animate-pulse" :
                        utilization > 0.95 ? "text-yellow-400" :
                        "text-gray-300"
                      }`}>
                        {nodeId}
                      </span>
                      <div className="flex items-center gap-2 text-gray-400">
                        <span>Lines: {lines}</span>
                        <span className={`font-semibold ${
                          utilization > 1 ? "text-red-400 animate-pulse" :
                          utilization > 0.95 ? "text-yellow-400" :
                          "text-green-400"
                        }`}>
                          Util: {formatDecimal(utilization * 100, 0)}%
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={lines}
                      onChange={(e) => {
                        const newLines = Number(e.target.value);
                        const success = updateFactoryLines(nodeId, newLines);
                        if (!success) {
                          // Flash error - infra cap reached
                          alert("Infrastructure cap reached");
                        }
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-blue"
                    />
                    <div className="text-[10px] text-gray-500">
                      Buffer: {Math.round(buffer)} {outputResourceKey}
                    </div>
                  </div>
                );
              })}
            </div>

            {factoryBottlenecks.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-700/50">
                <div className="text-xs font-semibold text-gray-300 mb-2">Bottlenecks</div>
                <div className="space-y-1">
                  {factoryBottlenecks.map((b) => (
                    <div key={b.resource} className={`flex justify-between text-xs p-1 rounded transition-all ${
                      b.utilization > 100 ? "bg-red-500/20 border border-red-500/50 animate-pulse" :
                      b.utilization > 95 ? "bg-yellow-500/20 border border-yellow-500/50" :
                      ""
                    }`}>
                      <span className={`capitalize ${
                        b.utilization > 100 ? "text-red-400 font-semibold" : "text-gray-400"
                      }`}>
                        {b.resource}
                      </span>
                      <span className={`font-semibold ${
                        b.utilization > 100 ? "text-red-400" :
                        b.utilization > 95 ? "text-yellow-400" :
                        "text-green-400"
                      }`}>
                        {formatDecimal(b.utilization, 0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "space" && (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-300 mb-2">Orbital Status</div>
              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Pods in Orbit:</span>
                  <span className="text-white font-semibold">{Math.floor(orbitPods)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Built:</span>
                  <span className="text-white font-semibold">{Math.floor(orbitPods)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Orbital Capacity:</span>
                  <span className="text-white font-semibold">{formatSigFigs(orbitalCapacityMW)} MW</span>
                </div>
                <div className="flex justify-between">
                  <span>Orbit Density:</span>
                  <span className="text-white font-semibold">
                    {orbitPods * 50 < 5000 ? "Safe" :
                     orbitPods * 50 < 15000 ? "Busy" :
                     orbitPods * 50 < 25000 ? "Congested" : "Unsafe"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-300 mb-2">Launch Queue</div>
              <div className="space-y-1">
                {launchState.queue.length === 0 ? (
                  <div className="text-xs text-gray-500">Queue empty</div>
                ) : (
                  launchState.queue.map((item) => (
                    <div key={item.id} className="text-xs text-gray-400">
                      [Pod {item.id.slice(-4)}] {Math.ceil(item.etaMonths)} mo
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-300 mb-2">Production & Launch</div>
              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Launch Capacity:</span>
                  <span className="text-white font-semibold">{formatSigFigs(deploymentRate)} pods/mo</span>
                </div>
                <div className="flex justify-between">
                  <span>Production Rate (pods):</span>
                  <span className="text-white font-semibold">
                    {formatSigFigs((factory.utilization.podFactory ?? 0) * (factory.lines.podFactory ?? 0) * (30 / 8))} pods/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Fuel Production:</span>
                  <span className="text-white font-semibold">
                    {formatDecimal((factory.utilization.fuelDepot ?? 0) * (factory.lines.fuelDepot ?? 0) * 50, 0)} t/mo
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-300 mb-2">Ground vs Orbit</div>
              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Ground Capacity:</span>
                  <span className="text-white font-semibold">{formatSigFigs(BASE_GROUND_CAPACITY_GW)} GW</span>
                </div>
                <div className="flex justify-between">
                  <span>Orbital Capacity:</span>
                  <span className="text-white font-semibold">{formatSigFigs(orbitalCapacityMW / 1000)} GW</span>
                </div>
                <div className="flex justify-between">
                  <span>Orbital Share:</span>
                  <span className="text-white font-semibold">{formatDecimal(orbitShare, 1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "missions" && (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            <MissionPanel />
          </div>
        )}
      </div>
    </>
  );
}

