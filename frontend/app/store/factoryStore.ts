/**
 * Factory Game Store
 * Manages Capacity/Efficiency/Reliability allocation and events
 */

import { create } from "zustand";
import type {
  StageId,
  StageState,
  StageUpgrades,
  FactoryGameState,
  SupplyEvent,
} from "../lib/orbitSim/factoryModel";
import {
  computePipeline,
  getBottleneckStage,
  getStageAllocationCost,
  getAllocationCost,
} from "../lib/orbitSim/factoryModel";
import {
  maybeSpawnEvent,
  getActiveEvents,
  resolveEvent,
  cleanupEvents,
} from "../lib/orbitSim/events";

interface FactoryStore {
  factoryState: FactoryGameState;
  
  // Actions
  adjustAllocation: (stageId: StageId, field: keyof StageUpgrades, delta: 1 | -1) => boolean;
  resolveEventById: (eventId: string) => void;
  emergencyFix: (eventId: string) => boolean;
  advanceSimTime: (delta: number) => void;
  resetFactory: () => void;
  
  // Computed
  getComputedStages: () => Record<StageId, StageState>;
  getBottleneck: () => StageId | null;
  getAllocationRemaining: () => number;
}

// Base capacities (units per second)
const BASE_CAPACITIES: Record<StageId, number> = {
  silicon: 10.0,
  chips: 8.0,
  racks: 6.0,
  pods: 4.0,
  launch: 2.0,
};

const INITIAL_ALLOCATION_TOTAL = 100;

function createInitialStages(): Record<StageId, StageState> {
  const stages: Record<StageId, StageState> = {} as Record<StageId, StageState>;
  const stageIds: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch'];
  
  for (const id of stageIds) {
    stages[id] = {
      id,
      baseCapacity: BASE_CAPACITIES[id],
      upgrades: {
        capacityPoints: 0,
        efficiencyPoints: 0,
        reliabilityPoints: 0,
      },
      capacity: BASE_CAPACITIES[id],
      efficiency: 0.7,
      reliability: 0.8,
      utilization: 0,
      throughput: 0,
    };
  }
  
  return stages;
}

function computeAllocationSpent(stages: Record<StageId, StageState>): number {
  let total = 0;
  for (const stage of Object.values(stages)) {
    total += getStageAllocationCost(stage.upgrades);
  }
  return total;
}

