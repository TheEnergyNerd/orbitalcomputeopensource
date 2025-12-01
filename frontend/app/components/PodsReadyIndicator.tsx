"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { formatDecimal } from "../lib/utils/formatNumber";

export default function PodsReadyIndicator() {
  const { simState } = useSandboxStore();

  if (!simState) return null;

  const podsBuffer = Math.floor(simState.resources.pods?.buffer || 0);
  const launchOpsLines = simState.machines.launchOps?.lines || 0;

  // Only show if there are pods ready and launch ops is configured
  if (podsBuffer === 0 || launchOpsLines === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-50 panel bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-400/50 animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="text-2xl">🚀</div>
        <div>
          <div className="text-sm font-semibold text-cyan-300">Pods Ready for Launch!</div>
          <div className="text-xs text-gray-300">
            {formatDecimal(podsBuffer, 0)} pod{podsBuffer !== 1 ? 's' : ''} available
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            Click Launch Ops to add lines and launch
          </div>
        </div>
      </div>
    </div>
  );
}

