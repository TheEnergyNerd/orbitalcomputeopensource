"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { ConstellationParams } from '../../lib/ai/constellationTypes';
import { evalConstellation } from '../../lib/ai/constellationEval';
import { aiDesignConstellation } from '../../lib/ai/constellationEval';
import type { ConstellationMode } from '../../lib/ai/constellationEval';

interface ConstellationEditorV2Props {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function ConstellationEditorV2({ isOpen: externalIsOpen, onClose }: ConstellationEditorV2Props = {}) {
  const { config, updateConfig } = useSimulationStore();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = onClose ? onClose : setInternalIsOpen;
  const [selectedRing, setSelectedRing] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  // If controlled externally, don't show the button
  if (!isOpen && externalIsOpen === undefined) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-24 left-96 z-40 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg border border-slate-700 pointer-events-auto shadow-lg"
      >
        Constellation
      </button>
    );
  }
  
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed top-24 left-2 sm:left-4 md:left-96 w-[calc(100vw-1rem)] sm:w-80 md:w-96 lg:w-[420px] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-800 bg-slate-950/95 px-3 sm:px-4 py-3 pointer-events-auto max-h-[85vh] overflow-y-auto shadow-xl" style={{ zIndex: 200 }} data-tutorial-constellation-panel>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Constellation Designer</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>

      {/* Real-time Metrics */}
      <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-xs text-slate-400 mb-2">Real-Time Metrics</div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-slate-500">Latency</div>
            <div className="text-white font-semibold">{metrics.latencyMs.toFixed(1)} ms</div>
          </div>
          <div>
            <div className="text-slate-500">Capacity</div>
            <div className="text-white font-semibold">{metrics.capacityUnits.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-slate-500">Redundancy</div>
            <div className="text-white font-semibold">{(metrics.redundancyScore * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* AI Design Presets */}
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

      {/* Visual Orbit Rings */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-400">Orbit Shells ({constellation.shells.length}/3)</div>
          {constellation.shells.length < 3 && (
            <button
              onClick={handleAddShell}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 px-2 py-1 bg-cyan-500/10 rounded"
            >
              + Add Ring
            </button>
          )}
        </div>
        
        {/* Visual representation */}
        <div className="relative h-48 bg-slate-900/50 rounded-lg border border-slate-700 mb-3 overflow-hidden">
          <svg ref={svgRef} width="100%" height="100%" className="absolute inset-0">
            {/* Earth circle */}
            <circle
              cx="50%"
              cy="50%"
              r="30%"
              fill="#1e3a8a"
              stroke="#3b82f6"
              strokeWidth="1"
            />
            {/* Orbit rings */}
            {constellation.shells.map((shell, idx) => {
              const radius = 30 + (shell.altitudeKm / 2000) * 20; // Scale altitude to radius
              const isSelected = selectedRing === idx;
              return (
                <g key={idx}>
                  <circle
                    cx="50%"
                    cy="50%"
                    r={`${radius}%`}
                    fill="none"
                    stroke={isSelected ? "#00d4ff" : "#10b981"}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray={isSelected ? "none" : "5,5"}
                    opacity={0.6}
                    className="cursor-pointer"
                    onClick={() => setSelectedRing(isSelected ? null : idx)}
                  />
                  {/* Satellite dots */}
                  {Array.from({ length: Math.min(shell.planes * shell.satsPerPlane, 50) }).map((_, satIdx) => {
                    const angle = (satIdx / Math.min(shell.planes * shell.satsPerPlane, 50)) * 360;
                    const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
                    const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
                    return (
                      <circle
                        key={satIdx}
                        cx={`${x}%`}
                        cy={`${y}%`}
                        r="2"
                        fill="#00d4ff"
                        opacity={0.8}
                      />
                    );
                  })}
                  {/* Altitude label */}
                  <text
                    x="50%"
                    y={`${50 - radius - 2}%`}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="10"
                    className="pointer-events-none"
                  >
                    {shell.altitudeKm}km
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Shell controls */}
        <div className="space-y-3">
          {constellation.shells.map((shell, idx) => (
            <div
              key={idx}
              className={`border rounded-lg p-2 ${
                selectedRing === idx ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/50'
              }`}
            >
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
                  <label className="text-[10px] text-slate-500 block">
                    Altitude: {shell.altitudeKm} km
                  </label>
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
                  <label className="text-[10px] text-slate-500 block">
                    Planes: {shell.planes}
                  </label>
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
                  <label className="text-[10px] text-slate-500 block">
                    Sats/Plane: {shell.satsPerPlane}
                  </label>
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
                {/* Per-shell metrics */}
                <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-700">
                  <div>Total Sats: {shell.planes * shell.satsPerPlane}</div>
                  <div>Coverage: {((shell.planes / 24) * 100).toFixed(0)}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

