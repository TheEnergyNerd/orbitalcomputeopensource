/**
 * V1 Simplified Sandbox Store
 * Three-lever design with simplified metrics
 */

import { create } from "zustand";
import { calculateDerivedValues, calculateMetricDeltas, type V1State, type V1Metrics } from "../lib/sim/v1State";
import { V1_MISSIONS, checkMissionCompletion, type V1Mission } from "../lib/missions/v1Missions";
import { computeSuggestedMoves } from "../lib/missions/v1SuggestedMoves";

interface V1SandboxStore extends V1State {
  // Actions
  setOrbitalShare: (share: number) => void;  // 0-90, stored as 0-0.9
  setGroundEfficiency: (efficiency: number) => void;  // 0-100, stored as 0-1
  setLaunchCadence: (cadence: number) => void;  // 1-30
  setCurrentMission: (missionId: string | null) => void;
  resetState: () => void;
  
  // Computed getters
  getCurrentMission: () => V1Mission | null;
  getMetricDeltas: () => ReturnType<typeof calculateMetricDeltas>;
}

const initialState: V1State = {
  orbitalShare: 0,
  groundEfficiency: 0.5,
  launchCadence: 12,
  metrics: {
    costPerCompute: { ground: 0, mix: 0 },
    opex: { ground: 0, mix: 0 },
    latency: { ground: 0, mix: 0 },
    carbon: { ground: 0, mix: 0 },
  },
  launchesPerYear: 0,
  podsPerYear: 0,
  backlogFactor: 0,
  launchReliability: 0.99,
  currentMissionId: null,
  missionProgress: 0,
  missionCompleted: false,
  suggestedMoves: [],
};

export const useV1SandboxStore = create<V1SandboxStore>((set, get) => {
  // Helper to update state and recalculate everything
  const updateState = (updates: Partial<V1State>) => {
    const currentState = get();
    const newState = { ...currentState, ...updates };
    
    // Recalculate derived values
    const derived = calculateDerivedValues(
      newState.orbitalShare,
      newState.groundEfficiency,
      newState.launchCadence
    );
    
    // Update metrics and derived values
    const updatedState = {
      ...newState,
      ...derived,
    };
    
    // Check mission completion if mission is active
    let missionProgress = 0;
    let missionCompleted = false;
    if (updatedState.currentMissionId) {
      const mission = V1_MISSIONS.find(m => m.id === updatedState.currentMissionId);
      if (mission) {
        const result = checkMissionCompletion(mission, {
          orbitalShare: updatedState.orbitalShare,
          launchesPerYear: updatedState.launchesPerYear,
          metrics: updatedState.metrics,
        });
        missionProgress = result.progress;
        missionCompleted = result.completed;
      }
    }
    
    // Calculate suggested moves
    const mission = updatedState.currentMissionId 
      ? V1_MISSIONS.find(m => m.id === updatedState.currentMissionId) || null
      : null;
    const suggestedMoves = computeSuggestedMoves(updatedState, mission);
    
    set({
      ...updatedState,
      missionProgress,
      missionCompleted,
      suggestedMoves,
    });
  };
  
  return {
    ...initialState,
    
    setOrbitalShare: (share: number) => {
      const normalized = Math.max(0, Math.min(90, share)) / 100;
      updateState({ orbitalShare: normalized });
    },
    
    setGroundEfficiency: (efficiency: number) => {
      const normalized = Math.max(0, Math.min(100, efficiency)) / 100;
      updateState({ groundEfficiency: normalized });
    },
    
    setLaunchCadence: (cadence: number) => {
      const clamped = Math.max(1, Math.min(30, cadence));
      updateState({ launchCadence: clamped });
    },
    
    setCurrentMission: (missionId: string | null) => {
      updateState({ currentMissionId: missionId, missionCompleted: false, missionProgress: 0 });
    },
    
    resetState: () => {
      set(initialState);
      updateState({});
    },
    
    getCurrentMission: () => {
      const state = get();
      if (!state.currentMissionId) return null;
      return V1_MISSIONS.find(m => m.id === state.currentMissionId) || null;
    },
    
    getMetricDeltas: () => {
      const state = get();
      return calculateMetricDeltas(state.metrics);
    },
  };
});

// Initialize state on first load - calculate initial metrics
if (typeof window !== 'undefined') {
  const store = useV1SandboxStore.getState();
  // Trigger initial calculation
  store.setOrbitalShare(0);
}

