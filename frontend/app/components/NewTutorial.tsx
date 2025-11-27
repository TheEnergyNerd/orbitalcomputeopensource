"use client";

import { useSandboxStore } from "../store/sandboxStore";
import { useOrbitalUnitsStore } from "../store/orbitalUnitsStore";
import { useEffect, useState, useRef } from "react";

type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | "done";

export default function NewTutorial() {
  const {
    isTutorialActive,
    tutorialStep: currentStep,
    nextTutorialStep,
    completeTutorial,
    startTutorial,
    isCompleted,
    offloadPct,
    activeLaunchProviders,
  } = useSandboxStore();
  const { getDeployedUnits } = useOrbitalUnitsStore();
  // Subscribe to deployed units count so effects re-run when deployments change
  const deployedCountForTutorial = useOrbitalUnitsStore(
    (state) => state.getDeployedUnits().length
  );
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [step, setStep] = useState<TutorialStep>(0);
  const prevOrbitModeRef = useRef<string>("");
  const prevOffloadRef = useRef<number>(0);
  const prevLaunchProviderRef = useRef<string>("");
  const prevDeployedCountRef = useRef<number>(0);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Step configuration - defined early so it can be used in useEffects
  const stepConfig: Record<
    number,
    {
      highlight?: string;
      text: string;
      action?: string | null;
      color?: "blue" | "yellow" | "red";
    }
  > = {
    1: {
      highlight: "globe",
      text: "Ground compute dominates the world. It's fast, but fragile.",
      action: "Continue",
      color: "blue",
    },
    2: {
      highlight: "metrics",
      text: "These numbers show the state of the world: latency, energy cost, carbon, resilience.",
      action: "Continue",
      color: "blue",
    },
    3: {
      highlight: "strategy-deck",
      text: "This is where you design your orbital architecture.",
      action: "Continue",
      color: "blue",
    },
    4: {
      highlight: "offload",
      text: "Reduce ground load by 20%.",
      action: null,
      color: "blue",
    },
    5: {
      highlight: "launch-provider",
      text: "Enable Starship launch provider.",
      action: null,
      color: "blue",
    },
    6: {
      highlight: "build-panel-button",
      text: "Add 1 orbital unit to apply your strategy.",
      action: null,
      color: "blue",
    },
    7: {
      highlight: "metrics",
      text: "Orbit changes global compute. Every lever affects outcomes in real time.",
      action: "Continue",
      color: "yellow",
    },
    8: {
      highlight: "time",
      text: "Time matters. Build times, launch queues, and failures play out over years.",
      action: "Continue",
      color: "blue",
    },
    9: {
      highlight: "missions",
      text: "Missions challenge you to fix real global compute problems.",
      action: "Continue",
      color: "blue",
    },
    10: {
      highlight: "all",
      text: "You're ready. Explore strategies, build constellations, or run missions.",
      action: "Start Freeplay",
      color: "yellow",
    },
  };

  // Auto-start tutorial on first load
  useEffect(() => {
    if (!isCompleted && !isTutorialActive && step === 0) {
      const timer = setTimeout(() => {
        startTutorial();
        setStep(1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, isTutorialActive, step, startTutorial]);

  // Sync with store step
  useEffect(() => {
    if (typeof currentStep === "number") {
      setStep(currentStep as TutorialStep);
    } else if (currentStep === "done") {
      setStep("done");
    }
  }, [currentStep]);

  // Initialize previous values
  useEffect(() => {
    if (isTutorialActive && step === 4) {
      const sandboxState = useSandboxStore.getState();
      prevOffloadRef.current = sandboxState.offloadPct;
      prevLaunchProviderRef.current = sandboxState.activeLaunchProviders.join(",");
      prevDeployedCountRef.current = getDeployedUnits().length;
    }
  }, [step, isTutorialActive, getDeployedUnits]);

  // Step completion detection
  useEffect(() => {
    if (!isTutorialActive || step === "done" || typeof step !== "number") return;

    const deployedUnits = getDeployedUnits();
    const deployedCount = deployedUnits.length;

    // Clear any pending completion timers whenever we re-evaluate
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

    // Step 4: Detect offload change
    if (step === 4) {
      const baseline = prevOffloadRef.current;
      const delta = Math.abs(offloadPct - baseline);
      // Treat this as "reduce ground load by ~20%":
      // - either absolute change of at least 15 percentage points
      // - or current offload is at least baseline + 20 (handles any starting value)
      // - or current offload is at least 20% (common case: baseline = 0)
      const changedEnough =
        delta >= 15 || offloadPct >= baseline + 20 || offloadPct >= 20;

      if (changedEnough) {
        prevOffloadRef.current = offloadPct;
        const scheduledStep = step;
        completionTimeoutRef.current = setTimeout(() => {
          // Only advance if we're still on the same step (prevents cascading jumps)
          const current = useSandboxStore.getState().tutorialStep;
          if (current === scheduledStep) {
            nextTutorialStep();
          }
        }, 2000);
        return;
      }
    }

    // Step 5: Detect launch provider toggle (Starship enabled)
    if (step === 5) {
      if (
        activeLaunchProviders.includes("Starship") &&
        !prevLaunchProviderRef.current.includes("Starship")
      ) {
        prevLaunchProviderRef.current = activeLaunchProviders.join(",");
        const scheduledStep = step;
        completionTimeoutRef.current = setTimeout(() => {
          const current = useSandboxStore.getState().tutorialStep;
          if (current === scheduledStep) {
            nextTutorialStep();
          }
        }, 2000);
        return;
      }
    }

    // Step 6: Detect unit deployment
    if (step === 6 && deployedCount > prevDeployedCountRef.current) {
      prevDeployedCountRef.current = deployedCount;
      const scheduledStep = step;
      completionTimeoutRef.current = setTimeout(() => {
        const current = useSandboxStore.getState().tutorialStep;
        if (current === scheduledStep) {
          nextTutorialStep();
        }
      }, 3000);
      return;
    }
  }, [
    step,
    isTutorialActive,
    getDeployedUnits,
    nextTutorialStep,
    offloadPct,
    activeLaunchProviders,
    deployedCountForTutorial,
  ]);

  // State for cutout overlay divs
  const [cutoutOverlay, setCutoutOverlay] = useState<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);

  // Update highlight position based on target element
  useEffect(() => {
    if (!isTutorialActive || step === "done" || typeof step !== "number") {
      setCutoutOverlay(null);
      if (highlightRef.current) {
        highlightRef.current.style.display = "none";
      }
      return;
    }

    const config = stepConfig[step];
    if (!config?.highlight || config.highlight === "globe" || config.highlight === "all") {
      setCutoutOverlay(null);
      if (highlightRef.current) {
        highlightRef.current.style.display = "none";
      }
      return;
    }

    // Small delay to ensure DOM is updated (especially for accordion expansion)
    const timer = setTimeout(() => {
      // Find the target element
      const targetElement = document.querySelector(`[data-tutorial-target="${config.highlight}"]`);
      if (targetElement && highlightRef.current) {
        const rect = targetElement.getBoundingClientRect();
        const padding = 8;
        
        // Set highlight ring position
        highlightRef.current.style.top = `${rect.top - padding}px`;
        highlightRef.current.style.left = `${rect.left - padding}px`;
        highlightRef.current.style.width = `${rect.width + padding * 2}px`;
        highlightRef.current.style.height = `${rect.height + padding * 2}px`;
        highlightRef.current.style.display = "block";
        
        // Set cutout overlay (for inverse highlight)
        setCutoutOverlay({
          top: rect.top - padding,
          left: rect.left - padding,
          right: rect.left + rect.width + padding,
          bottom: rect.top + rect.height + padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        });
      } else if (highlightRef.current) {
        highlightRef.current.style.display = "none";
        setCutoutOverlay(null);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [step, isTutorialActive]);

  if (!isTutorialActive || step === "done") {
    return null;
  }

  const config = stepConfig[step as number];
  if (!config) return null;

  const handleContinue = () => {
    if (step === 11) {
      completeTutorial();
      setStep("done");
    } else {
      nextTutorialStep();
    }
  };

  const handleSkip = () => {
    completeTutorial();
    setStep("done");
  };

  // Get highlight color classes
  const getHighlightColor = (color?: string) => {
    switch (color) {
      case "blue":
        return "ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg";
      case "yellow":
        return "ring-4 ring-yellow-400 ring-offset-2 ring-offset-dark-bg";
      case "red":
        return "ring-4 ring-red-400 ring-offset-2 ring-offset-dark-bg";
      default:
        return "ring-4 ring-accent-blue ring-offset-2 ring-offset-dark-bg";
    }
  };

  return (
    <>
      {/* Dim overlay with cutout for highlighted element */}
      {cutoutOverlay ? (
        <>
          {/* Top overlay */}
          <div 
            className="fixed bg-black/70 z-[100] pointer-events-none transition-all duration-300"
            style={{ top: 0, left: 0, right: 0, height: cutoutOverlay.top }}
          />
          {/* Bottom overlay */}
          <div 
            className="fixed bg-black/70 z-[100] pointer-events-none transition-all duration-300"
            style={{ top: cutoutOverlay.bottom, left: 0, right: 0, bottom: 0 }}
          />
          {/* Left overlay */}
          <div 
            className="fixed bg-black/70 z-[100] pointer-events-none transition-all duration-300"
            style={{ top: cutoutOverlay.top, left: 0, width: cutoutOverlay.left, height: cutoutOverlay.height }}
          />
          {/* Right overlay */}
          <div 
            className="fixed bg-black/70 z-[100] pointer-events-none transition-all duration-300"
            style={{ top: cutoutOverlay.top, left: cutoutOverlay.right, right: 0, height: cutoutOverlay.height }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/70 z-[100] pointer-events-none" />
      )}

      {/* Highlight ring around element */}
      <div
        ref={highlightRef}
        className={`fixed z-[99] pointer-events-none ${getHighlightColor(config.color)} rounded-lg transition-all duration-300`}
        style={{ display: "none" }}
      />

      {/* Skip button - top right */}
      <div className="fixed top-6 right-6 z-[102] pointer-events-none">
        <button
          onClick={handleSkip}
          className="px-4 py-2 bg-gray-800/90 hover:bg-gray-700/90 text-white text-sm font-semibold rounded-lg border border-gray-600 pointer-events-auto transition-all hover:scale-105"
        >
          Skip Tutorial
        </button>
      </div>

      {/* Bottom bar with text - MUCH BIGGER */}
      <div className="fixed bottom-0 left-0 right-0 z-[101] pointer-events-none">
        <div className="bg-black/95 backdrop-blur-sm border-t-2 border-white/20 p-8">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <p className="text-white text-2xl font-semibold leading-relaxed">{config.text}</p>
            {config.action && (
              <button
                onClick={handleContinue}
                className={`px-8 py-4 rounded-lg font-bold text-lg transition-all pointer-events-auto shadow-lg ${
                  config.color === "yellow"
                    ? "bg-yellow-400 text-black hover:bg-yellow-300 hover:scale-105"
                    : "bg-accent-blue text-dark-bg hover:bg-accent-blue/80 hover:scale-105"
                }`}
              >
                {config.action}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Special highlights for globe and all */}
      {config.highlight === "globe" && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/70 pointer-events-none" />
          <div className={`fixed inset-0 z-[99] pointer-events-none ${getHighlightColor(config.color)}`} />
        </>
      )}
      {config.highlight === "all" && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/70 pointer-events-none" />
          <div className={`fixed inset-0 z-[99] pointer-events-none ${getHighlightColor(config.color)}`} />
        </>
      )}
    </>
  );
}
