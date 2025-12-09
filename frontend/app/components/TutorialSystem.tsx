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
  requiresDeploymentTab?: boolean; // Whether this step requires switching to deployment tab
  requiresOverviewTab?: boolean; // Whether this step requires switching to overview tab
  interactionTime?: number; // Time in ms to allow user interaction before auto-advancing
  allowGlobeClicks?: boolean; // Allow clicks on globe elements during this step
}

const TUTORIAL_STEPS: Record<number, TutorialStepConfig> = {
  1: {
    title: "Welcome to Orbital Compute Simulator",
    description: "This simulator lets you explore the economics and logistics of orbital computing. You'll make strategic decisions about deployment, routing, and infrastructure.",
    // No highlight for step 1
  },
  2: {
    title: "Understanding the Year System",
    description: "The year counter shows your current simulation year. Click 'Deploy 1 year' to advance time and see rocket launches on the globe as satellites are deployed. On mobile, open the menu (☰) in the top-left to access all controls.",
    highlight: "[data-tutorial-deploy-button]",
    action: "Click 'Deploy 1 year' to see launches",
  },
  3: {
    title: "Strategy Selection",
    description: "Choose your compute strategy (Latency-first, Cost-first, Carbon-first, or Balanced) and launch strategy (Heavy lift, Reusable, or Light & cheap). These choices affect costs, latency, and carbon emissions. On mobile, open the menu (☰) in the top-left to access the strategy card.",
    highlight: "[data-tutorial-mobile-menu-button]",
    action: "Open the menu to access strategy (on mobile) or select a strategy (on desktop)",
  },
  4: {
    title: "Viewing Metrics",
    description: "The metrics panel at the bottom shows cost per compute, latency, carbon emissions, and orbit share. Expand it to see detailed charts.",
    highlight: "[data-tutorial-metrics-panel]",
    action: "Expand the metrics panel",
  },
  5: {
    title: "Globe Interaction",
    description: "Switch to the Deployment tab to explore the 3D globe. The globe shows satellites (blue), data centers (orange), and launch sites. Click on any element to see details. Traffic arrows show data flow between locations. Try clicking on data centers, satellites, and constellations to see their information cards.",
    highlight: "[data-tutorial-deployment-tab]",
    requiresDeploymentTab: true, // Flag to switch to deployment tab
    interactionTime: 5000, // Give users 5 seconds to explore
    allowGlobeClicks: true, // Allow clicks on globe elements during this step
  },
  6: {
    title: "AI Router",
    description: "Switch back to the Overview tab. The AI Router optimizes job routing based on your strategy. It decides how to route realtime, interactive, batch, and cold jobs between ground and orbit. On mobile, first open the menu, then click AI Router.",
    highlight: "[data-tutorial-ai-router-button]",
    action: "Switch to Overview and open the AI Router panel (on mobile: open menu first)",
    requiresOverviewTab: true, // Flag to switch back to overview tab
    panelInstructions: "In the AI Router panel, you can adjust routing weights for cost, latency, and carbon. Try changing the presets (Latency-first, Cost-first, Carbon-first, or Balanced) or manually adjusting the sliders to see how it affects job routing.",
  },
  7: {
    title: "Constellation Deployment",
    description: "Deploy satellite constellations to expand orbital capacity. Configure shell altitude, number of satellites, and orbital planes. On mobile, first open the menu, then click Constellation.",
    highlight: "[data-tutorial-constellation-button]",
    action: "Open the Constellation editor (on mobile: open menu first)",
    panelInstructions: "In the Constellation editor, you can configure satellite shells by adjusting altitude, number of planes, and satellites per plane. You can also use AI design presets or manually customize each shell.",
  },
  8: {
    title: "Futures Tab",
    description: "The Futures tab shows probabilistic forecasts of cost trends. It uses Monte Carlo simulation to predict how orbit vs ground costs will evolve.",
    highlight: "[data-tutorial-futures-tab]",
    action: "Switch to the Futures tab",
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
  const [step5DeploymentTabClicked, setStep5DeploymentTabClicked] = useState(false);
  const [step6MenuOpened, setStep6MenuOpened] = useState(false);
  const [step6AiRouterOpened, setStep6AiRouterOpened] = useState(false);
  const [step7MenuOpened, setStep7MenuOpened] = useState(false);
  const [step7ConstellationOpened, setStep7ConstellationOpened] = useState(false);
  const [step8FuturesTabClicked, setStep8FuturesTabClicked] = useState(false);
  
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

  // Determine current highlight based on step progression (for steps 6 and 7)
  const getCurrentHighlight = () => {
    if (typeof currentStep !== "number") return stepConfig?.highlight;
    if (currentStep === 6) {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
      if (isMobile && !step6MenuOpened) {
        return "[data-tutorial-mobile-menu-button]";
      }
      return "[data-tutorial-ai-router-button]";
    }
    if (currentStep === 7) {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
      if (isMobile && !step7MenuOpened) {
        return "[data-tutorial-mobile-menu-button]";
      }
      return "[data-tutorial-constellation-button]";
    }
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
    if (currentStep === 5) return step5DeploymentTabClicked;
    if (currentStep === 6) {
      // On mobile, require menu then AI Router; on desktop, just AI Router
      const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
      return isMobile ? (step6MenuOpened && step6AiRouterOpened) : step6AiRouterOpened;
    }
    if (currentStep === 7) {
      // On mobile, require menu then Constellation; on desktop, just Constellation
      const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
      return isMobile ? (step7MenuOpened && step7ConstellationOpened) : step7ConstellationOpened;
    }
    if (currentStep === 8) return step8FuturesTabClicked;
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
      if (typeof currentStep !== "number") return stepConfig?.highlight;
      if (currentStep === 6) {
        const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
        if (isMobile && !step6MenuOpened) {
          return "[data-tutorial-mobile-menu-button]";
        }
        return "[data-tutorial-ai-router-button]";
      }
      if (currentStep === 7) {
        const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
        if (isMobile && !step7MenuOpened) {
          return "[data-tutorial-mobile-menu-button]";
        }
        return "[data-tutorial-constellation-button]";
      }
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
  }, [isActive, currentStep, stepConfig, step6MenuOpened, step7MenuOpened]);

  // Handle step 5 - switch to deployment tab and allow interaction
  useEffect(() => {
    if (currentStep === 5 && isActive) {
      const stepConfig = TUTORIAL_STEPS[5];
      
      // Switch to deployment tab if required
      if (stepConfig.requiresDeploymentTab && activeSurface !== "deployment") {
        onSurfaceChange("deployment");
      }
      
      // Give users time to interact (scroll, click data centers, satellites, constellations)
      // Don't auto-advance - let user click next when ready
    }
  }, [currentStep, isActive, activeSurface, onSurfaceChange]);

  // Handle step 6 - switch back to overview tab (but don't auto-open AI Router)
  useEffect(() => {
    if (currentStep === 6 && isActive) {
      const stepConfig = TUTORIAL_STEPS[6];
      
      // Switch to overview tab if required
      if (stepConfig.requiresOverviewTab && activeSurface !== "overview") {
        onSurfaceChange("overview");
      }
      
      // Don't auto-open AI Router - user must click the button themselves
    }
  }, [currentStep, isActive, activeSurface, onSurfaceChange]);

  // Don't auto-switch to futures tab - let user click it themselves

  // Don't auto-open panels - user must click buttons themselves

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
    if (currentStep !== 5) setStep5DeploymentTabClicked(false);
    if (currentStep !== 6) {
      setStep6MenuOpened(false);
      setStep6AiRouterOpened(false);
    }
    if (currentStep !== 7) {
      setStep7MenuOpened(false);
      setStep7ConstellationOpened(false);
    }
    if (currentStep !== 8) setStep8FuturesTabClicked(false);
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

  // Track step 5: Deployment tab clicked
  useEffect(() => {
    if (currentStep === 5 && isActive) {
      // Listen for tab clicks
      const handleTabClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-tutorial-deployment-tab]')) {
          setStep5DeploymentTabClicked(true);
        }
      };
      document.addEventListener('click', handleTabClick);
      
      // Also check if we're already on deployment tab
      if (activeSurface === "deployment") {
        setStep5DeploymentTabClicked(true);
      }
      
      return () => {
        document.removeEventListener('click', handleTabClick);
      };
    }
  }, [currentStep, isActive, activeSurface]);

  // Track step 6: Menu opened then AI Router opened
  useEffect(() => {
    if (currentStep === 6 && isActive) {
      // Listen for AI Router open events
      const handleAiRouterOpen = () => {
        setStep6AiRouterOpened(true);
      };
      
      // Check menu state periodically (for mobile)
      const checkMenu = () => {
        const menu = document.querySelector('[data-tutorial-mobile-menu]');
        if (menu) {
          // Menu is open when it has translate-x-0 class (Tailwind class when isOpen=true)
          const hasTranslateX0 = menu.classList.contains('translate-x-0');
          if (hasTranslateX0) {
            setStep6MenuOpened(true);
          }
        }
      };
      
      // Check AI Router panel state
      const checkAiRouter = () => {
        const panel = document.querySelector('[data-tutorial-ai-router-panel]');
        if (panel && window.getComputedStyle(panel as HTMLElement).display !== 'none') {
          setStep6AiRouterOpened(true);
        }
      };
      
      window.addEventListener('open-ai-router', handleAiRouterOpen);
      const interval = setInterval(() => {
        checkMenu();
        checkAiRouter();
      }, 100);
      
      return () => {
        window.removeEventListener('open-ai-router', handleAiRouterOpen);
        clearInterval(interval);
      };
    }
  }, [currentStep, isActive]);

  // Track step 7: Menu opened then Constellation opened
  useEffect(() => {
    if (currentStep === 7 && isActive) {
      // Listen for Constellation open events
      const handleConstellationOpen = () => {
        setStep7ConstellationOpened(true);
      };
      
      // Check menu state periodically (for mobile)
      const checkMenu = () => {
        const menu = document.querySelector('[data-tutorial-mobile-menu]');
        if (menu) {
          // Menu is open when it has translate-x-0 class (Tailwind class when isOpen=true)
          const hasTranslateX0 = menu.classList.contains('translate-x-0');
          if (hasTranslateX0) {
            setStep7MenuOpened(true);
          }
        }
      };
      
      // Check Constellation panel state
      const checkConstellation = () => {
        const panel = document.querySelector('[data-tutorial-constellation-panel]');
        if (panel && window.getComputedStyle(panel as HTMLElement).display !== 'none') {
          setStep7ConstellationOpened(true);
        }
      };
      
      window.addEventListener('open-constellation', handleConstellationOpen);
      const interval = setInterval(() => {
        checkMenu();
        checkConstellation();
      }, 100);
      
      return () => {
        window.removeEventListener('open-constellation', handleConstellationOpen);
        clearInterval(interval);
      };
    }
  }, [currentStep, isActive]);

  // Track step 8: Futures tab clicked
  useEffect(() => {
    if (currentStep === 8 && isActive) {
      if (activeSurface === "futures") {
        setStep8FuturesTabClicked(true);
      }
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
      {/* For step 5 (deployment tab), allow clicks through to globe elements */}
      <div
        className="fixed inset-0 z-[150] pointer-events-auto"
        style={{
          background: highlightRect
            ? `radial-gradient(ellipse ${highlightRect.width}px ${highlightRect.height}px at ${highlightRect.left + highlightRect.width / 2}px ${highlightRect.top + highlightRect.height / 2}px, transparent 40%, rgba(0, 0, 0, 0.85) 70%)`
            : "rgba(0, 0, 0, 0.85)",
          pointerEvents: currentStep === 5 ? 'none' : 'auto', // Allow clicks through during step 5
        }}
        onClick={(e) => {
          // For step 5, don't block any clicks - let them pass through to globe
          if (currentStep === 5) {
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
        <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-6 shadow-2xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="text-xs text-cyan-400 mb-1">
                Step {typeof currentStep === "number" ? currentStep : "Complete"} of 9
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{stepConfig.title}</h3>
              <p className="text-sm text-gray-300 mb-3">{stepConfig.description}</p>
              {stepConfig.action && (
                <div className="text-sm text-cyan-300 font-semibold">
                  → {stepConfig.action}
                </div>
              )}
              {currentStep === 6 && step6AiRouterOpened && (
                <div className="mt-3 p-3 bg-cyan-900/30 border border-cyan-500/50 rounded-lg">
                  <div className="text-xs text-green-400 mb-2">✓ AI Router opened!</div>
                  {stepConfig.panelInstructions && (
                    <div className="text-xs text-gray-300">{stepConfig.panelInstructions}</div>
                  )}
                </div>
              )}
              {currentStep === 7 && step7ConstellationOpened && (
                <div className="mt-3 p-3 bg-cyan-900/30 border border-cyan-500/50 rounded-lg">
                  <div className="text-xs text-green-400 mb-2">✓ Constellation editor opened!</div>
                  {stepConfig.panelInstructions && (
                    <div className="text-xs text-gray-300">{stepConfig.panelInstructions}</div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                closeTutorial();
                tutorialWasClosed.current = true; // Mark as closed so it doesn't reopen
                hasShownTutorialThisSession.current = true;
              }}
              className="ml-4 text-gray-400 hover:text-white transition"
              aria-label="Close tutorial"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between">
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

