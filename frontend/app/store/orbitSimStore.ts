/**
 * Zustand store for Orbital Sim
 * Wraps the pure state logic with React-friendly store
 */

import { create } from "zustand";
import type { OrbitalSimState, StageId, Tier } from "../lib/orbitSim/orbitSimState";
import {
  createInitialState,
  tick,
  upgradeStage,
  setGroundEnergyStress,
  setCurrentMission,
} from "../lib/orbitSim/orbitSimState";

interface OrbitSimStore {
  state: OrbitalSimState;
  tick: (dtSeconds: number) => void;
  upgradeStage: (stageId: StageId, newTier: Tier) => void;
  setGroundEnergyStress: (stress: number) => void;
  setCurrentMission: (missionId: string) => void;
  markInteracted: () => void;
  reset: () => void;
}

export const useOrbitSimStore = create<OrbitSimStore>((set) => ({
  state: createInitialState(),
  
  tick: (dtSeconds: number) => {
    set((store) => ({
      state: tick(store.state, dtSeconds),
    }));
  },
  
  upgradeStage: (stageId: StageId, newTier: Tier) => {
    set((store) => {
      const newState = upgradeStage(store.state, stageId, newTier);
      // Mark as interacted and consume allocation points
      if (!newState.hasInteracted) {
        newState.hasInteracted = true;
      }
      return { state: newState };
    });
  },
  
  setGroundEnergyStress: (stress: number) => {
    set((store) => {
      const oldStress = store.state.groundEnergyStress;
      const newState = setGroundEnergyStress(store.state, stress);
      // Only mark as interacted if stress actually changed
      if (Math.abs(newState.groundEnergyStress - oldStress) > 0.001) {
        newState.hasInteracted = true;
      }
      return { state: newState };
    });
  },
  
  markInteracted: () => {
    set((store) => ({
      state: { ...store.state, hasInteracted: true },
    }));
  },
  
  setCurrentMission: (missionId: string) => {
    set((store) => {
      const newState = setCurrentMission(store.state, missionId);
      // Re-tick to update mission progress immediately
      return { state: tick(newState, 0) };
    });
  },
  
  reset: () => {
    set({ state: createInitialState() });
  },
}));

