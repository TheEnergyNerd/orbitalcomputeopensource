"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";
import {
  getOrbitalComputeKw,
  getOrbitHybridEnergyMwhPerYear,
  getOrbitHybridCo2TonsPerYear,
  getOrbitHybridEnergyCostPerYear,
} from "../lib/sim/orbitConfig";
import { useState, useEffect } from "react";

interface MetricBoxProps {
  title: string;
  icon: string;
  baseline: number;
  current: number;
  unit: string;
  formatValue: (val: number) => string;
  positiveIsGood: boolean;
}

function MetricBox({ title, icon, baseline, current, unit, formatValue, positiveIsGood }: MetricBoxProps) {
  const delta = baseline > 0 ? ((baseline - current) / baseline) * 100 : 0;
  const isPositive = positiveIsGood ? delta > 0 : delta < 0;
  const borderColor = isPositive ? "#22c55e" : "#ef4444";
  
  // Mini sparkline data (simplified - just show trend)
  const sparklineData = [baseline, current];
  const maxVal = Math.max(baseline, current);
  const minVal = Math.min(baseline, current);
  const range = maxVal - minVal || 1;
  
  return (
    <div 
      className="bg-gray-800/90 border-2 rounded-lg p-4 flex flex-col"
      style={{ borderColor }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-semibold text-gray-300">{title}</span>
      </div>
      
      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Baseline:</span>
          <span className="text-gray-300">{formatValue(baseline)} {unit}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Current:</span>
          <span className="text-white font-semibold">{formatValue(current)} {unit}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Delta:</span>
          <span className={isPositive ? "text-green-400" : "text-red-400"}>
            {isPositive ? "+" : ""}{formatDecimal(Math.abs(delta), 1)}%
          </span>
        </div>
      </div>
      
      {/* Mini sparkline */}
      <div className="h-8 flex items-end gap-1 mb-2">
        {sparklineData.map((val, i) => {
          const height = ((val - minVal) / range) * 100;
          return (
            <div
              key={i}
              className="flex-1 bg-accent-blue/60 rounded-t"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      
      {/* Mini improvement bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${isPositive ? "bg-green-500" : "bg-red-500"}`}
          style={{ width: `${Math.min(100, Math.abs(delta))}%` }}
        />
      </div>
    </div>
  );
}

export default function OrbitalAdvantagePanel() {
  const simState = useSandboxStore((s) => s.simState);
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  if (!simState) return null;
  
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalSpec = simState.orbitalPodSpec;
  const groundSpec = simState.groundDcSpec;
  const targetComputeKw = simState.targetComputeKw;
  
  // Calculate current metrics
  const orbitalComputeKw = getOrbitalComputeKw(podsInOrbit, orbitalSpec, simState.podDegradationFactor);
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) : 0;
  
  const currentEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    orbitalComputeKw,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  const currentEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    podsInOrbit,
    orbitalSpec,
    groundSpec,
    simState.podDegradationFactor
  );
  
  // Baseline (ground-only)
  const baselineEnergyMwh = getOrbitHybridEnergyMwhPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineCo2 = getOrbitHybridCo2TonsPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  const baselineEnergyCost = getOrbitHybridEnergyCostPerYear(
    targetComputeKw,
    0,
    orbitalSpec,
    groundSpec
  );
  
  // Simplified latency calculation
  const baselineLatency = 120; // ms
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38); // 38% reduction at 100% orbital
  
  // Simplified resilience (higher is better)
  const baselineResilience = 85; // %
  const currentResilience = baselineResilience + orbitalShare * 10; // +10% at 100% orbital
  
  if (isMobile) {
    // Mobile: single metric at a time with swipe
    return (
      <div className="fixed bottom-[340px] left-1/2 transform -translate-x-1/2 w-[80%] max-w-sm z-30">
        <MetricBox
          title="Latency"
          icon="📡"
          baseline={baselineLatency}
          current={currentLatency}
          unit="ms"
          formatValue={(v) => formatDecimal(v, 1)}
          positiveIsGood={true}
        />
      </div>
    );
  }
  
  // Desktop: 2x2 grid
  return (
    <div className="fixed bottom-[340px] left-1/2 transform -translate-x-1/2 w-[600px] z-30">
      <div className="grid grid-cols-2 gap-3">
        <MetricBox
          title="Latency"
          icon="📡"
          baseline={baselineLatency}
          current={currentLatency}
          unit="ms"
          formatValue={(v) => formatDecimal(v, 1)}
          positiveIsGood={true}
        />
        <MetricBox
          title="Energy Cost"
          icon="⚡"
          baseline={baselineEnergyCost}
          current={currentEnergyCost}
          unit="$/yr"
          formatValue={(v) => `$${formatSigFigs(v / 1_000_000, 1)}M`}
          positiveIsGood={true}
        />
        <MetricBox
          title="Carbon"
          icon="☁️"
          baseline={baselineCo2}
          current={currentCo2}
          unit="t/yr"
          formatValue={(v) => formatSigFigs(v / 1000, 1) + "k"}
          positiveIsGood={true}
        />
        <MetricBox
          title="Resilience"
          icon="🛡️"
          baseline={baselineResilience}
          current={currentResilience}
          unit="%"
          formatValue={(v) => formatDecimal(v, 1)}
          positiveIsGood={true}
        />
      </div>
    </div>
  );
}

