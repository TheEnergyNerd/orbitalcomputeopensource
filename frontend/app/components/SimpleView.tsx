"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { getOrbitalComputeKw } from "../lib/sim/orbitConfig";
import { formatSigFigs, formatDecimal } from "../lib/utils/formatNumber";
import OrbitalAdvantagePanelV2 from "./OrbitalAdvantagePanelV2";

/**
 * SimpleView - Clean, minimal view showing only:
 * - Top controls (orbital share, pod tech, launch capacity, ground energy)
 * - Globe
 * - Metrics panel (2x2 grid)
 * - Deployment summary sentence
 */
export default function SimpleView() {
  const { simState } = useSandboxStore();

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  // Calculate deployment metrics
  const podsPerMonth = (simState.resources.pods?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerMonth = (simState.resources.launches?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerYear = launchesPerMonth * 12;
  const podsPerYear = podsPerMonth * 12;

  // Calculate orbital share
  const podsInOrbit = Math.floor(simState.podsInOrbit);
  const orbitalComputeKw = getOrbitalComputeKw(
    podsInOrbit,
    simState.orbitalPodSpec,
    simState.podDegradationFactor
  );
  const targetComputeKw = simState.targetComputeKw;
  const orbitalShare = targetComputeKw > 0 ? (orbitalComputeKw / targetComputeKw) * 100 : 0;

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Top Controls - Simplified */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 panel">
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-gray-400">Orbital Share:</span>
            <span className="ml-2 text-white font-semibold">{formatDecimal(orbitalShare, 1)}%</span>
          </div>
          <div>
            <span className="text-gray-400">Pods/Year:</span>
            <span className="ml-2 text-white font-semibold">{formatDecimal(podsPerYear, 0)}</span>
          </div>
          <div>
            <span className="text-gray-400">Launches/Year:</span>
            <span className="ml-2 text-white font-semibold">{formatDecimal(launchesPerYear, 0)}</span>
          </div>
        </div>
      </div>

      {/* Globe - Center (already rendered in page.tsx) */}
      {/* Metrics Panel - Bottom Center */}
      <OrbitalAdvantagePanelV2 />

      {/* Deployment Summary - Bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 panel max-w-2xl">
        <p className="text-xs text-gray-300 text-center mb-2">
          To reach <span className="text-white font-semibold">{formatDecimal(orbitalShare, 1)}%</span> orbital share, 
          you're deploying about <span className="text-white font-semibold">{formatDecimal(podsPerYear, 0)}</span> pods 
          and <span className="text-white font-semibold">{formatDecimal(launchesPerYear, 0)}</span> launches/year.
        </p>
        <div className="text-center">
          <button
            onClick={() => {
              // Switch to Advanced tab via ModeTabs
              const event = new CustomEvent('switchMode', { detail: 'advanced' });
              window.dispatchEvent(event);
            }}
            className="text-[10px] text-gray-400 hover:text-cyan-400 underline"
          >
            Deep dive: industrial / advanced view →
          </button>
        </div>
      </div>
    </div>
  );
}

