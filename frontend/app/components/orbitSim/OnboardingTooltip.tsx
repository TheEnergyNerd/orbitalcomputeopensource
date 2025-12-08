"use client";

import { useState, useEffect } from "react";

/**
 * OnboardingTooltip - Shows welcome message on first load
 */
export default function OnboardingTooltip() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has seen onboarding before
    const hasSeenOnboarding = localStorage.getItem('orbitSim_onboarding_seen') === 'true';
    if (!hasSeenOnboarding) {
      setShow(true);
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem('orbitSim_onboarding_seen', 'true');
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed top-32 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto max-w-md">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-4 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="text-lg font-semibold text-white">Welcome to Orbital Compute</div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white text-xl ml-4"
          >
            ×
          </button>
        </div>
        <ul className="text-sm text-gray-300 space-y-2">
          <li>• The strip below is your factory: Silicon → Chips → Racks → Pods → Launch.</li>
          <li>• Click a stage to upgrade it. Each upgrade trades OPEX, latency, carbon, and launch stress.</li>
          <li>• Your goal: make orbit + ground mix beat pure ground on cost, latency, and carbon.</li>
        </ul>
      </div>
    </div>
  );
}

