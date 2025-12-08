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
  baseline: number; // Ground only
  current: number; // Ground + Orbit mix
  unit: string;
  formatValue: (val: number) => string;
  formatDelta: (val: number) => string; // Format for delta line
  lowerIsBetter: boolean; // true for cost, OPEX, carbon, latency
}

function MetricBox({ title, icon, baseline, current, unit, formatValue, formatDelta, lowerIsBetter }: MetricBoxProps) {
  // Calculate delta
  const deltaAbs = current - baseline;
  const deltaPct = baseline > 0 ? (deltaAbs / baseline) * 100 : 0;
  
  // Determine if mix is better (lower is better for cost/OPEX/carbon/latency)
  const isBetter = lowerIsBetter ? deltaAbs < 0 : deltaAbs > 0;
  const isWorse = lowerIsBetter ? deltaAbs > 0 : deltaAbs < 0;
  const isNeutral = Math.abs(deltaPct) <= 5;
  
  // Verdict pill text and color
  let verdictText = "Tradeoff";
  let verdictColor = "bg-gray-600";
  if (isBetter && !isNeutral) {
    verdictText = "Better with Orbit";
    verdictColor = "bg-green-600";
  } else if (isWorse && !isNeutral) {
    verdictText = "Worse with Orbit";
    verdictColor = "bg-red-600";
  }
  
  // Delta line color
  const deltaColor = isBetter ? "text-green-400" : isWorse ? "text-red-400" : "text-gray-400";
  
  // Compact relative bar
  const minVal = Math.min(baseline, current);
  const maxVal = Math.max(baseline, current);
  const range = maxVal - minVal || 1;
  const baselinePos = ((baseline - minVal) / range) * 100;
  const currentPos = ((current - minVal) / range) * 100;
  const barColor = isBetter ? "bg-green-500/30" : isWorse ? "bg-red-500/30" : "bg-gray-500/30";
  
  return (
    <div 
      className="panel border border-gray-700"
      style={{ width: "240px", minHeight: "160px" }}
    >
      {/* Top: Title + Verdict pill */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1">
          <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-gray-300">{title}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${verdictColor} text-white`}>
          {verdictText}
        </span>
      </div>
      
      {/* Middle: Two rows with values */}
      <div className="space-y-1 mb-3">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-500">Ground only:</span>
          <span className="text-xs text-gray-300 font-mono">{formatValue(baseline)} {unit}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-500">Ground + Orbit mix:</span>
          <span className="text-xs text-white font-mono font-semibold">{formatValue(current)} {unit}</span>
        </div>
      </div>
      
      {/* Compact relative bar */}
      <div className="relative h-2 bg-gray-800 rounded-full mb-3 overflow-visible">
        <div 
          className={`absolute h-full ${barColor} rounded-full`}
          style={{
            left: `${Math.min(baselinePos, currentPos)}%`,
            width: `${Math.abs(currentPos - baselinePos)}%`,
          }}
        />
        <div
          className="absolute top-1/2 transform -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full border border-white"
          style={{ left: `${baselinePos}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-[8px] text-gray-400">G</span>
        </div>
        <div
          className="absolute top-1/2 transform -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full border border-white"
          style={{ left: `${currentPos}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-[8px] text-cyan-400">Mix</span>
        </div>
      </div>
      
      {/* Bottom: Delta line */}
      <div className={`text-[10px] ${deltaColor} text-center`}>
        {(() => {
          const deltaText = formatDelta(Math.abs(deltaAbs));
          let directionText = "";
          if (unit === "ms") {
            // Latency: faster/slower
            directionText = deltaAbs < 0 ? "faster" : "slower";
          } else if (unit.includes("$") || unit.includes("t/yr")) {
            // Cost/OPEX/Carbon: cheaper/more expensive
            directionText = deltaAbs < 0 ? "cheaper" : "more expensive";
          } else {
            // Resilience: better/worse
            directionText = deltaAbs > 0 ? "better" : "worse";
          }
          return `${deltaAbs >= 0 ? "+" : "-"}${deltaText} ${directionText} (${deltaPct >= 0 ? "+" : ""}${formatDecimal(Math.abs(deltaPct), 1)}%)`;
        })()}
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
      <div className="fixed bottom-[20px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto">
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
    <div className="fixed bottom-[20px] left-1/2 transform -translate-x-1/2 z-30 panel pointer-events-auto" style={{ width: "80%", maxWidth: "520px" }}>
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
          formatValue={(v) => formatDecimal(v, 1)}
          formatDelta={(v) => `${formatDecimal(v, 2)} ms`}
          lowerIsBetter={true}
        />
        <MetricBox
          title="Energy Cost"
          icon="⚡"
          baseline={baselineEnergyCost}
          current={currentEnergyCost}
          unit="$/yr"
          formatValue={(v) => `$${formatSigFigs(v / 1_000_000, 1)}M`}
          formatDelta={(v) => `$${formatSigFigs(v / 1_000_000, 1)}M`}
          lowerIsBetter={true}
        />
        <MetricBox
          title="Carbon"
          icon="☁️"
          baseline={baselineCo2}
          current={currentCo2}
          unit="t/yr"
          formatValue={(v) => formatSigFigs(v / 1000, 1) + "k"}
          formatDelta={(v) => `${formatSigFigs(v / 1000, 1)}k t/yr`}
          lowerIsBetter={true}
        />
        <MetricBox
          title="Resilience"
          icon="🛡️"
          baseline={baselineResilience}
          current={currentResilience}
          unit="%"
          formatValue={(v) => formatDecimal(v, 0)}
          formatDelta={(v) => `${formatDecimal(v, 1)}%`}
          lowerIsBetter={false}
        />
      </div>
    </div>
  );
}

