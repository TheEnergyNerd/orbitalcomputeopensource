"use client";

import { useState } from "react";
import { useSandboxStore } from "../store/sandboxStore";
import FactoryStrip from "./factory/FactoryStrip";
import FactorySystemsPanelV2 from "./FactorySystemsPanelV2";
import FactoryNodeDetailPanel from "./FactoryNodeDetailPanel";
import FactoryStartGuide from "./FactoryStartGuide";
import PodsReadyIndicator from "./PodsReadyIndicator";

/**
 * AdvancedView - All factory/industrial UI
 * Contains: Factory flow, resource sidebars, machine cards, launch ops, etc.
 */
export default function AdvancedView() {
  const { simState } = useSandboxStore();
  const [factorySelectedNode, setFactorySelectedNode] = useState<string | null>(null);

  if (!simState) {
    return <div className="text-xs text-gray-500">Loading...</div>;
  }

  // Calculate deployment metrics for summary
  const podsPerMonth = (simState.resources.pods?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerMonth = (simState.resources.launches?.prodPerMin ?? 0) * 60 * 24 * 30;
  const launchesPerYear = launchesPerMonth * 12;
  const podsPerYear = podsPerMonth * 12;

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Left Sidebar - Factory Systems */}
      <div className="fixed top-[50px] left-6 w-64 z-40 panel max-h-[calc(100vh-100px)] overflow-y-auto">
        <FactorySystemsPanelV2 />
      </div>

      {/* Center - Factory Flow */}
      <div className="flex-1 ml-[280px]">
        <FactoryStrip 
          selectedNodeId={factorySelectedNode} 
          onSelectNode={setFactorySelectedNode} 
          highlightNodeId={null} 
        />
      </div>

      {/* Right Panel - Node Detail (when selected) */}
      {factorySelectedNode && (
        <FactoryNodeDetailPanel 
          selectedNodeId={factorySelectedNode} 
          onClose={() => setFactorySelectedNode(null)} 
        />
      )}

      {/* Factory Start Guide */}
      <FactoryStartGuide />

      {/* Pods Ready Indicator */}
      <PodsReadyIndicator />

      {/* Capability Summary - Top Right */}
      <div className="fixed top-[50px] right-6 w-64 z-40 panel">
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

