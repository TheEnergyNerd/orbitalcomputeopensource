"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useEffect, useState, useRef } from "react";
import { calculateMetrics } from "../lib/metrics/calculateMetrics";
import { calculateDeploymentEngine, type DeploymentState } from "../lib/deployment/deploymentEngine";
import { FACILITY_BUILD_CONFIG } from "../lib/factory/factoryEngine";

interface MetricCard {
  label: string;
  value: number;
  unit: string;
  delta: number; // percentage change
  isPulsing: boolean;
}

interface MetricCluster {
  title: string;
  metrics: MetricCard[];
  isPulsing: boolean;
}

export default function SimulationFeedback() {
  const { 
    groundDCReduction,
    selectedPodTier,
    orbitMode,
    offloadPct,
    densityMode,
    totalPodsBuilt,
    factory,
  } = useSandboxStore();
  const { getDeployedUnits, getQueuedUnits } = useOrbitalUnitsStore();
  const state = useSimStore((s) => s.state);
  
  const [clusters, setClusters] = useState<MetricCluster[]>([]);
  const [previousMetrics, setPreviousMetrics] = useState<Record<string, number>>({});
  const pulseTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const prevLeverKeysRef = useRef<string>("");

  // Calculate coverage and population served (simplified)
  const calculateCoverage = (orbitShare: number, orbitMode: string) => {
    const baseCoverage = orbitShare * 100;
    if (orbitMode === "GEO") return Math.min(100, baseCoverage * 3);
    return Math.min(100, baseCoverage);
  };

  const calculatePopulationServed = (orbitShare: number, orbitMode: string) => {
    const basePopulation = 8e9; // 8 billion
    const coverage = calculateCoverage(orbitShare, orbitMode);
    return Math.round((basePopulation * coverage) / 100);
  };

  useEffect(() => {
    if (!state) return;

    const deployedUnits = getDeployedUnits();
    const deployedOrbitalCapacity = deployedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
    
    const BASE_GROUND_CAPACITY_GW = 42;
    const baseGroundCapacity = BASE_GROUND_CAPACITY_GW * 1000; // MW
    const remainingGroundCapacity = baseGroundCapacity * (1 - groundDCReduction / 100);
    const totalCapacity = deployedOrbitalCapacity + remainingGroundCapacity;
    const orbitShare = totalCapacity > 0 ? deployedOrbitalCapacity / totalCapacity : 0;
    
    // Calculate deployment engine metrics for queue display
    const queuedUnits = getQueuedUnits();
    const deploymentState: DeploymentState = {
      totalPodsBuilt,
      totalPodsInOrbit: deployedUnits.length,
      totalPodsInQueue: queuedUnits.length,
      activeLaunchProviders: [], // Not needed for queue display
    };
    const engine = calculateDeploymentEngine(deploymentState);

    // Calculate orbital density (satellite equivalents)
    const orbitalDensity = deployedUnits.length * 50; // Each pod = 50 satellites
    
    const calculatedMetrics = calculateMetrics({
      deployedOrbitalCapacity,
      remainingGroundCapacity,
      baseGroundCapacity,
      isSurgeActive: false,
      podTier: selectedPodTier,
      orbitMode,
      offloadPct,
      densityMode,
      cumulativeDeployedUnits: deployedUnits.length,
      orbitalDensity,
    });

    const coverage = calculateCoverage(orbitShare, orbitMode);
    const populationServed = calculatePopulationServed(orbitShare, orbitMode);

    // Calculate factory metrics (simplified - factory model may vary)
    const monthlyOpex = 0; // Factory OPEX calculation not available in current model
    const factoryCash = 0; // Factory cash not tracked in current model
    const factoryPL = previousMetrics.factoryCash !== undefined 
      ? factoryCash - previousMetrics.factoryCash 
      : 0;

    // Calculate deltas
    const latencyDelta = previousMetrics.latency 
      ? ((calculatedMetrics.latency - previousMetrics.latency) / previousMetrics.latency) * 100
      : 0;
    const resilienceDelta = previousMetrics.resilienceScore
      ? calculatedMetrics.resilienceScore - previousMetrics.resilienceScore
      : 0;
    const coverageDelta = previousMetrics.coverage
      ? coverage - previousMetrics.coverage
      : 0;
    const energyDelta = previousMetrics.energyCost
      ? ((calculatedMetrics.energyCost - previousMetrics.energyCost) / previousMetrics.energyCost) * 100
      : 0;
    const coolingDelta = previousMetrics.coolingCost
      ? ((calculatedMetrics.coolingCost - previousMetrics.coolingCost) / previousMetrics.coolingCost) * 100
      : 0;
    const carbonDelta = previousMetrics.carbon
      ? ((calculatedMetrics.carbon - previousMetrics.carbon) / previousMetrics.carbon) * 100
      : 0;
    const populationDelta = previousMetrics.populationServed
      ? ((populationServed - previousMetrics.populationServed) / previousMetrics.populationServed) * 100
      : 0;

    // Check if any lever changed and trigger pulse
    const leverKeys = `${selectedPodTier}-${orbitMode}-${offloadPct}-${densityMode}-${groundDCReduction}`;
    const leverChanged = !!(
      prevLeverKeysRef.current && prevLeverKeysRef.current !== leverKeys
    );
    
    // Cluster 1: Performance
    const performanceCluster: MetricCluster = {
      title: "Performance",
      metrics: [
        {
          label: "Latency",
          value: calculatedMetrics.latency,
          unit: "ms",
          delta: latencyDelta,
          isPulsing: leverChanged && Math.abs(latencyDelta) > 0.1,
        },
        {
          label: "Resilience",
          value: calculatedMetrics.resilienceScore,
          unit: "%",
          delta: resilienceDelta,
          isPulsing: leverChanged && Math.abs(resilienceDelta) > 0.1,
        },
        {
          label: "Coverage",
          value: coverage,
          unit: "%",
          delta: coverageDelta,
          isPulsing: leverChanged && Math.abs(coverageDelta) > 0.1,
        },
      ],
      isPulsing: leverChanged && (Math.abs(latencyDelta) > 0.1 || Math.abs(resilienceDelta) > 0.1 || Math.abs(coverageDelta) > 0.1),
    };

    // Calculate factory deltas
    const opexDelta = previousMetrics.monthlyOpex
      ? ((monthlyOpex - previousMetrics.monthlyOpex) / previousMetrics.monthlyOpex) * 100
      : 0;
    const factoryPLDelta = previousMetrics.factoryPL !== undefined
      ? factoryPL - previousMetrics.factoryPL
      : 0;

    // Cluster 2: Cost
    const costCluster: MetricCluster = {
      title: "Cost",
      metrics: [
        {
          label: "Energy Cost",
          value: calculatedMetrics.energyCost,
          unit: "$M/yr",
          delta: energyDelta,
          isPulsing: leverChanged && Math.abs(energyDelta) > 0.1,
        },
        {
          label: "Cooling Cost",
          value: calculatedMetrics.coolingCost,
          unit: "$M/yr",
          delta: coolingDelta,
          isPulsing: leverChanged && Math.abs(coolingDelta) > 0.1,
        },
        {
          label: "Monthly Opex",
          value: monthlyOpex,
          unit: "$M/mo",
          delta: opexDelta,
          isPulsing: leverChanged && Math.abs(opexDelta) > 0.1,
        },
        {
          label: "Factory P/L",
          value: factoryPL,
          unit: "$M",
          delta: factoryPLDelta,
          isPulsing: leverChanged && Math.abs(factoryPLDelta) > 0.1,
        },
      ],
      isPulsing: leverChanged && (Math.abs(energyDelta) > 0.1 || Math.abs(coolingDelta) > 0.1 || Math.abs(opexDelta) > 0.1 || Math.abs(factoryPLDelta) > 0.1),
    };

    // Cluster 3: Environmental
    const environmentalCluster: MetricCluster = {
      title: "Environmental",
      metrics: [
        {
          label: "Carbon",
          value: calculatedMetrics.carbon,
          unit: "t/yr",
          delta: carbonDelta,
          isPulsing: leverChanged && Math.abs(carbonDelta) > 0.1,
        },
        {
          label: "Population",
          value: populationServed,
          unit: "",
          delta: populationDelta,
          isPulsing: leverChanged && Math.abs(populationDelta) > 0.1,
        },
        {
          label: "Orbital Share",
          value: orbitShare * 100,
          unit: "%",
          delta: previousMetrics.orbitShare ? (orbitShare * 100 - previousMetrics.orbitShare) : 0,
          isPulsing: leverChanged && Math.abs(orbitShare * 100 - (previousMetrics.orbitShare || 0)) > 0.1,
        },
        {
          label: "Queue",
          value: queuedUnits.length,
          unit: `/${engine.maxQueue}`,
          delta: previousMetrics.queue ? (queuedUnits.length - previousMetrics.queue) : 0,
          isPulsing: false, // Queue changes don't pulse
        },
      ],
      isPulsing: leverChanged && (Math.abs(carbonDelta) > 0.1 || Math.abs(populationDelta) > 0.1),
    };

    // Handle pulsing animation
    if (leverChanged) {
      [performanceCluster, costCluster, environmentalCluster].forEach((cluster) => {
        if (cluster.isPulsing) {
          // Clear existing timeout
          if (pulseTimeoutRef.current[cluster.title]) {
            clearTimeout(pulseTimeoutRef.current[cluster.title]);
          }
          // Set new timeout to stop pulsing
          pulseTimeoutRef.current[cluster.title] = setTimeout(() => {
            setClusters((prev) =>
              prev.map((c) => 
                c.title === cluster.title 
                  ? { ...c, isPulsing: false, metrics: c.metrics.map((m) => ({ ...m, isPulsing: false })) }
                  : c
              )
            );
          }, 1000);
        }
      });
    }
    prevLeverKeysRef.current = leverKeys;

    setClusters([performanceCluster, costCluster, environmentalCluster]);
    setPreviousMetrics({
      latency: calculatedMetrics.latency,
      energyCost: calculatedMetrics.energyCost,
      coolingCost: calculatedMetrics.coolingCost,
      carbon: calculatedMetrics.carbon,
      resilienceScore: calculatedMetrics.resilienceScore,
      coverage,
      populationServed,
      orbitShare: orbitShare * 100,
      queue: queuedUnits.length,
      monthlyOpex,
      factoryCash,
      factoryPL,
    });
  }, [
    state,
    groundDCReduction,
    selectedPodTier,
    orbitMode,
    offloadPct,
    densityMode,
    totalPodsBuilt,
    factory,
    getDeployedUnits,
    getQueuedUnits,
  ]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(pulseTimeoutRef.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  const formatValue = (value: number, unit: string): string => {
    if (unit === "") {
      // Population - format with commas
      return value.toLocaleString();
    }
    if (unit.startsWith("/")) {
      // Queue format: value / max
      return `${Math.round(value)}${unit}`;
    }
    // For Factory P/L, show +/- sign
    if (unit === "$M" && Math.abs(value) < 0.01) {
      return "0.0";
    }
    if (value >= 1e6) {
      return `${(value / 1e6).toFixed(1)}M`;
    }
    if (value >= 1e3) {
      return `${(value / 1e3).toFixed(1)}K`;
    }
    return value.toFixed(1);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 z-30 px-1 sm:px-0" data-tutorial-target="metrics">
      <div className="panel-glass rounded-t-xl sm:rounded-xl p-1.5 sm:p-4 shadow-2xl border border-white/10">
        <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 overflow-x-auto">
          {clusters.map((cluster) => (
            <div
              key={cluster.title}
              className={`px-2 py-1.5 sm:px-4 sm:py-3 rounded-lg border-2 transition-all ${
                cluster.isPulsing
                  ? "border-accent-blue bg-accent-blue/10 animate-pulse"
                  : "border-gray-700/50 bg-gray-800/30"
              }`}
            >
              <div className="text-[9px] sm:text-xs font-semibold text-gray-400 mb-0.5 sm:mb-2 uppercase tracking-wide">
                {cluster.title}
              </div>
              <div className="flex flex-wrap sm:flex-row gap-1 sm:gap-4">
                {cluster.metrics.map((metric) => (
                  <div key={metric.label} className="min-w-[70px] sm:min-w-[100px]">
                    <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">{metric.label}</div>
                    <div className="flex items-baseline gap-0.5 sm:gap-1">
                      <div className="text-sm sm:text-lg font-bold text-white">
                        {formatValue(metric.value, metric.unit)}
                      </div>
                      {metric.unit && <div className="text-[9px] sm:text-xs text-gray-500">{metric.unit}</div>}
                    </div>
                    {Math.abs(metric.delta) > 0.1 && (
                      <div className={`flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-xs mt-0.5 sm:mt-1 ${
                        metric.delta < 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        <span>{metric.delta < 0 ? "↓" : "↑"}</span>
                        <span>
                          {metric.unit === "$M" && metric.delta !== 0
                            ? `${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(1)}`
                            : `${Math.abs(metric.delta).toFixed(1)}%`}
                        </span>
                      </div>
                    )}
                    {metric.label === "Factory P/L" && (
                      <div className={`text-[9px] sm:text-xs mt-0.5 sm:mt-1 ${
                        "text-gray-400"
                      }`}>
                        Cash: N/A
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
