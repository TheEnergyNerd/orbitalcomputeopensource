"use client";

import React, { useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { RouterPolicy, RouterWeights } from '../../lib/ai/routerTypes';
import { defaultPolicy, JOB_TYPES, DESTS } from '../../lib/ai/routerTypes';
import { optimizeRouterPolicy } from '../../lib/ai/routerOptimize';
import { evalRouterPolicy, type JobDemand } from '../../lib/ai/routerEval';
import { generateForecastBands, type SimInput } from '../../lib/orbitSim/forecast';

export default function AiRouterPanel() {
  const { config, updateConfig, yearPlans, setForecastBands } = useSimulationStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [isGeneratingForecast, setIsGeneratingForecast] = useState(false);

  const routerPolicy = config.routerPolicy || defaultPolicy;
  const routerWeights = config.routerWeights || { cost: 1, latency: 1, carbon: 1 };
  const aiControlPercent = config.aiControlPercent ?? 0.5;

  const handleOptimize = () => {
    // Create synthetic demand for optimization
    const demand: JobDemand[] = [
      { jobTypeId: "realtime", jobsPerYear: 100 },
      { jobTypeId: "interactive", jobsPerYear: 200 },
      { jobTypeId: "batch", jobsPerYear: 100 },
      { jobTypeId: "cold", jobsPerYear: 50 },
    ];

    const optimized = optimizeRouterPolicy(routerPolicy, routerWeights, demand, 100);
    updateConfig({ routerPolicy: optimized });
  };

  const handleWeightChange = (key: keyof RouterWeights, value: number) => {
    updateConfig({
      routerWeights: { ...routerWeights, [key]: value },
    });
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
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-24 right-4 z-40 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg border border-slate-700 pointer-events-auto"
      >
        AI Router
      </button>
    );
  }

  return (
    <div className="fixed top-24 right-4 z-40 w-96 rounded-2xl border border-slate-800 bg-slate-950/95 px-4 py-3 pointer-events-auto max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">AI Job Router</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Router Weights */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2">Optimization Weights</div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-slate-500">Cost</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={routerWeights.cost}
              onChange={(e) => handleWeightChange('cost', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-[10px] text-slate-400">{routerWeights.cost.toFixed(1)}</div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Latency</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={routerWeights.latency}
              onChange={(e) => handleWeightChange('latency', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-[10px] text-slate-400">{routerWeights.latency.toFixed(1)}</div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Carbon</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={routerWeights.carbon}
              onChange={(e) => handleWeightChange('carbon', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="text-[10px] text-slate-400">{routerWeights.carbon.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* AI Control */}
      <div className="mb-4">
        <label className="text-xs text-slate-400 mb-2 block">AI Control: {(aiControlPercent * 100).toFixed(0)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={aiControlPercent}
          onChange={(e) => updateConfig({ aiControlPercent: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Policy Matrix */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2">Routing Policy</div>
        <div className="space-y-2 text-[10px]">
          {JOB_TYPES.map(jobType => (
            <div key={jobType.id} className="border border-slate-700 rounded p-2">
              <div className="text-slate-300 mb-1">{jobType.label}</div>
              {DESTS.map(dest => {
                const value = routerPolicy.jobs[jobType.id]?.[dest.id] ?? 0;
                return (
                  <div key={dest.id} className="flex items-center gap-2 mb-1">
                    <span className="w-20 text-slate-500">{dest.label}</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={value}
                      onChange={(e) => handlePolicyChange(jobType.id, dest.id, parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-10 text-slate-400 text-right">{(value * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={handleOptimize}
            className="flex-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded-lg"
          >
            Optimize Policy
          </button>
        <button
          onClick={() => {
            const newValue = !showTraffic;
            setShowTraffic(newValue);
            // Dispatch event for GlobeWrapper to listen
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('traffic-toggle', { detail: { showTraffic: newValue } }));
            }
          }}
          className={`flex-1 px-3 py-2 text-xs rounded-lg ${
            showTraffic
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-white'
          }`}
        >
          {showTraffic ? 'Hide' : 'Show'} Traffic
        </button>
        </div>
        <button
          onClick={() => {
            setIsGeneratingForecast(true);
            const baseScenario: SimInput = {
              config,
              yearPlans,
              routerPolicy,
              routerWeights,
              constellation: config.constellation,
            };
            // Run in background to avoid blocking UI
            setTimeout(() => {
              try {
                const bands = generateForecastBands({ baseScenario, numScenarios: 32 });
                setForecastBands(bands);
              } catch (error) {
                console.error('Forecast generation failed:', error);
              } finally {
                setIsGeneratingForecast(false);
              }
            }, 100);
          }}
          disabled={isGeneratingForecast}
          className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white text-xs rounded-lg"
        >
          {isGeneratingForecast ? 'Generating...' : 'Generate Forecast'}
        </button>
      </div>
    </div>
  );
}

