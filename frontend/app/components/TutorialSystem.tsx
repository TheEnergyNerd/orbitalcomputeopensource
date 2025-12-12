"use client";

import { useEffect, useState, useRef } from "react";
import { useTutorialStore } from "../store/tutorialStore";
import type { SurfaceType } from "./SurfaceTabs";
import { useSimulationStore } from "../store/simulationStore";

interface TutorialSystemProps {
  activeSurface: SurfaceType;
  onSurfaceChange: (surface: SurfaceType) => void;
}

interface TutorialStepConfig {
  title: string;
  description: string;
  highlight?: string; // CSS selector or special keyword
  action?: string; // What action the user should take
  globeTarget?: { lat: number; lon: number; zoom?: number }; // For globe zooming
  panelInstructions?: string; // Instructions for what to do inside a panel (steps 6 and 7)
  requiresWorldTab?: boolean; // Whether this step requires switching to world tab
  requiresFuturesTab?: boolean; // Whether this step requires switching to futures tab
  requiresConstraintsTab?: boolean; // Whether this step requires switching to constraints tab
  requiresPhysicsTab?: boolean; // Whether this step requires switching to physics tab
  interactionTime?: number; // Time in ms to allow user interaction before auto-advancing
  allowGlobeClicks?: boolean; // Allow clicks on globe elements during this step
}

const TUTORIAL_STEPS: Record<number, TutorialStepConfig> = {
  1: {
    title: "Welcome",
    description: "Explore orbital computing economics. Use the tabs above to navigate between Overview, World View, Futures, Constraints & Risk, and Physics & Limits.",
    // No highlight for step 1
  },
  2: {
    title: "Deploy Time",
    description: "Click 'Deploy 1 year' to advance time and see rocket launches.",
    highlight: "[data-tutorial-deploy-button]",
    action: "Click 'Deploy 1 year'",
  },
  3: {
    title: "Choose Strategy",
    description: "Open the menu (☰) and select a strategy: Latency-first, Cost-first, Carbon-first, or Balanced. Also choose a scenario: Baseline, Bear, or Bull.",
    highlight: "[data-tutorial-mobile-menu-button]",
    action: "Open menu to select strategy",
  },
  4: {
    title: "View Metrics",
    description: "The System Overview tab shows cost, latency, carbon, and orbit share. Click 'Expand Charts' to see detailed visualizations.",
    highlight: "[data-tutorial-metrics-panel]",
    action: "View metrics in System Overview",
  },
  5: {
    title: "Explore World View",
    description: "Switch to World View tab to see the global deployment map. Click satellites and data centers to see details.",
    highlight: "[data-tutorial-world-tab]",
    requiresWorldTab: true,
    interactionTime: 5000,
    allowGlobeClicks: true,
  },
  6: {
    title: "Compare Scenarios",
    description: "Switch to Futures tab to compare Baseline, Bear, and Bull scenarios. See how different assumptions affect cost, carbon, and adoption.",
    highlight: "[data-tutorial-futures-tab]",
    action: "Switch to Futures tab",
    requiresFuturesTab: true,
  },
  7: {
    title: "Check Constraints",
    description: "Switch to Constraints & Risk tab to see what limits the system: thermal, backhaul, launch capacity, and reliability.",
    highlight: "[data-tutorial-constraints-tab]",
    action: "Switch to Constraints & Risk tab",
    requiresConstraintsTab: true,
  },
  8: {
    title: "Explore Physics",
    description: "Switch to Physics & Limits tab to see the underlying physics: power-to-compute frontier, mass breakdown, thermal limits, and solar uptime.",
    highlight: "[data-tutorial-physics-tab]",
    action: "Switch to Physics & Limits tab",
    requiresPhysicsTab: true,
  },
};

