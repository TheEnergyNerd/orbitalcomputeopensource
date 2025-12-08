"use client";

import { useState } from "react";
import { useOrbitSimStore } from "../../store/orbitSimStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

interface SharePanelProps {
  onClose: () => void;
}

/**
 * SharePanel - Shows mission completion summary with shareable text
 */
export default function SharePanel({ onClose }: SharePanelProps) {
  const { state } = useOrbitSimStore();
  const opexDelta = (state.metrics.orbitOpex - state.metrics.groundOpex) / state.metrics.groundOpex;
  const latencyDeltaMs = state.metrics.orbitLatency - state.metrics.groundLatency;
  const carbonDelta = (state.metrics.orbitCarbon - state.metrics.groundCarbon) / state.metrics.groundCarbon;
  
  const opexPct = Math.abs(opexDelta * 100);
  const latencyMs = Math.abs(latencyDeltaMs);
  const carbonPct = Math.abs(carbonDelta * 100);
  
  const bragText = `Just ran the Orbital Compute sim:
${formatDecimal(opexPct, 1)}% ${opexDelta < 0 ? 'cheaper' : 'more expensive'} than pure ground, ${formatDecimal(latencyMs, 1)} ms ${latencyDeltaMs < 0 ? 'faster' : 'slower'}, ${formatDecimal(carbonPct, 1)}% ${carbonDelta < 0 ? 'less' : 'more'} carbon.
My OrbitScore: ${state.orbitScore.toLocaleString()}. Can you beat it?`;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bragText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 pointer-events-auto"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
        <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xl font-semibold text-white">
              Mission Complete: {state.currentMission.name}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
          </div>

          <div className="mb-4">
            <div className="text-sm font-semibold text-gray-300 mb-2">Your Orbit Mix:</div>
            <ul className="text-sm text-gray-300 space-y-1">
              <li className={opexDelta < 0 ? 'text-green-400' : 'text-red-400'}>
                • {formatDecimal(opexPct, 1)}% {opexDelta < 0 ? 'cheaper' : 'more expensive'} OPEX than ground
              </li>
              <li className={latencyDeltaMs < 0 ? 'text-green-400' : 'text-red-400'}>
                • {formatDecimal(latencyMs, 1)} ms {latencyDeltaMs < 0 ? 'faster' : 'slower'} latency
              </li>
              <li className={carbonDelta < 0 ? 'text-green-400' : 'text-red-400'}>
                • {formatDecimal(carbonPct, 1)}% {carbonDelta < 0 ? 'less' : 'more'} carbon
              </li>
            </ul>
          </div>

          <div className="mb-4">
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              OrbitScore: {state.orbitScore.toLocaleString()}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-2">Brag Text:</div>
            <div className="bg-gray-800 p-3 rounded text-xs text-gray-300 font-mono whitespace-pre-wrap">
              {bragText}
            </div>
          </div>

          <button
            onClick={handleCopy}
            className="w-full py-2 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded transition"
          >
            {copied ? '✓ Copied!' : 'Copy Brag Text'}
          </button>
        </div>
      </div>
    </div>
  );
}

