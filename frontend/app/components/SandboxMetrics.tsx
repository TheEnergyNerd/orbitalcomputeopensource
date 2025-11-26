"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useSimStore } from "../store/simStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useEffect, useState } from "react";
import MetricCard from "./MetricCard";
import LaunchLogisticsAccordion from "./LaunchLogisticsAccordion";
import { calculateMetrics } from "../lib/metrics/calculateMetrics";

export default function SandboxMetrics() {
  const { 
    orbitalComputeUnits, 
    groundDCReduction, 
    missionProgress, 
    activeMissionId, 
    isTutorialActive, 
    tutorialStep, 
    sandboxMode,
    selectedPodTier,
    orbitMode,
    offloadPct,
    densityMode,
    totalPodsBuilt,
  } = useSandboxStore();
  const { getDeployedUnits } = useOrbitalUnitsStore();
  const state = useSimStore((s) => s.state);
  const [isSurgeActive, setIsSurgeActive] = useState(false);
  const [metrics, setMetrics] = useState({
    latency: 45,
    energyCost: 1000,
    carbon: 500,
    coolingCost: 400,
    resilienceScore: 40,
    worldImpact: 0,
    baselineLatency: 45,
    baselineEnergy: 1000,
    baselineCarbon: 500,
    baselineCooling: 400,
    totalCapacity: 100,
  });

  // Listen for surge events
  useEffect(() => {
    const handleSurgeEvent = () => {
      setIsSurgeActive(true);
      setTimeout(() => setIsSurgeActive(false), 5000);
    };
    window.addEventListener("surge-event" as any, handleSurgeEvent);
    return () => window.removeEventListener("surge-event" as any, handleSurgeEvent);
  }, []);

  useEffect(() => {
    if (!state) return;

    // Calculate ACTUAL deployed capacity (not just slider values)
    const deployedUnits = getDeployedUnits();
    const deployedOrbitalCapacity = deployedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
    
    // Realistic baseline: ~42 GW (42,000 MW) operational today
    const BASE_GROUND_CAPACITY_GW = 42; // Today's operational capacity
    const baseGroundCapacity = BASE_GROUND_CAPACITY_GW * 1000; // Convert to MW
    
    // Remaining ground capacity after reduction
    const remainingGroundCapacity = baseGroundCapacity * (1 - groundDCReduction / 100);
    
    // Total capacity = deployed orbital + remaining ground
    const totalCapacity = deployedOrbitalCapacity + remainingGroundCapacity;
    
    // Baseline metrics for comparison
    const baselineLatency = 45; // ms
    const baselineEnergyPerGW = 50; // $/MWh per GW
    const baselineEnergy = baselineEnergyPerGW * BASE_GROUND_CAPACITY_GW * 8760; // Annual cost in $M
    const baselineCarbonPerGW = 350; // kg CO2/MWh per GW  
    const baselineCarbon = baselineCarbonPerGW * BASE_GROUND_CAPACITY_GW * 8760 / 1000; // Annual in metric tons
    const baselineCooling = baselineEnergy * 0.4; // 40% of energy cost

    // Calculate orbital density
    const orbitalDensity = deployedUnits.length * 50; // Each pod = 50 satellites
    
    // Use comprehensive metrics calculation with all strategic levers
    const calculatedMetrics = calculateMetrics({
      deployedOrbitalCapacity,
      remainingGroundCapacity,
      baseGroundCapacity,
      isSurgeActive,
      podTier: selectedPodTier,
      orbitMode,
      offloadPct,
      densityMode,
      cumulativeDeployedUnits: deployedUnits.length,
      orbitalDensity,
    });

    setMetrics({
      latency: calculatedMetrics.latency,
      energyCost: calculatedMetrics.energyCost,
      carbon: calculatedMetrics.carbon,
      coolingCost: calculatedMetrics.coolingCost,
      resilienceScore: calculatedMetrics.resilienceScore,
      worldImpact: calculatedMetrics.worldImpact,
      baselineLatency,
      baselineEnergy,
      baselineCarbon,
      baselineCooling,
      totalCapacity,
    });
  }, [
    orbitalComputeUnits, 
    groundDCReduction, 
    state, 
    isSurgeActive, 
    sandboxMode,
    selectedPodTier,
    orbitMode,
    offloadPct,
    densityMode,
    totalPodsBuilt,
    getDeployedUnits,
  ]);

  const latencyImprovement = ((metrics.baselineLatency - metrics.latency) / metrics.baselineLatency * 100);
  const energyImprovement = ((metrics.baselineEnergy - metrics.energyCost) / metrics.baselineEnergy * 100);
  const carbonImprovement = ((metrics.baselineCarbon - metrics.carbon) / metrics.baselineCarbon * 100);
  const coolingImprovement = ((metrics.baselineCooling - metrics.coolingCost) / metrics.baselineCooling * 100);

  return (
    <div className="fixed bottom-6 left-6 right-6 sm:right-[420px] z-30">
      <div className={`panel-glass rounded-xl p-4 sm:p-6 shadow-2xl ${isSurgeActive ? 'border-2 border-accent-orange' : ''}`}>
        {/* Mission Progress Bar */}
        {activeMissionId && (
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Mission Progress</span>
              <span className="text-accent-blue font-semibold">{missionProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-accent-blue h-2 rounded-full transition-all"
                style={{ width: `${missionProgress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Four Metric Cards */}
        <div className={`flex flex-wrap gap-3 mb-4 ${isTutorialActive && tutorialStep === 1 ? 'ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg rounded-lg p-2 animate-pulse' : ''}`}>
          <MetricCard
            title="Latency"
            current={metrics.latency}
            baseline={metrics.baselineLatency}
            unit="ms"
            color="blue"
            highlight={isTutorialActive && tutorialStep === 1}
          />
          <MetricCard
            title="Energy Cost"
            current={metrics.energyCost}
            baseline={metrics.baselineEnergy}
            unit="$"
            color="orange"
            highlight={isTutorialActive && tutorialStep === 1}
          />
          <MetricCard
            title="Cooling Cost"
            current={metrics.coolingCost}
            baseline={metrics.baselineCooling}
            unit="$/yr"
            color="blue"
            highlight={isTutorialActive && tutorialStep === 1}
          />
          <MetricCard
            title="Carbon"
            current={metrics.carbon}
            baseline={metrics.baselineCarbon}
            unit="kg"
            color="green"
            highlight={isTutorialActive && tutorialStep === 1}
          />
        </div>

        {/* Summary Line */}
        <div className="text-xs text-center text-gray-400 mb-4">
          Latency {latencyImprovement > 0 ? '↓' : '↑'} {Math.abs(latencyImprovement).toFixed(0)}%   •   Energy {energyImprovement > 0 ? '↓' : '↑'} {Math.abs(energyImprovement).toFixed(0)}%   •   Carbon {carbonImprovement > 0 ? '↓' : '↑'} {Math.abs(carbonImprovement).toFixed(0)}%   •   Cooling {coolingImprovement > 0 ? '↓' : '↑'} {Math.abs(coolingImprovement).toFixed(0)}%
        </div>

        {/* Launch Logistics Accordion */}
        <LaunchLogisticsAccordion />
      </div>
    </div>
  );
}

