"use client";

import { useEffect, useState } from "react";
import { useSandboxStore } from "../store/sandboxStore";

/**
 * Viral clip moment: Simulate a surge event in North America
 * Ground DCs go red, then user adds orbital capacity and everything stabilizes
 */
export default function SurgeEventDemo() {
  const { orbitalComputeUnits, addOrbitalCompute, setPreset } = useSandboxStore();
  const [isSurgeActive, setIsSurgeActive] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Listen for surge event trigger
  useEffect(() => {
    const handleSurgeEvent = () => {
      setIsDemoMode(true);
      setShowPrompt(true);
      setTimeout(() => {
        setIsSurgeActive(true);
        // Auto-add orbital compute after surge
        setTimeout(() => {
          for (let i = 0; i < 3; i++) {
            setTimeout(() => addOrbitalCompute(), i * 500);
          }
        }, 2000);
      }, 1000);
    };

    window.addEventListener("surge-event" as any, handleSurgeEvent);
    return () => window.removeEventListener("surge-event" as any, handleSurgeEvent);
  }, [addOrbitalCompute]);

  if (!showPrompt || !isDemoMode) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="panel-glass rounded-xl p-6 max-w-md pointer-events-auto">
        {!isSurgeActive ? (
          <>
            <div className="text-lg font-bold text-accent-orange mb-2">
              ⚠️ Surge Event Detected
            </div>
            <div className="text-sm text-gray-300 mb-4">
              North America experiencing traffic spike. Ground DCs under stress.
            </div>
            <button
              onClick={() => {
                setIsSurgeActive(true);
                // Add orbital capacity
                for (let i = 0; i < 3; i++) {
                  setTimeout(() => addOrbitalCompute(), i * 500);
                }
              }}
              className="w-full px-6 py-3 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg font-semibold transition-all"
            >
              Add Orbital Capacity
            </button>
          </>
        ) : (
          <>
            <div className="text-lg font-bold text-accent-green mb-2">
              ✅ Orbital Capacity Online
            </div>
            <div className="text-sm text-gray-300 mb-4">
              Traffic offloaded to orbit. Latency collapsed. System stabilized.
            </div>
            <button
              onClick={() => {
                setIsSurgeActive(false);
                setShowPrompt(false);
                setIsDemoMode(false);
              }}
              className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