export const useFactoryStore = create<FactoryStore>((set, get) => {
  const initialStages = createInitialStages();
  const initialComputed = computePipeline(initialStages, []);
  
  const initialState: FactoryGameState = {
    stages: initialStages,
    allocationTotal: INITIAL_ALLOCATION_TOTAL,
    allocationSpent: 0,
    events: [],
    simTime: 0,
  };

  return {
    factoryState: initialState,

    adjustAllocation: (stageId: StageId, field: keyof StageUpgrades, delta: 1 | -1) => {
      const state = get();
      const stage = state.factoryState.stages[stageId];
      const currentPoints = stage.upgrades[field];
      
      if (delta > 0) {
        // Adding points
        const cost = getAllocationCost(stageId, field, currentPoints);
        const allocationRemaining = state.factoryState.allocationTotal - state.factoryState.allocationSpent;
        
        if (allocationRemaining < cost) {
          return false; // Not enough points
        }
        
        const newUpgrades = {
          ...stage.upgrades,
          [field]: currentPoints + 1,
        };
        
        const newStages = {
          ...state.factoryState.stages,
          [stageId]: {
            ...stage,
            upgrades: newUpgrades,
          },
        };
        
        const newAllocationSpent = computeAllocationSpent(newStages);
        const computedStages = computePipeline(newStages, state.factoryState.events);
        
        // Check if this investment resolves any events
        const activeEvents = getActiveEvents(state.factoryState.events, state.factoryState.simTime);
        const eventsForStage = activeEvents.filter(ev => ev.stageId === stageId);
        let updatedEvents = [...state.factoryState.events];
        
        for (const event of eventsForStage) {
          // If player invested points after event, check if it resolves
          const pointsInvested = newUpgrades.capacityPoints + newUpgrades.efficiencyPoints + newUpgrades.reliabilityPoints;
          const pointsBefore = stage.upgrades.capacityPoints + stage.upgrades.efficiencyPoints + stage.upgrades.reliabilityPoints;
          const pointsInvestedAfterEvent = pointsInvested - pointsBefore;
          
          if (pointsInvestedAfterEvent >= 2) {
            updatedEvents = resolveEvent(updatedEvents, event.id);
          }
        }
        
        set({
          factoryState: {
            ...state.factoryState,
            stages: computedStages,
            allocationSpent: newAllocationSpent,
            events: updatedEvents,
          },
        });
        
        // Trigger recalculation in simple mode store
        const { useSimpleModeStore } = require('./simpleModeStore');
        useSimpleModeStore.getState().recalculateMetrics();
        
        return true;
      } else {
        // Removing points (not allowed per spec, but handle gracefully)
        if (currentPoints <= 0) return false;
        
        const newUpgrades = {
          ...stage.upgrades,
          [field]: currentPoints - 1,
        };
        
        const newStages = {
          ...state.factoryState.stages,
          [stageId]: {
            ...stage,
            upgrades: newUpgrades,
          },
        };
        
        const newAllocationSpent = computeAllocationSpent(newStages);
        const computedStages = computePipeline(newStages, state.factoryState.events);
        
        set({
          factoryState: {
            ...state.factoryState,
            stages: computedStages,
            allocationSpent: newAllocationSpent,
          },
        });
        
        return true;
      }
    },

    resolveEventById: (eventId: string) => {
      const state = get();
      const updatedEvents = resolveEvent(state.factoryState.events, eventId);
      const computedStages = computePipeline(state.factoryState.stages, updatedEvents);
      
      set({
        factoryState: {
          ...state.factoryState,
          events: updatedEvents,
          stages: computedStages,
        },
      });
    },

    emergencyFix: (eventId: string) => {
      const state = get();
      const event = state.factoryState.events.find(ev => ev.id === eventId);
      if (!event || event.resolved) return false;
      
      const allocationRemaining = state.factoryState.allocationTotal - state.factoryState.allocationSpent;
      const emergencyCost = 3;
      
      if (allocationRemaining < emergencyCost) return false;
      
      // Resolve event
      const updatedEvents = resolveEvent(state.factoryState.events, eventId);
      
      // Deduct emergency cost (add temporary allocation to affected stage)
      const stage = state.factoryState.stages[event.stageId];
      const newUpgrades = {
        ...stage.upgrades,
        capacityPoints: stage.upgrades.capacityPoints + 1, // Emergency boost
      };
      
      const newStages = {
        ...state.factoryState.stages,
        [event.stageId]: {
          ...stage,
          upgrades: newUpgrades,
        },
      };
      
      const newAllocationSpent = computeAllocationSpent(newStages);
      const computedStages = computePipeline(newStages, updatedEvents);
      
      set({
        factoryState: {
          ...state.factoryState,
          stages: computedStages,
          allocationSpent: newAllocationSpent,
          events: updatedEvents,
        },
      });
      
      return true;
    },

    advanceSimTime: (delta: number) => {
      const state = get();
      const newSimTime = state.factoryState.simTime + delta;
      
      // Maybe spawn new event
      const stateWithNewTime = {
        ...state.factoryState,
        simTime: newSimTime,
      };
      const stateWithEvent = maybeSpawnEvent(stateWithNewTime);
      
      // Clean up old events
      const cleanedEvents = cleanupEvents(stateWithEvent.events, newSimTime);
      
      // Recompute pipeline
      const computedStages = computePipeline(stateWithEvent.stages, cleanedEvents);
      
      set({
        factoryState: {
          ...stateWithEvent,
          simTime: newSimTime,
          events: cleanedEvents,
          stages: computedStages,
        },
      });
    },

    resetFactory: () => {
      const initialStages = createInitialStages();
      const initialComputed = computePipeline(initialStages, []);
      
      set({
        factoryState: {
          stages: initialStages,
          allocationTotal: INITIAL_ALLOCATION_TOTAL,
          allocationSpent: 0,
          events: [],
          simTime: 0,
        },
      });
    },

    getComputedStages: () => {
      const state = get();
      return computePipeline(state.factoryState.stages, state.factoryState.events);
    },

    getBottleneck: () => {
      const state = get();
      const computed = computePipeline(state.factoryState.stages, state.factoryState.events);
      return getBottleneckStage(computed);
    },

    getAllocationRemaining: () => {
      const state = get();
      return state.factoryState.allocationTotal - state.factoryState.allocationSpent;
    },
  };
});




