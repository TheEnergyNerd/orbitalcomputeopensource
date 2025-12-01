"use client";

import { useState, useEffect } from "react";
import { useSandboxStore } from "../../store/sandboxStore";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector or element ID to highlight
  position?: "top" | "bottom" | "left" | "right";
  action?: () => void;
}

const DEPLOYMENT_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "deploy-1",
    title: "Pods Ready",
    description: "These are pods built and waiting on the ground. When Pods Ready reaches your launch threshold, you can fire a launch.",
    target: "[data-tutorial='pods-ready']",
    position: "right",
  },
  {
    id: "deploy-2",
    title: "Launch Threshold",
    description: "Set how many pods to send per launch: 5, 10, or the maximum capacity. Fewer pods = more frequent launches. More pods = bigger jumps.",
    target: "[data-tutorial='launch-threshold']",
    position: "right",
  },
  {
    id: "deploy-3",
    title: "Launch and Compare",
    description: "Hit Launch to send pods to orbit. Each launch shifts some compute from ground → orbit. The panel on the right shows how this single launch changed: Cost per compute, Annual OPEX, Latency, Carbon.",
    target: "[data-tutorial='launch-button']",
    position: "right",
  },
];

export default function DeploymentTutorial() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const { simState } = useSandboxStore();

  useEffect(() => {
    // Check if this is first time viewing deployment tab
    const hasSeenDeploymentTutorial = localStorage.getItem("hasSeenDeploymentTutorial");
    if (!hasSeenDeploymentTutorial && simState) {
      // Check if there are pods ready (makes tutorial more relevant)
      const podsReady = Math.floor(simState.resources.pods?.buffer || 0);
      if (podsReady > 0) {
        setIsActive(true);
      }
    }
  }, [simState]);

  if (!isActive || currentStep >= DEPLOYMENT_TUTORIAL_STEPS.length) {
    return null;
  }

  const step = DEPLOYMENT_TUTORIAL_STEPS[currentStep];
  const targetElement = step.target ? document.querySelector(step.target) : null;

  const handleNext = () => {
    if (currentStep < DEPLOYMENT_TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsActive(false);
    localStorage.setItem("hasSeenDeploymentTutorial", "true");
  };

  // Calculate position for tooltip
  let tooltipStyle: React.CSSProperties = {};
  if (targetElement) {
    const rect = targetElement.getBoundingClientRect();
    switch (step.position) {
      case "right":
        tooltipStyle = {
          left: `${rect.right + 20}px`,
          top: `${rect.top + rect.height / 2}px`,
          transform: "translateY(-50%)",
        };
        break;
      case "left":
        tooltipStyle = {
          right: `${window.innerWidth - rect.left + 20}px`,
          top: `${rect.top + rect.height / 2}px`,
          transform: "translateY(-50%)",
        };
        break;
      case "top":
        tooltipStyle = {
          left: `${rect.left + rect.width / 2}px`,
          bottom: `${window.innerHeight - rect.top + 20}px`,
          transform: "translateX(-50%)",
        };
        break;
      case "bottom":
        tooltipStyle = {
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.bottom + 20}px`,
          transform: "translateX(-50%)",
        };
        break;
    }
  } else {
    // Default center position if target not found
    tooltipStyle = {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <>
      {/* Dim overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={handleNext}
      />

      {/* Highlight target element */}
      {targetElement && (
        <div
          className="fixed z-41 border-4 border-cyan-400 rounded-lg pointer-events-none animate-pulse"
          style={{
            left: `${targetElement.getBoundingClientRect().left - 4}px`,
            top: `${targetElement.getBoundingClientRect().top - 4}px`,
            width: `${targetElement.getBoundingClientRect().width + 8}px`,
            height: `${targetElement.getBoundingClientRect().height + 8}px`,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-50 panel bg-gray-900 border-2 border-cyan-400 max-w-sm"
        style={tooltipStyle}
      >
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-semibold text-white">{step.title}</h3>
            <button
              onClick={handleSkip}
              className="text-gray-400 hover:text-white text-xl ml-2"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-gray-300 mb-4">{step.description}</p>
          <div className="flex justify-between items-center">
            <div className="text-[10px] text-gray-400">
              {currentStep + 1} / {DEPLOYMENT_TUTORIAL_STEPS.length}
            </div>
            <div className="flex gap-2">
              {currentStep < DEPLOYMENT_TUTORIAL_STEPS.length - 1 && (
                <button
                  onClick={handleSkip}
                  className="px-3 py-1 text-xs text-gray-400 hover:text-white"
                >
                  Skip
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-4 py-1 bg-accent-blue hover:bg-accent-blue/80 rounded text-xs text-white font-semibold"
              >
                {currentStep < DEPLOYMENT_TUTORIAL_STEPS.length - 1 ? "Next" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

