"use client";

import { useState } from "react";
import { useComparisonStore } from "../store/comparisonStore";
import { StrategyMode } from "../lib/orbitSim/debugState";

export default function ComparisonMode() {
  const {
    isActive,
    strategyA,
    strategyB,
    metricsA,
    metricsB,
    setActive,
    setStrategyA,
    setStrategyB,
    reset
  } = useComparisonStore();
  
  const strategies: StrategyMode[] = ["COST", "LATENCY", "CARBON", "BALANCED"];
  
  if (!isActive) {
    return (
      <button
        onClick={() => setActive(true)}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold"
      >
        Compare Strategies
      </button>
    );
  }
  
  return (
    <div className="panel-glass p-4 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Comparison Mode</h3>
        <button
          onClick={() => {
            reset();
            setActive(false);
          }}
          className="text-gray-400 hover:text-white text-sm"
        >
          Close
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Strategy A */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Strategy A</div>
          <select
            value={strategyA || ""}
            onChange={(e) => setStrategyA(e.target.value as StrategyMode)}
            className="w-full p-2 bg-gray-800 rounded text-sm"
          >
            <option value="">Select...</option>
            {strategies.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {metricsA && (
            <div className="text-xs space-y-1 mt-2">
              <div>Orbit Share: {(metricsA.orbitShare * 100).toFixed(1)}%</div>
              <div>Latency: {metricsA.latency.toFixed(0)}ms</div>
              <div>Carbon: {metricsA.carbon.toFixed(0)}</div>
              <div>Cost: ${metricsA.cost.toFixed(2)}</div>
            </div>
          )}
        </div>
        
        {/* Strategy B */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Strategy B</div>
          <select
            value={strategyB || ""}
            onChange={(e) => setStrategyB(e.target.value as StrategyMode)}
            className="w-full p-2 bg-gray-800 rounded text-sm"
          >
            <option value="">Select...</option>
            {strategies.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {metricsB && (
            <div className="text-xs space-y-1 mt-2">
              <div>Orbit Share: {(metricsB.orbitShare * 100).toFixed(1)}%</div>
              <div>Latency: {metricsB.latency.toFixed(0)}ms</div>
              <div>Carbon: {metricsB.carbon.toFixed(0)}</div>
              <div>Cost: ${metricsB.cost.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Diff visualization */}
      {metricsA && metricsB && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="text-xs font-semibold mb-2">Comparison:</div>
          <div className="space-y-1 text-xs">
            <div>
              Orbit Share: {metricsA.orbitShare > metricsB.orbitShare ? (
                <span className="text-green-400">A wins (+{((metricsA.orbitShare - metricsB.orbitShare) * 100).toFixed(1)}%)</span>
              ) : (
                <span className="text-red-400">B wins (+{((metricsB.orbitShare - metricsA.orbitShare) * 100).toFixed(1)}%)</span>
              )}
            </div>
            <div>
              Latency: {metricsA.latency < metricsB.latency ? (
                <span className="text-green-400">A wins ({metricsA.latency.toFixed(0)}ms vs {metricsB.latency.toFixed(0)}ms)</span>
              ) : (
                <span className="text-red-400">B wins ({metricsB.latency.toFixed(0)}ms vs {metricsA.latency.toFixed(0)}ms)</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

