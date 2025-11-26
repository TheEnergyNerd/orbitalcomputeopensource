/**
 * Simulator Mode - Narrative FSM
 * Manages the scripted phases: Reality → Ground → Falter → Orbit → Why Orbit
 */
import { create } from "zustand";
import { SimulatorPhase } from "../types/SystemState";

interface SimulatorStore {
  phase: SimulatorPhase;
  setPhase: (phase: SimulatorPhase) => void;
  autoAdvanceTimer: NodeJS.Timeout | null;
  startAutoAdvance: (delayMs: number, nextPhase: SimulatorPhase) => void;
  stopAutoAdvance: () => void;
  reset: () => void;
}

const PHASE_SEQUENCE: SimulatorPhase[] = [
  "PHASE_0_REALITY",
  "PHASE_1_GROUND",
  "PHASE_2_FALTER",
  "PHASE_3_ORBIT",
  "WHY_ORBIT",
];

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  phase: "PHASE_0_REALITY",
  autoAdvanceTimer: null,
  
  setPhase: (phase) => {
    get().stopAutoAdvance();
    set({ phase });
  },
  
  startAutoAdvance: (delayMs, nextPhase) => {
    get().stopAutoAdvance();
    const timer = setTimeout(() => {
      set({ phase: nextPhase, autoAdvanceTimer: null });
    }, delayMs);
    set({ autoAdvanceTimer: timer });
  },
  
  stopAutoAdvance: () => {
    const timer = get().autoAdvanceTimer;
    if (timer) {
      clearTimeout(timer);
      set({ autoAdvanceTimer: null });
    }
  },
  
  reset: () => {
    get().stopAutoAdvance();
    set({ phase: "PHASE_0_REALITY", autoAdvanceTimer: null });
  },
  
  // Helper to get next phase
  getNextPhase: (): SimulatorPhase | null => {
    const current = get().phase;
    const index = PHASE_SEQUENCE.indexOf(current);
    if (index >= 0 && index < PHASE_SEQUENCE.length - 1) {
      return PHASE_SEQUENCE[index + 1];
    }
    return null;
  },
}));

