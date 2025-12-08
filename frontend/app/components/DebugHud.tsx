/**
 * Debug HUD - Always-visible simulation state display (dev mode only)
 * Shows single source of truth numbers that all tabs should match
 * Only visible in the futures tab
 */

"use client";

import { useSimulationStore } from '../store/simulationStore';
import type { SurfaceType } from './SurfaceTabs';

interface DebugHudProps {
  activeSurface?: SurfaceType;
}

export default function DebugHud({ activeSurface }: DebugHudProps) {
  // Only show in futures tab
  if (activeSurface !== 'futures') {
    return null;
  }

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const timeline = useSimulationStore((s) => s.timeline);
  const selectedYearIndex = useSimulationStore((s) => s.selectedYearIndex);
  const futuresForecast = useSimulationStore((s) => s.futuresForecast);
  const futuresSentiment = useSimulationStore((s) => s.futuresSentiment);

  if (!timeline || timeline.length === 0) {
    return null;
  }

  const currentStep = timeline[selectedYearIndex] || timeline[timeline.length - 1];
  
  // Calculate sentiment info
  const pOrbitCheaper = futuresForecast?.probOrbitCheaperByHorizon ?? 0.5;
  const sentimentScore = (pOrbitCheaper - 0.5) * 2;
  let sentimentLabel: "Bullish on Orbit" | "Neutral on Orbit" | "Bearish on Orbit" = "Neutral on Orbit";
  if (sentimentScore > 0.2) {
    sentimentLabel = "Bullish on Orbit";
  } else if (sentimentScore < -0.2) {
    sentimentLabel = "Bearish on Orbit";
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-black/90 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono pointer-events-none">
      <div className="text-slate-300 space-y-1">
        <div>
          <span className="text-slate-500">Year:</span>{' '}
          <span className="text-white">{currentStep.year}</span>
        </div>
        <div>
          <span className="text-slate-500">Pods (cumulative):</span>{' '}
          <span className="text-white">{Math.round(currentStep.podsTotal || 0)}</span>
        </div>
        <div>
          <span className="text-slate-500">Orbit share:</span>{' '}
          <span className="text-white">{((currentStep.orbitalShare || 0) * 100).toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-slate-500">Cost Mix:</span>{' '}
          <span className="text-white">${(currentStep.costPerComputeMix || 0).toFixed(0)}/unit</span>
        </div>
        <div>
          <span className="text-slate-500">Latency Mix:</span>{' '}
          <span className="text-white">{(currentStep.latencyMixMs || 0).toFixed(1)} ms</span>
        </div>
        <div>
          <span className="text-slate-500">Carbon Mix:</span>{' '}
          <span className="text-white">{((currentStep.carbonMix || 0) / 1000).toFixed(0)} ktCO₂</span>
        </div>
        {futuresForecast && (
          <>
            <div>
              <span className="text-slate-500">pOrbitCheaper:</span>{' '}
              <span className="text-white">{(pOrbitCheaper * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-slate-500">Sentiment:</span>{' '}
              <span className={sentimentScore > 0.2 ? 'text-green-400' : sentimentScore < -0.2 ? 'text-red-400' : 'text-gray-400'}>
                {sentimentLabel} ({sentimentScore.toFixed(2)})
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

