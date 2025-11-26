"use client";

import { useSimStore } from "../store/simStore";
import { useSandboxStore } from "../store/sandboxStore";

export default function CompactLatencyProbe() {
  const state = useSimStore((s) => s.state);
  const { orbitalComputeUnits, groundDCReduction } = useSandboxStore();
  
  if (!state) return null;
  
  // Calculate orbit share
  const totalCompute = orbitalComputeUnits + (100 - groundDCReduction);
  const orbitShare = totalCompute > 0 ? (orbitalComputeUnits / totalCompute) : 0;
  
  // Simple latency calculations
  const groundLatency = 45; // Baseline
  const orbitLatency = 30; // Lower due to global coverage
  const hybridLatency = groundLatency * (1 - orbitShare) + orbitLatency * orbitShare;
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-2 text-xs">
      <div className="flex gap-3 justify-center">
        <span className="text-gray-400">Ground <span className="text-white font-semibold">{groundLatency}ms</span></span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">Orbit <span className="text-white font-semibold">{orbitLatency}ms</span></span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">Hybrid <span className="text-accent-blue font-semibold">{hybridLatency.toFixed(0)}ms</span></span>
      </div>
    </div>
  );
}

