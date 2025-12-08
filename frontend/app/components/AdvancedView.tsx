"use client";

import { useSandboxStore } from "../store/sandboxStore";
import FactoryStrip from "./FactoryStrip";
import FactorySystemsPanelV2 from "./FactorySystemsPanelV2";
import FactoryNodeDetailPanel from "./FactoryNodeDetailPanel";
import FactoryStartGuide from "./FactoryStartGuide";
import PodsReadyIndicator from "./PodsReadyIndicator";
import TimeScaleControl from "./TimeScaleControl";
import { formatDecimal } from "../lib/utils/formatNumber";

/**
 * AdvancedView - All factory/industrial UI
 * Contains: Factory flow, resource sidebars, machine cards, launch ops, etc.
 */
export default function AdvancedView() {
  const { simState } = useSandboxStore();

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  // Calculate deployment metrics for summary
  const podsPerMonth = (simState.resources.pods?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerMonth = (simState.resources.launches?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerYear = launchesPerMonth * 12;
  const podsPerYear = podsPerMonth * 12;

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      {/* Left Sidebar - Factory Systems */}
      <div className="fixed top-[50px] left-6 w-64 z-40 panel max-h-[calc(100vh-100px)] overflow-y-auto pointer-events-auto">
        <FactorySystemsPanelV2 />
      </div>

      {/* Center - Factory Flow */}
      <div className="flex-1 ml-[280px]">
        <FactoryStrip />
      </div>

      {/* Right Panel - Node Detail (when selected) */}
      {factorySelectedNode && (
        <div className="pointer-events-auto">
          <FactoryNodeDetailPanel 
            selectedNodeId={factorySelectedNode} 
            onClose={() => setFactorySelectedNode(null)} 
          />
        </div>
      )}

      {/* Factory Start Guide */}
      <FactoryStartGuide />

      {/* Pods Ready Indicator */}
      <PodsReadyIndicator />

      {/* Time Scale Control - Advanced tab only */}
      <TimeScaleControl />

      {/* Capability Summary - Top Right */}
      <div className="fixed top-[50px] right-6 w-64 z-40 panel pointer-events-auto">
        <div className="space-y-2 text-xs">
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
    </div>
  );
}

