"use client";

import { useState, useEffect } from "react";

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  highlightSelector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: "Factory Basics",
    description: "Inputs become outputs. Bottlenecks limit everything.",
    highlightSelector: ".factory-flow",
    position: "bottom",
  },
  {
    id: 2,
    title: "Launching Compute",
    description: "Pods + Fuel → Orbital Compute Units.",
    highlightSelector: ".launch-ops",
    position: "bottom",
  },
  {
    id: 3,
    title: "Orbital vs Ground",
    description: "Orbit changes economics. Latency ↓, carbon ↓, energy ↓, resilience ↑.",
    highlightSelector: ".orbital-advantage",
    position: "center",
  },
];

export default function OnboardingTutorial() {
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Show tutorial every time (as requested by user)
    setIsVisible(true);
    setCurrentStep(1);
  }, []);
  
  if (!isVisible || currentStep === null) return null;
  
  const step = TUTORIAL_STEPS[currentStep - 1];
  if (!step) return null;
  
  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete tutorial
      localStorage.setItem("tutorial_completed", "true");
      setIsVisible(false);
      setCurrentStep(null);
    }
  };
  
  const handleSkip = () => {
    localStorage.setItem("tutorial_completed", "true");
    setIsVisible(false);
    setCurrentStep(null);
  };
  
  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={handleNext} />
      
      {/* Tutorial Card */}
      <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md">
        <div className="bg-gray-800 border-2 border-accent-blue rounded-xl p-6 shadow-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{step.title}</h3>
              <p className="text-sm text-gray-300">{step.description}</p>
            </div>
            <button
              onClick={handleSkip}
              className="text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
          </div>
          
          {/* Step indicator */}
          <div className="flex gap-2 mb-4">
            {TUTORIAL_STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-2 flex-1 rounded ${
                  i + 1 <= currentStep ? "bg-accent-blue" : "bg-gray-600"
                }`}
              />
            ))}
          </div>
          
          {/* Final hint on last step */}
          {currentStep === TUTORIAL_STEPS.length && (
            <div className="mb-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
              <p className="text-xs text-gray-300">
                💡 <strong>Tip:</strong> Upgrade industrial capacity to grow production. Spend wisely.
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 text-white rounded-lg font-semibold transition"
            >
              {currentStep < TUTORIAL_STEPS.length ? "Next" : "Got it!"}
            </button>
            <button
              onClick={handleSkip}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

