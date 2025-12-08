"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatDecimal } from "../lib/utils/formatNumber";
import TimeScaleControl from "./TimeScaleControl";

// Import useSandboxStore to access the store
import { useSandboxStore as useSandboxStoreDirect } from "../store/sandboxStore";

/**
 * DEPLOYMENT Surface - Only about "can your industrial + launch setup keep up?"
 * Shows:
 * - Pod Progression (Pods Required / Pods Built / Launches Needed)
 * - Launch Stress
 * - Time Scale
 * - Bottlenecks list (short)
 * - Launch animation (handled by SandboxGlobe)
 */
export default function DeploymentSurface() {
  const { simState, launchSlotsThisMonth, podsPerLaunchCapacity, launchReliability } = useSandboxStore();

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  const podsInOrbit = Math.floor(simState.podsInOrbit);
  
  // Calculate pod production - check both prodPerMin and actual machine output
  const podsProdPerMin = simState.resources.pods?.prodPerMin ?? 0;
  const podsBuffer = simState.resources.pods?.buffer ?? 0;
  const podFactoryLines = simState.machines?.podFactory?.lines ?? 0;
  const podFactoryOutput = simState.machines?.podFactory?.baseOutputPerLine ?? 6;
  const estimatedPodsPerMin = podFactoryLines > 0 ? podFactoryLines * podFactoryOutput : podsProdPerMin;
  const podsPerMonth = estimatedPodsPerMin * 60 * 24 * 30;
  const podsPerYear = podsPerMonth * 12;
  
  // Calculate launch stress with reliability
  const rawLaunchesNeeded = podsInOrbit > 0 ? Math.ceil(podsInOrbit / (podsPerLaunchCapacity || 1)) : 0;
  const effectiveLaunchesNeeded = launchReliability > 0 ? rawLaunchesNeeded / launchReliability : rawLaunchesNeeded;
  const launchesNeeded = Math.ceil(effectiveLaunchesNeeded);
  const launchCapacity = launchSlotsThisMonth || 1;
  const launchCapacityPerYear = launchCapacity * 12;
  const effectiveLaunchesNeededPerYear = effectiveLaunchesNeeded * 12;
  const launchStress = launchCapacityPerYear > 0 ? effectiveLaunchesNeededPerYear / launchCapacityPerYear : 0;

  // Calculate bottlenecks (simplified)
  const bottlenecks: string[] = [];
  if (launchStress > 1) {
    bottlenecks.push("Launch capacity overstressed");
  }
  if (podFactoryLines === 0 && podsPerMonth === 0) {
    bottlenecks.push("Pod factory not running");
  } else if (podFactoryLines > 0 && podsPerMonth < 1) {
    bottlenecks.push("Pod factory starved");
  } else if (podsPerMonth > 0 && podsPerMonth < 10) {
    bottlenecks.push("Pod production too low");
  }

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      {/* Launch Animation - handled by SandboxGlobe */}
      
      {/* Pod Progression - Top Left */}
      <div className="fixed top-[60px] left-6 z-30 panel pointer-events-auto" style={{ width: "300px" }}>
        <div className="text-xs font-semibold text-gray-300 mb-3">POD PROGRESSION</div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Pods Required:</span>
            <span className="text-white font-semibold">{formatDecimal(podsInOrbit, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Pods Built:</span>
            <span className="text-white font-semibold">{formatDecimal(podsPerYear, 0)}/year</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Launches Needed:</span>
            <span className="text-white font-semibold">{formatDecimal(launchesNeeded, 0)}</span>
          </div>
        </div>
      </div>

      {/* Launch Stress - Top Right */}
      <div className="fixed top-[60px] right-6 z-30 panel pointer-events-auto" style={{ width: "300px" }}>
        <div className="text-xs font-semibold text-gray-300 mb-3">LAUNCH STRESS</div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Capacity:</span>
            <span className="text-white font-semibold">{launchCapacity}/month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Required:</span>
            <span className={`font-semibold ${launchStress > 1 ? 'text-red-400' : 'text-green-400'}`}>
              {formatDecimal(launchStress, 2)}x
            </span>
          </div>
        </div>
      </div>

      {/* Time Scale - Bottom Center */}
      <TimeScaleControl />

      {/* Bottlenecks - Bottom Left */}
      {bottlenecks.length > 0 && (
        <div className="fixed bottom-6 left-6 z-30 panel pointer-events-auto" style={{ width: "300px" }}>
          <div className="text-xs font-semibold text-gray-300 mb-2">BOTTLENECKS</div>
          <div className="space-y-1 text-xs text-red-400">
            {bottlenecks.map((bottleneck, idx) => (
              <div key={idx}>• {bottleneck}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

