"use client";

import { useSimpleModeStore } from "../../store/simpleModeStore";
import { formatDecimal } from "../../lib/utils/formatNumber";

/**
 * DeploymentCards - Small side cards for Pod Progression and Launch Stress
 * Now reads from Simple Mode scenario metrics
 */
export default function DeploymentCards() {
  const { podsDeployed, metrics } = useSimpleModeStore();
  
  if (!metrics) return null;
  
  // Use scenario metrics
  const podsRequiredPerYear = podsDeployed;
  const podsBuiltPerYear = podsDeployed; // Same as required (simplified)
  const launchesNeededPerYear = metrics.launchesRequiredPerYear;
  const launchCapacityPerYear = metrics.launchCapacityPerYear;
  const launchStress = metrics.launchStress;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Pod Progression Card - Very Compact */}
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded p-1.5">
        <div className="text-[9px] text-gray-400 mb-1">Pod Progression</div>
        <div className="space-y-0.5 text-[9px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Req:</span>
            <span className="text-gray-300 font-mono">{formatDecimal(podsRequiredPerYear, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Built:</span>
            <span className="text-gray-300 font-mono">{formatDecimal(podsBuiltPerYear, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Launch:</span>
            <span className="text-gray-300 font-mono">{formatDecimal(launchesNeededPerYear, 0)}</span>
          </div>
        </div>
      </div>

      {/* Launch Stress Card - Very Compact */}
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded p-1.5">
        <div className="text-[9px] text-gray-400 mb-1">Launch Stress</div>
        <div className="space-y-0.5 text-[9px] mb-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Cap:</span>
            <span className="text-gray-300 font-mono">{formatDecimal(launchCapacityPerYear, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Req:</span>
            <span className="text-gray-300 font-mono">{formatDecimal(launchesNeededPerYear, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Stress:</span>
            <span className={`font-mono text-[9px] ${launchStress > 1 ? 'text-red-400' : 'text-green-400'}`}>
              {formatDecimal(launchStress, 2)}
            </span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-0.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              launchStress > 1 ? 'bg-red-500' : launchStress > 0.8 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(100, launchStress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

