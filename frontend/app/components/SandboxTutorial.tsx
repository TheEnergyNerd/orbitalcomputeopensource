"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

export default function SandboxTutorial() {
  const searchParams = useSearchParams();
  const { 
    isTutorialActive, 
    tutorialStep, 
    nextTutorialStep, 
    completeTutorial,
    startTutorial,
    isCompleted,
    orbitalComputeUnits,
    groundDCReduction,
    tutorialOrbitShareTarget,
    setTutorialOrbitShareTarget,
  } = useSandboxStore();
  const { getDeployedUnits, reset: resetOrbitalUnits } = useOrbitalUnitsStore();
  const [hasShownSurgeDemo, setHasShownSurgeDemo] = useState(false);

  // Auto-start tutorial on first load (unless completed)
  useEffect(() => {
    if (!isCompleted && !isTutorialActive && tutorialStep === 0) {
      // Small delay to let everything initialize
      const timer = setTimeout(() => {
        resetOrbitalUnits(); // Reset all deployments to baseline
        startTutorial();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, isTutorialActive, tutorialStep, startTutorial, resetOrbitalUnits]);

  // Step completion detection
  useEffect(() => {
    if (!isTutorialActive || tutorialStep === "done") return;

    const deployedUnits = getDeployedUnits();
    const deployedCount = deployedUnits.length;
    const totalCompute = orbitalComputeUnits + (100 - groundDCReduction);
    const orbitShare = totalCompute > 0 ? (orbitalComputeUnits / totalCompute) * 100 : 0;

    // Step 2: Wait for Hybrid preset to be clicked (handled in SandboxControls)
    // Check if deployments have started (Hybrid adds 4.67 GW of orbital capacity)
    if (tutorialStep === 2 && deployedCount >= 30) {
      setTimeout(() => nextTutorialStep(), 3000); // Give time to see deployments
    }
    // Step 3: Auto-advance after surge demo (handled by surge event)
    // Step 4: Wait for preset click (handled in SandboxControls)
  }, [isTutorialActive, tutorialStep, getDeployedUnits, orbitalComputeUnits, groundDCReduction, tutorialOrbitShareTarget, nextTutorialStep]);

  // Listen for surge event in step 3
  useEffect(() => {
    if (tutorialStep !== 3 || hasShownSurgeDemo) return;

    const handleSurgeEvent = () => {
      setHasShownSurgeDemo(true);
      // Auto-advance after showing surge response
      setTimeout(() => {
        nextTutorialStep();
      }, 4000);
    };

    window.addEventListener("surge-event" as any, handleSurgeEvent);
    return () => window.removeEventListener("surge-event" as any, handleSurgeEvent);
  }, [tutorialStep, hasShownSurgeDemo, nextTutorialStep]);


  if (!isTutorialActive || tutorialStep === "done") {
    // Step 6: Free play unlocked - show persistent hint
    if (tutorialStep === "done") {
      return (
        <div className="fixed bottom-4 right-4 z-40 pointer-events-none">
          <div className="panel-glass rounded-lg p-2 text-xs text-gray-400 border border-gray-700/50">
            You're in free play. Change orbit share, deploy more units, or run missions.
            <button
              onClick={() => {
                resetOrbitalUnits();
                startTutorial();
              }}
              className="ml-2 text-accent-blue hover:text-accent-blue/80 underline pointer-events-auto"
            >
              Replay tutorial →
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  // Tutorial overlay for steps 1-4
  const stepConfig = {
    1: {
      title: "Current State: Ground-only",
      message: "This is today’s world: all compute on ground data centers. Watch latency, energy cost, and carbon before we add orbit.",
      action: "Continue",
      highlightMetrics: true,
    },
    2: {
      title: "Hybrid deployment",
      message: "Click the 'Hybrid' preset button. Watch as 4.67 GW of orbital capacity deploys and the simulation year advances. All deployed orbital compute is automatically used at full capacity.",
      action: null, // Auto-advances when Hybrid is clicked
      highlightHybridButton: true,
    },
    3: {
      title: "Surge Event demo",
      message: "Now trigger a traffic spike. First we show what happens on ground-only, then with orbit.",
      action: null, // Auto-advances after surge demo
      highlightSurgeButton: true,
    },
    4: {
      title: "Presets + Reset",
      message: "Use presets to jump to different futures: ground-heavy, orbit-dominant, or 100% orbit. Reset puts you back to baseline.",
      action: "Continue",
      highlightPresets: true,
    },
  };

  const config = stepConfig[tutorialStep as keyof typeof stepConfig];
  if (!config) return null;

  return (
    <>
      {/* Bottom overlay bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="panel-glass rounded-xl p-4 max-w-2xl pointer-events-auto border border-accent-blue/50 shadow-2xl">
          <div className="text-sm text-accent-blue font-semibold mb-1">
            Step {tutorialStep}/4: {config.title}
          </div>
          <div className="text-sm text-gray-300 mb-3">
            {config.message}
          </div>
          {config.action && (
            <button
              onClick={nextTutorialStep}
              className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-dark-bg rounded-lg text-xs font-semibold transition-all"
            >
              {config.action}
            </button>
          )}
          {tutorialStep < 4 && (
            <button
              onClick={completeTutorial}
              className="ml-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-semibold transition-all"
            >
              Skip Tutorial
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Highlight metrics cards */}
      {(config as any).highlightMetrics && (
        <div className="fixed top-20 left-6 z-40 pointer-events-none">
          <div className="panel-glass rounded-lg p-2 text-xs text-gray-300 border border-accent-blue/50 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-blue rounded-full animate-pulse" />
              Watch these metrics change
            </div>
          </div>
        </div>
      )}

      {/* Dim overlay (everything except highlighted elements) */}
      <div 
        className="fixed inset-0 bg-black/60 z-30 pointer-events-none"
        style={{ 
          opacity: tutorialStep === 1 ? 0.3 : 0.5,
        }}
      />
    </>
  );
}
