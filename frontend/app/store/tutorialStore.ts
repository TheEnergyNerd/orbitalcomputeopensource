import { create } from "zustand";

export type TutorialStep = 1 | 2 | 3 | 4 | null;

interface TutorialStore {
  currentStep: TutorialStep;
  isActive: boolean;
  isCompleted: boolean;
  setStep: (step: TutorialStep) => void;
  startTutorial: () => void;
  nextStep: () => void;
  completeTutorial: () => void;
  resetTutorial: () => void;
}

export const useTutorialStore = create<TutorialStore>((set) => ({
  currentStep: null,
  isActive: false,
  isCompleted: false,
  setStep: (step) => set({ currentStep: step }),
  startTutorial: () => set({ isActive: true, currentStep: 1, isCompleted: false }),
  nextStep: () => set((state) => {
    if (state.currentStep === null || state.currentStep >= 4) {
      return { currentStep: null, isActive: false, isCompleted: true };
    }
    return { currentStep: (state.currentStep + 1) as TutorialStep };
  }),
  completeTutorial: () => set({ isActive: false, currentStep: null, isCompleted: true }),
  resetTutorial: () => set({ isActive: false, currentStep: null, isCompleted: false }),
}));


