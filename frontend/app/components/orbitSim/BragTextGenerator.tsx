"use client";

import { useSimpleModeStore } from "../../store/simpleModeStore";
import { ROCKETS, POD_TYPES } from "../../lib/orbitSim/orbitConfigs";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * Brag Text Generator - Creates shareable text from Simple Mode results
 */
export default function BragTextGenerator() {
  const { rocketId, podTypeId, podsDeployed, metrics } = useSimpleModeStore();

  if (!metrics) return null;

  const rocket = ROCKETS.find(r => r.id === rocketId)!;
  const pod = POD_TYPES.find(p => p.id === podTypeId)!;

  const generateBragText = () => {
    const opexText = metrics.opexDeltaPct < 0 
      ? `${formatDecimal(Math.abs(metrics.opexDeltaPct), 1)}% cheaper OPEX`
      : `${formatDecimal(metrics.opexDeltaPct, 1)}% more expensive OPEX`;
    
    const latencyText = metrics.latencyDeltaMs < 0
      ? `${formatDecimal(Math.abs(metrics.latencyDeltaMs), 1)} ms faster`
      : `${formatDecimal(metrics.latencyDeltaMs, 1)} ms slower`;
    
    const carbonText = metrics.carbonDeltaPct < 0
      ? `${formatDecimal(Math.abs(metrics.carbonDeltaPct), 1)}% less carbon`
      : `${formatDecimal(metrics.carbonDeltaPct, 1)}% more carbon`;

    return `Just ran the Orbital Compute sim.
Orbit mix: ${opexText}, ${latencyText}, ${carbonText} than pure ground.
Rocket: ${rocket.label}, Pod: ${pod.label}, Pods: ${podsDeployed}.
My OrbitScore: ${Math.round(metrics.orbitScore).toLocaleString()}. Can you beat it?`;
  };

  const handleCopy = async () => {
    const text = generateBragText();
    try {
      await navigator.clipboard.writeText(text);
      // Could show a toast here
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-700">
      <button
        onClick={handleCopy}
        className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded transition"
      >
        Copy Brag Text
      </button>
    </div>
  );
}

