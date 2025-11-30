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
  
  // Mini sparkline data
  const sparklineData = [baseline, current];
  const maxVal = Math.max(baseline, current);
  const minVal = Math.min(baseline, current);
  const range = maxVal - minVal || 1;
  
  return (
    <div 
      className="panel border-2"
      style={{ borderColor, width: "240px", height: "140px" }}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-semibold text-gray-300">{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-500">G:</span>
          <span className="text-gray-300">{formatValue(baseline)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-500">O:</span>
          <span className="text-white font-semibold">{formatValue(current)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-500">Δ:</span>
          <span className={isPositive ? "text-green-400" : "text-red-400"}>
            {isPositive ? "+" : ""}{formatDecimal(Math.abs(delta), 1)}%
          </span>
        </div>
      </div>
      
      {/* Mini sparkline */}
      <div className="h-4 flex items-end gap-0.5 mb-1">
        {sparklineData.map((val, i) => {
          const height = ((val - minVal) / range) * 100;
          return (
            <div
              key={i}
              className="flex-1 bg-accent-blue/40 rounded-t"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      
      {/* Subtle improvement bar */}
      <div className="h-1 bg-gray-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${isPositive ? "bg-green-500/60" : "bg-red-500/60"}`}
          style={{ width: `${Math.min(100, Math.abs(delta))}%` }}
        />
      </div>
    </div>
  );
}

export default function OrbitalAdvantagePanelV2() {
  const simState = useSandboxStore((s) => s.simState);
  const [isCollapsed, setIsCollapsed] = useState(false);
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
  const currentLatency = baselineLatency * (1 - orbitalShare * 0.38);
  
  // Simplified resilience
  const baselineResilience = 85; // %
  const currentResilience = baselineResilience + orbitalShare * 10;
  
  if (isCollapsed) {
    // Collapsed: just icons in a row
    return (
      <div className="fixed bottom-[20px] left-1/2 transform -translate-x-1/2 z-30 panel">
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="text-lg">📡</span>
          <span className="text-lg">⚡</span>
          <span className="text-lg">☁️</span>
          <span className="text-lg">🛡️</span>
          <button
            onClick={() => setIsCollapsed(false)}
            className="ml-2 text-xs text-gray-400 hover:text-white"
          >
            ▼ Metrics
          </button>
        </div>
      </div>
    );
  }
  
  // Expanded: 2x2 grid
  return (
    <div className="fixed bottom-[20px] left-1/2 transform -translate-x-1/2 z-30 panel" style={{ width: "80%", maxWidth: "520px" }}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-gray-300">ORBITAL ADVANTAGE</span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-xs text-gray-400 hover:text-white"
        >
          ▲ Metrics
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricBox
          title="Latency"
          icon="📡"
          baseline={baselineLatency}
          current={currentLatency}
          unit="ms"
          formatValue={(v) => formatDecimal(v, 0)}
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
          formatValue={(v) => formatDecimal(v, 0)}
          positiveIsGood={true}
        />
      </div>
    </div>
  );
}

