/**
 * Tutorial Store
 * Manages tutorial state - always available, shown on every visit
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TutorialStep = 
  | 1  // Welcome & overview
  | 2  // Understanding the year system
  | 3  // Strategy selection
  | 4  // Viewing metrics
  | 5  // Globe interaction
  | 6  // AI Router (required)
  | 7  // Constellation deployment (required)
  | 8  // Fast-forward
  | 9  // Futures tab (required)
  | "done";

interface TutorialStore {
  isActive: boolean;
  currentStep: TutorialStep;
  showTutorialOnVisit: boolean; // Show tutorial on every visit
  
  // Actions
  startTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  closeTutorial: () => void;
  setShowTutorialOnVisit: (show: boolean) => void;
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  isActive: false,
  currentStep: 1,
  showTutorialOnVisit: true, // Always show on visit by default
  
  startTutorial: () => {
    set({ isActive: true, currentStep: 1 });
  },
  
  nextStep: () => {
    const { currentStep } = get();
    if (currentStep === "done") return;
    
    const next: TutorialStep = currentStep === 9 ? "done" : ((currentStep + 1) as TutorialStep);
    set({ currentStep: next });
    
    // Auto-close when done
    if (next === "done") {
      setTimeout(() => {
        set({ isActive: false });
      }, 2000);
    }
  },
  
  previousStep: () => {
    const { currentStep } = get();
    if (currentStep === 1 || currentStep === "done") return;
    
    // At this point, currentStep must be a number (2-9) since we've already checked for 1 and "done"
    const prev: TutorialStep = (currentStep - 1) as TutorialStep;
    set({ currentStep: prev });
  },
  
  closeTutorial: () => {
    set({ isActive: false });
  },
  
  setShowTutorialOnVisit: (show: boolean) => {
    set({ showTutorialOnVisit: show });
  },
}));
