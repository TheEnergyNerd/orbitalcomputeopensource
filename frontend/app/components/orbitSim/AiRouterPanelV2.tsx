"use client";

import React, { useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { RouterPolicy, RouterWeights } from '../../lib/ai/routerTypes';
import { defaultPolicy, JOB_TYPES, DESTS } from '../../lib/ai/routerTypes';
import { optimizeRouterPolicy } from '../../lib/ai/routerOptimize';
import { evalRouterPolicy, type JobDemand } from '../../lib/ai/routerEval';

type RoutingPreset = "latency-first" | "cost-first" | "carbon-first" | "balanced";

const PRESETS: Record<RoutingPreset, { weights: RouterWeights; policy: RouterPolicy }> = {
  "latency-first": {
    weights: { cost: 0.2, latency: 2.0, carbon: 0.3 },
    policy: {
      jobs: {
        realtime: { groundEdge: 0.9, groundCore: 0.1, orbit: 0.0 },
        interactive: { groundEdge: 0.7, groundCore: 0.2, orbit: 0.1 },
        batch: { groundEdge: 0.3, groundCore: 0.4, orbit: 0.3 },
        cold: { groundEdge: 0.1, groundCore: 0.3, orbit: 0.6 },
      },
    },
  },
  "cost-first": {
    weights: { cost: 2.0, latency: 0.3, carbon: 0.2 },
    policy: {
      jobs: {
        realtime: { groundEdge: 0.4, groundCore: 0.3, orbit: 0.3 },
        interactive: { groundEdge: 0.2, groundCore: 0.3, orbit: 0.5 },
        batch: { groundEdge: 0.1, groundCore: 0.2, orbit: 0.7 },
        cold: { groundEdge: 0.0, groundCore: 0.1, orbit: 0.9 },
      },
    },
  },
  "carbon-first": {
    weights: { cost: 0.3, latency: 0.4, carbon: 2.0 },
    policy: {
      jobs: {
        realtime: { groundEdge: 0.5, groundCore: 0.2, orbit: 0.3 },
        interactive: { groundEdge: 0.3, groundCore: 0.2, orbit: 0.5 },
        batch: { groundEdge: 0.1, groundCore: 0.1, orbit: 0.8 },
        cold: { groundEdge: 0.0, groundCore: 0.0, orbit: 1.0 },
      },
    },
  },
  "balanced": {
    weights: { cost: 1.0, latency: 1.0, carbon: 1.0 },
    policy: defaultPolicy,
  },
};

interface AiRouterPanelV2Props {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AiRouterPanelV2({ isOpen: externalIsOpen, onClose }: AiRouterPanelV2Props = {}) {
  const { config, updateConfig, yearPlans, setForecastBands } = useSimulationStore();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = onClose ? onClose : setInternalIsOpen;
  const [showTraffic, setShowTraffic] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<RoutingPreset>("balanced");

  const routerPolicy = config.routerPolicy || defaultPolicy;
  const routerWeights = config.routerWeights || { cost: 1, latency: 1, carbon: 1 };
  const aiControlPercent = config.aiControlPercent ?? 0.5;

  const handlePresetSelect = (preset: RoutingPreset) => {
    setSelectedPreset(preset);
    const presetData = PRESETS[preset];
    updateConfig({
      routerPolicy: presetData.policy,
      routerWeights: presetData.weights,
    });
  };

  const handleWeightChange = (key: keyof RouterWeights, value: number) => {
    updateConfig({
      routerWeights: { ...routerWeights, [key]: value },
    });
    setSelectedPreset("balanced"); // Reset to balanced if manually adjusted
  };

  const handlePolicyChange = (jobTypeId: string, destId: string, value: number) => {
    const newPolicy: RouterPolicy = {
      jobs: {
        ...routerPolicy.jobs,
        [jobTypeId]: {
          ...routerPolicy.jobs[jobTypeId as keyof typeof routerPolicy.jobs],
          [destId]: value,
        },
      },
    };
    // Normalize row
    const row = newPolicy.jobs[jobTypeId as keyof typeof routerPolicy.jobs];
    const sum = Object.values(row).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const k in row) {
        row[k as keyof typeof row] /= sum;
      }
    }
    updateConfig({ routerPolicy: newPolicy });
    setSelectedPreset("balanced");
  };

  // If controlled externally, don't show the button
  if (!isOpen && externalIsOpen === undefined) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-24 left-4 z-40 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg border border-slate-700 pointer-events-auto shadow-lg"
      >
        AI Router
      </button>
    );
  }
  
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed top-24 left-2 sm:left-4 w-[calc(100vw-1rem)] sm:w-80 md:w-96 lg:w-[420px] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-800 bg-slate-950/95 px-3 sm:px-4 py-3 pointer-events-auto max-h-[85vh] overflow-y-auto shadow-xl" style={{ zIndex: 200 }} data-tutorial-ai-router-panel>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">AI Job Router</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>

      {/* Presets */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2">Routing Strategy</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => handlePresetSelect(key as RoutingPreset)}
              className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                selectedPreset === key
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600'
              }`}
            >
              {key.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>
      </div>

      {/* AI Control */}
      <div className="mb-4">
        <label className="text-xs text-slate-400 mb-2 block">
          AI Control: {(aiControlPercent * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={aiControlPercent}
          onChange={(e) => updateConfig({ aiControlPercent: parseFloat(e.target.value) })}
          className="w-full"
        />
        <div className="text-[10px] text-slate-500 mt-1">
          Higher = more AI-driven routing adjustments
        </div>
      </div>


      {/* Traffic Flow Visualization */}
      {/* TODO: Add TrafficSankey component for traffic flow visualization */}
      {/* {showTraffic && (
        <div className="mb-4 border-t border-slate-800 pt-4">
          <TrafficSankey routerPolicy={routerPolicy} totalJobs={1000} />
        </div>
      )} */}

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
        <button
          onClick={() => {
            const newValue = !showTraffic;
            setShowTraffic(newValue);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('traffic-toggle', { detail: { showTraffic: newValue } }));
            }
          }}
          className={`w-full px-3 py-2 text-xs rounded-lg ${
            showTraffic
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-white'
          }`}
        >
          {showTraffic ? 'Hide' : 'Show'} Traffic
        </button>
      </div>
    </div>
  );
}

