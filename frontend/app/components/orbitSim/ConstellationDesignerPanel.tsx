"use client";

import React, { useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { ConstellationParams } from '../../lib/ai/constellationTypes';
import { evalConstellation } from '../../lib/ai/constellationEval';
import { aiDesignConstellation, type ConstellationMode } from '../../lib/ai/constellationEval';

export default function ConstellationDesignerPanel() {
  const { config, updateConfig } = useSimulationStore();
  const [isOpen, setIsOpen] = useState(false);

  const constellation = config.constellation || { shells: [{ altitudeKm: 550, planes: 8, satsPerPlane: 20 }] };
  const metrics = evalConstellation(constellation);

  const handleShellChange = (shellIndex: number, field: 'altitudeKm' | 'planes' | 'satsPerPlane', value: number) => {
    const newShells = [...constellation.shells];
    newShells[shellIndex] = { ...newShells[shellIndex], [field]: value };
    updateConfig({ constellation: { shells: newShells } });
  };

  const handleAddShell = () => {
    if (constellation.shells.length < 3) {
      updateConfig({
        constellation: {
          shells: [...constellation.shells, { altitudeKm: 800, planes: 6, satsPerPlane: 15 }],
        },
      });
    }
  };

  const handleRemoveShell = (index: number) => {
    if (constellation.shells.length > 1) {
      const newShells = constellation.shells.filter((_, i) => i !== index);
      updateConfig({ constellation: { shells: newShells } });
    }
  };

  const handleAiDesign = (mode: ConstellationMode) => {
    const designed = aiDesignConstellation(mode);
    updateConfig({ constellation: designed });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-24 right-52 z-40 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg border border-slate-700 pointer-events-auto"
      >
        Constellation
      </button>
    );
  }

  return (
    <div className="fixed top-24 right-52 z-40 w-96 rounded-2xl border border-slate-800 bg-slate-950/95 px-4 py-3 pointer-events-auto max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Constellation Designer</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Metrics */}
      <div className="mb-4 p-3 bg-slate-900/50 rounded-lg">
        <div className="text-xs text-slate-400 mb-2">Metrics</div>
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Latency:</span>
            <span className="text-white">{metrics.latencyMs.toFixed(1)} ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Capacity:</span>
            <span className="text-white">{metrics.capacityUnits.toFixed(0)} units</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Redundancy:</span>
            <span className="text-white">{(metrics.redundancyScore * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* AI Design Buttons */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-2">AI Design</div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleAiDesign("latency")}
            className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] rounded"
          >
            Low Latency
          </button>
          <button
            onClick={() => handleAiDesign("capacity")}
            className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] rounded"
          >
            Max Capacity
          </button>
          <button
            onClick={() => handleAiDesign("resilience")}
            className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] rounded"
          >
            High Resilience
          </button>
        </div>
      </div>

      {/* Shells */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-400">Shells ({constellation.shells.length}/3)</div>
          {constellation.shells.length < 3 && (
            <button
              onClick={handleAddShell}
              className="text-[10px] text-cyan-400 hover:text-cyan-300"
            >
              + Add Shell
            </button>
          )}
        </div>
        <div className="space-y-3">
          {constellation.shells.map((shell, idx) => (
            <div key={idx} className="border border-slate-700 rounded p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-300">Shell {idx + 1}</span>
                {constellation.shells.length > 1 && (
                  <button
                    onClick={() => handleRemoveShell(idx)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-500 block">Altitude: {shell.altitudeKm} km</label>
                  <input
                    type="range"
                    min="300"
                    max="2000"
                    step="50"
                    value={shell.altitudeKm}
                    onChange={(e) => handleShellChange(idx, 'altitudeKm', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Planes: {shell.planes}</label>
                  <input
                    type="range"
                    min="4"
                    max="24"
                    step="1"
                    value={shell.planes}
                    onChange={(e) => handleShellChange(idx, 'planes', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block">Sats/Plane: {shell.satsPerPlane}</label>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="1"
                    value={shell.satsPerPlane}
                    onChange={(e) => handleShellChange(idx, 'satsPerPlane', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