export default function TutorialSystem({ activeSurface, onSurfaceChange }: TutorialSystemProps) {
  const { isActive, currentStep, startTutorial, nextStep, previousStep, closeTutorial, showTutorialOnVisit } = useTutorialStore();
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const stepConfig = typeof currentStep === "number" ? TUTORIAL_STEPS[currentStep] : null;
  
  // Track required interactions for each step
  const [step2Deployed, setStep2Deployed] = useState(false);
  const [step3MenuOpened, setStep3MenuOpened] = useState(false);
  const [step5WorldTabClicked, setStep5WorldTabClicked] = useState(false);
  const [step6FuturesTabClicked, setStep6FuturesTabClicked] = useState(false);
  const [step7ConstraintsTabClicked, setStep7ConstraintsTabClicked] = useState(false);
  const [step8PhysicsTabClicked, setStep8PhysicsTabClicked] = useState(false);
  
  // Track if tutorial should be temporarily hidden (for step 2)
  const [tutorialHidden, setTutorialHidden] = useState(false);

  // Show tutorial on every visit - but only if we're on overview tab and tutorial was closed
  const hasShownTutorialThisSession = useRef(false);
  const tutorialWasClosed = useRef(false);
  
  useEffect(() => {
    // Only auto-start if:
    // 1. We're on overview tab
    // 2. Tutorial is not active
    // 3. We haven't shown it this session AND it wasn't explicitly closed
    if (showTutorialOnVisit && !isActive && activeSurface === "overview" && !hasShownTutorialThisSession.current && !tutorialWasClosed.current) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        startTutorial();
        hasShownTutorialThisSession.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showTutorialOnVisit, isActive, activeSurface, startTutorial]);

  // Determine current highlight based on step progression
  const getCurrentHighlight = () => {
    return stepConfig?.highlight;
  };

  const currentHighlight = getCurrentHighlight();

  // Determine if Next button should be disabled
  const canProceed = (() => {
    if (typeof currentStep !== "number") return true;
    if (currentStep === 2) return step2Deployed;
    if (currentStep === 3) {
      // On mobile, require menu to be opened; on desktop, allow proceeding
      const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
      return isMobile ? step3MenuOpened : true;
    }
    if (currentStep === 5) return step5WorldTabClicked;
    if (currentStep === 6) return step6FuturesTabClicked;
    if (currentStep === 7) return step7ConstraintsTabClicked;
    if (currentStep === 8) return step8PhysicsTabClicked;
    return true;
  })();

  // Update highlight position
  useEffect(() => {
    if (!isActive || currentStep === "done") {
      setHighlightRect(null);
      return;
    }

    // Calculate current highlight inside useEffect to ensure it has access to latest state
    const getCurrentHighlightForEffect = () => {
      return stepConfig?.highlight;
    };

    const highlightSelector = getCurrentHighlightForEffect() || stepConfig?.highlight;
    if (!highlightSelector) {
      setHighlightRect(null);
      return;
    }

    const updateHighlight = () => {
      const highlightSelector = getCurrentHighlightForEffect() || stepConfig?.highlight;
      if (!highlightSelector) {
        setHighlightRect(null);
        return;
      }
      const element = document.querySelector(highlightSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);
      } else {
        setHighlightRect(null);
      }
    };

    updateHighlight();
    const interval = setInterval(updateHighlight, 100);
    return () => clearInterval(interval);
  }, [isActive, currentStep, stepConfig]);

  // Handle step 5 - switch to world tab and allow interaction
  useEffect(() => {
    if (currentStep === 5 && isActive) {
      const stepConfig = TUTORIAL_STEPS[5];
      
      // Switch to world tab if required
      if (stepConfig?.requiresWorldTab && activeSurface !== "world") {
        onSurfaceChange("world");
        setTimeout(() => setStep5WorldTabClicked(true), 100);
      } else if (activeSurface === "world") {
        setStep5WorldTabClicked(true);
      }
    }
  }, [currentStep, isActive, activeSurface, onSurfaceChange]);

  // Handle step 6 - switch to futures tab
  useEffect(() => {
    if (currentStep === 6 && isActive) {
      const stepConfig = TUTORIAL_STEPS[6];
      
      // Switch to futures tab if required
      if (stepConfig?.requiresFuturesTab && activeSurface !== "futures") {
        onSurfaceChange("futures");
        setTimeout(() => setStep6FuturesTabClicked(true), 100);
      } else if (activeSurface === "futures") {
        setStep6FuturesTabClicked(true);
      }
    }
  }, [currentStep, isActive, activeSurface, onSurfaceChange]);

  // Handle step 7 - switch to constraints tab
  useEffect(() => {
    if (currentStep === 7 && isActive) {
      const stepConfig = TUTORIAL_STEPS[7];
      
      // Switch to constraints tab if required
      if (stepConfig?.requiresConstraintsTab && activeSurface !== "constraints") {
        onSurfaceChange("constraints");
        setTimeout(() => setStep7ConstraintsTabClicked(true), 100);
      } else if (activeSurface === "constraints") {
        setStep7ConstraintsTabClicked(true);
      }
    }
  }, [currentStep, isActive, activeSurface, onSurfaceChange]);

  // Handle step 8 - switch to physics tab
  useEffect(() => {
    if (currentStep === 8 && isActive) {
      const stepConfig = TUTORIAL_STEPS[8];
      
      // Switch to physics tab if required
      if (stepConfig?.requiresPhysicsTab && activeSurface !== "physics") {
        onSurfaceChange("physics");
        setTimeout(() => setStep8PhysicsTabClicked(true), 100);
      } else if (activeSurface === "physics") {
        setStep8PhysicsTabClicked(true);
      }
    }
  }, [currentStep, isActive, activeSurface, onSurfaceChange]);


  // Track when tutorial is closed to prevent auto-reopening
  useEffect(() => {
    if (!isActive && hasShownTutorialThisSession.current) {
      // Tutorial was closed, mark it so it doesn't reopen
      tutorialWasClosed.current = true;
    }
  }, [isActive]);

  // Reset interaction tracking when step changes
  useEffect(() => {
    if (currentStep !== 2) setStep2Deployed(false);
    if (currentStep !== 3) setStep3MenuOpened(false);
    if (currentStep !== 5) setStep5WorldTabClicked(false);
    if (currentStep !== 6) setStep6FuturesTabClicked(false);
    if (currentStep !== 7) setStep7ConstraintsTabClicked(false);
    if (currentStep !== 8) setStep8PhysicsTabClicked(false);
    setTutorialHidden(false);
  }, [currentStep]);

  // Track step 2: Deploy 1 year button click
  useEffect(() => {
    if (currentStep === 2 && isActive && !step2Deployed) {
      let hideTimer: NodeJS.Timeout | null = null;
      
      const handleDeployClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const button = target.closest('[data-tutorial-deploy-button]');
        if (button && !step2Deployed) {
          setStep2Deployed(true);
          // Hide tutorial for 5 seconds to watch animations
          setTutorialHidden(true);
          hideTimer = setTimeout(() => {
            setTutorialHidden(false);
          }, 5000);
        }
      };
      
      document.addEventListener('click', handleDeployClick, true);
      
      return () => {
        document.removeEventListener('click', handleDeployClick, true);
        if (hideTimer) clearTimeout(hideTimer);
      };
    }
  }, [currentStep, isActive, step2Deployed]);

  // Track step 3: Menu opened (mobile only)
  useEffect(() => {
    if (currentStep === 3 && isActive) {
      // Check menu state periodically
      const interval = setInterval(() => {
        const menu = document.querySelector('[data-tutorial-mobile-menu]');
        if (menu) {
          // Menu is open when it has translate-x-0 class (Tailwind class when isOpen=true)
          const hasTranslateX0 = menu.classList.contains('translate-x-0');
          if (hasTranslateX0) {
            setStep3MenuOpened(true);
          }
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [currentStep, isActive]);


  // Track step 4: Auto-close menu if open to see charts clearly
  useEffect(() => {
    if (currentStep === 4 && isActive) {
      // Close mobile menu if it's open
      const menu = document.querySelector('[data-tutorial-mobile-menu]');
      if (menu) {
        const hasTranslateX0 = menu.classList.contains('translate-x-0');
        if (hasTranslateX0) {
          // Menu is open, close it by dispatching close event
          // Find the close button and click it, or dispatch a custom event
          const closeButton = menu.querySelector('button[aria-label="Close menu"]');
          if (closeButton) {
            (closeButton as HTMLElement).click();
          } else {
            // Fallback: dispatch custom event to close menu
            window.dispatchEvent(new CustomEvent('close-mobile-menu'));
          }
        }
      }
    }
  }, [currentStep, isActive]);

  // Track step 5: World tab clicked - check both click and surface change
  useEffect(() => {
    if (currentStep === 5 && isActive) {
      const handleTabClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-tutorial-world-tab]')) {
          setStep5WorldTabClicked(true);
        }
      };
      document.addEventListener('click', handleTabClick, true);
      
      // Also check surface change directly
      if (activeSurface === "world") {
        setStep5WorldTabClicked(true);
      }
      
      return () => {
        document.removeEventListener('click', handleTabClick, true);
      };
    }
  }, [currentStep, isActive, activeSurface]);
  
  // Also track when activeSurface changes to "world" during step 5
  useEffect(() => {
    if (currentStep === 5 && isActive && activeSurface === "world") {
      setStep5WorldTabClicked(true);
    }
  }, [currentStep, isActive, activeSurface]);

  // Track step 6: Futures tab clicked
  useEffect(() => {
    if (currentStep === 6 && isActive) {
      const handleTabClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-tutorial-futures-tab]')) {
          setStep6FuturesTabClicked(true);
        }
      };
      document.addEventListener('click', handleTabClick, true);
      
      if (activeSurface === "futures") {
        setStep6FuturesTabClicked(true);
      }
      
      return () => {
        document.removeEventListener('click', handleTabClick, true);
      };
    }
  }, [currentStep, isActive, activeSurface]);
  
  // Track when activeSurface changes to "futures" during step 6
  useEffect(() => {
    if (currentStep === 6 && isActive && activeSurface === "futures") {
      setStep6FuturesTabClicked(true);
    }
  }, [currentStep, isActive, activeSurface]);

  // Track step 7: Constraints tab clicked
  useEffect(() => {
    if (currentStep === 7 && isActive) {
      const handleTabClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-tutorial-constraints-tab]')) {
          setStep7ConstraintsTabClicked(true);
        }
      };
      document.addEventListener('click', handleTabClick, true);
      
      if (activeSurface === "constraints") {
        setStep7ConstraintsTabClicked(true);
      }
      
      return () => {
        document.removeEventListener('click', handleTabClick, true);
      };
    }
  }, [currentStep, isActive, activeSurface]);
  
  // Track when activeSurface changes to "constraints" during step 7
  useEffect(() => {
    if (currentStep === 7 && isActive && activeSurface === "constraints") {
      setStep7ConstraintsTabClicked(true);
    }
  }, [currentStep, isActive, activeSurface]);

  // Track step 8: Physics tab clicked
  useEffect(() => {
    if (currentStep === 8 && isActive) {
      const handleTabClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-tutorial-physics-tab]')) {
          setStep8PhysicsTabClicked(true);
        }
      };
      document.addEventListener('click', handleTabClick, true);
      
      if (activeSurface === "physics") {
        setStep8PhysicsTabClicked(true);
      }
      
      return () => {
        document.removeEventListener('click', handleTabClick, true);
      };
    }
  }, [currentStep, isActive, activeSurface]);
  
  // Track when activeSurface changes to "physics" during step 8
  useEffect(() => {
    if (currentStep === 8 && isActive && activeSurface === "physics") {
      setStep8PhysicsTabClicked(true);
    }
  }, [currentStep, isActive, activeSurface]);

  if (!isActive || currentStep === "done") {
    return null;
  }

  if (!stepConfig) {
    return null;
  }

  return (
    <>
      {/* Dark overlay with cutout for highlighted element - blocks clicks except on highlighted areas */}
      {/* For interactive steps, allow clicks through */}
      {/* CRITICAL FIX: For step 5, ensure tabs are clickable by either hiding overlay or ensuring pointer-events-none */}
      <div
        className="fixed inset-0 z-[150] pointer-events-auto"
        style={{
          background: highlightRect
            ? `radial-gradient(ellipse ${highlightRect.width}px ${highlightRect.height}px at ${highlightRect.left + highlightRect.width / 2}px ${highlightRect.top + highlightRect.height / 2}px, transparent 40%, rgba(0, 0, 0, 0.85) 70%)`
            : "rgba(0, 0, 0, 0.85)",
          pointerEvents: (currentStep === 2 || currentStep === 5 || currentStep === 6 || currentStep === 7 || currentStep === 8) ? 'none' : 'auto', // Allow clicks through during interactive steps
          display: currentStep === 5 ? 'none' : 'block', // CRITICAL: Hide overlay completely for step 5 to ensure tabs are clickable
        }}
        onClick={(e) => {
          // For interactive steps, don't block clicks - let them pass through
          if (currentStep === 2 || currentStep === 5 || currentStep === 6 || currentStep === 7 || currentStep === 8) {
            return;
          }
          // Allow clicks to pass through to highlighted elements
          const target = e.target as HTMLElement;
          if (highlightRect && target.closest(stepConfig?.highlight || '')) {
            // Click is on highlighted element, let it pass through
            return;
          }
          // Click is on overlay, do nothing (don't close)
        }}
      />

      {/* Highlight ring - allow clicks through to highlighted element */}
      {highlightRect && (
        <div
          ref={highlightRef}
          className="fixed z-[151] pointer-events-none"
          style={{
            top: `${highlightRect.top - 8}px`,
            left: `${highlightRect.left - 8}px`,
            width: `${highlightRect.width + 16}px`,
            height: `${highlightRect.height + 16}px`,
            border: "3px solid #00d4ff",
            borderRadius: "8px",
            boxShadow: "0 0 20px rgba(0, 212, 255, 0.8), inset 0 0 20px rgba(0, 212, 255, 0.3)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
      )}
      
      {/* Ensure highlighted elements are clickable - add a transparent layer above overlay but below elements */}
      {/* For step 5, don't add this blocking layer - allow all clicks through to globe */}
      {highlightRect && currentStep !== 5 && (
        <div
          className="fixed z-[149] pointer-events-none"
          style={{
            top: `${highlightRect.top}px`,
            left: `${highlightRect.left}px`,
            width: `${highlightRect.width}px`,
            height: `${highlightRect.height}px`,
          }}
        />
      )}

      {/* Tutorial tooltip */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[152] pointer-events-auto max-w-2xl w-full px-4">
        <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl max-h-[80vh] sm:max-h-none flex flex-col">
          {/* Header with close button - always visible, sticky on mobile */}
          <div className="flex items-start justify-between p-4 sm:p-6 pb-2 sm:pb-4 flex-shrink-0 sticky top-0 bg-gray-900 z-10 border-b border-cyan-500/30 sm:border-b-0">
            <div className="flex-1 pr-2">
              <div className="text-xs text-cyan-400 mb-1">
                Step {typeof currentStep === "number" ? currentStep : "Complete"} of 8
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white">{stepConfig.title}</h3>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                closeTutorial();
                tutorialWasClosed.current = true; // Mark as closed so it doesn't reopen
                hasShownTutorialThisSession.current = true;
              }}
              className="ml-2 text-gray-400 hover:text-white transition flex-shrink-0"
              aria-label="Close tutorial"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Scrollable content area */}
          <div className="overflow-y-auto flex-1 px-4 sm:px-6 pb-4 sm:pb-6">
            <p className="text-sm text-gray-300 mb-3">{stepConfig.description}</p>
            {stepConfig.action && (
              <div className="text-sm text-cyan-300 font-semibold mb-3">
                → {stepConfig.action}
              </div>
            )}
          </div>

          {/* Footer with buttons - always visible, sticky on mobile */}
          <div className="flex items-center justify-between p-4 sm:p-6 pt-2 sm:pt-4 flex-shrink-0 sticky bottom-0 bg-gray-900 border-t border-cyan-500/30 sm:border-t-0">
            <div className="flex gap-2">
              {typeof currentStep === "number" && currentStep > 1 && (
                <button
                  onClick={previousStep}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition text-sm"
                >
                  Previous
                </button>
              )}
            </div>
            <button
              onClick={nextStep}
              disabled={!canProceed}
              className={`px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition text-sm ${
                !canProceed ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {currentStep === 8 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.02);
          }
        }
      `}</style>
    </>
  );
}

