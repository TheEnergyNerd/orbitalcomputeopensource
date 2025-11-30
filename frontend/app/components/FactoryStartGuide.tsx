"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useState } from "react";

export default function FactoryStartGuide() {
  const { simState } = useSandboxStore();
  const [dismissed, setDismissed] = useState(false);

  if (!simState || dismissed) return null;

  // Check if any machines are running
  const hasRunningMachines = Object.values(simState.machines).some(m => m.lines > 0);
  if (hasRunningMachines) return null; // Hide guide once factory is running

  return (
    <div className="fixed bottom-[360px] left-1/2 transform -translate-x-1/2 z-30 panel max-w-md">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">🚀 Start Your Factory</h3>
          <p className="text-xs text-gray-300">
            Click on any factory building below to add production lines and start making pods!
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-white text-xl ml-2"
        >
          ×
        </button>
      </div>
      <div className="text-[10px] text-gray-400 space-y-1">
        <div>1. Click <strong className="text-white">Chip Fab</strong> → Press <strong className="text-accent-blue">+</strong> to add lines</div>
        <div>2. Click <strong className="text-white">Compute Line</strong> → Press <strong className="text-accent-blue">+</strong> to add lines</div>
        <div>3. Click <strong className="text-white">Pod Factory</strong> → Press <strong className="text-accent-blue">+</strong> to add lines</div>
        <div>4. Click <strong className="text-white">Launch Ops</strong> → Press <strong className="text-accent-blue">+</strong> to launch pods to orbit</div>
      </div>
    </div>
  );
}

