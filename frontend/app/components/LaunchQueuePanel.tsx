"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { calculateDeploymentRate } from "../lib/launch/launchQueue";
import { useEffect, useState } from "react";
import { formatSigFigs } from "../lib/utils/formatNumber";

export default function LaunchQueuePanel() {
  const { launchState, factory } = useSandboxStore();
  const [lastPodsLaunched, setLastPodsLaunched] = useState(0);
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(false);

  const deploymentRate = calculateDeploymentRate(launchState);
  const orbitPods = Math.floor(factory.inventory.orbitPods ?? 0); // orbitPods is a valid ResourceId
  const nextLaunch = launchState.queue.length > 0 ? launchState.queue[0].etaMonths : null;

  // Detect when pods are launched (orbitPods increases)
  useEffect(() => {
    if (orbitPods > lastPodsLaunched && lastPodsLaunched > 0) {
      setShowLaunchAnimation(true);
      setTimeout(() => setShowLaunchAnimation(false), 2000);
    }
    setLastPodsLaunched(orbitPods);
  }, [orbitPods, lastPodsLaunched]);

  return (
    <div className="fixed top-[70px] right-6 w-64 z-40 panel-glass rounded-xl p-4 shadow-2xl border border-white/10">
      <div className="text-xs font-semibold text-gray-300 mb-3 uppercase">Launch Summary</div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Queue:</span>
          <span className="text-white font-semibold">
            {launchState.queue.length} / {launchState.maxQueue}
          </span>
        </div>
        {nextLaunch !== null && (
          <div className="flex justify-between text-gray-400">
            <span>Next launch:</span>
            <span className="text-white font-semibold">{Math.ceil(nextLaunch)} mo</span>
          </div>
        )}
        <div className="flex justify-between text-gray-400">
          <span>Pods in Orbit:</span>
          <span className={`text-white font-semibold transition-all ${
            showLaunchAnimation ? "text-green-400 scale-110" : ""
          }`}>
            {orbitPods}
            {showLaunchAnimation && " 🚀"}
          </span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Deployment Rate:</span>
          <span className="text-white font-semibold">{formatSigFigs(deploymentRate)} pods/mo</span>
        </div>
      </div>
    </div>
  );
}
