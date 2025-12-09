/**
 * Simulation Store
 * Manages the year-by-year simulation config and timeline
 */

import { create } from "zustand";
import type { SimulationConfig, YearStep, YearPlan } from "../lib/orbitSim/simulationConfig";
import { createDefaultConfig } from "../lib/orbitSim/simulationConfig";
import { runSimulationFromPlans } from "../lib/orbitSim/simulationRunner";
import type { ForecastBands } from "../lib/orbitSim/forecast";
import { defaultPolicy } from "../lib/ai/routerTypes";
import { aiDesignConstellation } from "../lib/ai/constellationEval";
import type { ForecastResult, SentimentSnapshot, StrategyId, StrategyConfig, WorldState, WorldParams } from "../lib/futures/types";
import { runFuturesMonteCarlo } from "../lib/futures/monteCarlo";

type YearTransition = {
  fromYear: number;
  toYear: number;
} | null;

interface SimulationStore {
  config: SimulationConfig;
  yearPlans: YearPlan[];
  timeline: YearStep[];
  selectedYearIndex: number;
  yearTransition: YearTransition;
  forecastBands: ForecastBands | null;
  
  // Futures state
  activeStrategy: StrategyId;
  strategies: Record<StrategyId, StrategyConfig>;
  worldParams: WorldParams;
  worldState: WorldState;
  futuresForecast: ForecastResult | null;
  futuresSentiment: SentimentSnapshot | null;
  isRunningFutures: boolean;
  
  // Actions
  updateConfig: (updates: Partial<SimulationConfig>) => void;
  setSelectedYearIndex: (index: number) => void;
  updateCurrentPlan: (patch: Partial<YearPlan>) => void;
  deployNextYear: () => void;
  extendYears: (yearsToAdd: number) => void;
  recompute: (configOverride?: Partial<SimulationConfig>) => void;
  recomputeWithPlans: (nextPlans: YearPlan[]) => void;
  setForecastBands: (bands: ForecastBands | null) => void;
  
  // Futures actions
  runFutures: (nSims?: number) => Promise<void>;
  setStrategy: (id: StrategyId) => void;
  updateWorldState: (updates: Partial<WorldState>) => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  const initialConfig = createDefaultConfig();
  const initialPlans: YearPlan[] = [{
    deploymentIntensity: 1.0,
    computeStrategy: "balanced",
    launchStrategy: "medium",
  }];
  const initialResult = runSimulationFromPlans(initialConfig, initialPlans);

  // Initialize futures state
  const initialWorldState: WorldState = {
    year: initialConfig.startYear,
    orbitCost: 400,
    groundCost: 400,
    orbitCapacity: 1,
    groundCapacity: 10,
    carbonPrice: 50,
    energyCostGround: 50,
    launchCost: 2000,
  };

  const initialWorldParams: WorldParams = {
    startYear: initialConfig.startYear,
    horizonYears: 20,
    baseOrbitLearningRate: 0.18,
    baseGroundLearningRate: 0.04,
    shockVolatility: 0.4,
  };

  const initialStrategies: Record<StrategyId, StrategyConfig> = {
    latency: { id: "latency", wCost: 0.5, wLatency: 1.0, wCarbon: 0.2 },
    cost: { id: "cost", wCost: 1.0, wLatency: 0.2, wCarbon: 0.2 },
    carbon: { id: "carbon", wCost: 0.6, wLatency: 0.4, wCarbon: 1.0 },
    balanced: { id: "balanced", wCost: 0.8, wLatency: 0.8, wCarbon: 0.8 },
  };

  return {
    config: initialConfig,
    yearPlans: initialPlans,
    timeline: initialResult.timeline,
    selectedYearIndex: initialResult.timeline.length - 1,
    yearTransition: null,
    forecastBands: null,
    
    // Futures state
    activeStrategy: "balanced",
    strategies: initialStrategies,
    worldParams: initialWorldParams,
    worldState: initialWorldState,
    futuresForecast: null,
    futuresSentiment: null,
    isRunningFutures: false,
    
    updateConfig: (updates: Partial<SimulationConfig>) => {
      set((state) => {
        const newConfig = { ...state.config, ...updates };
        const result = runSimulationFromPlans(newConfig, state.yearPlans);
        return {
          config: newConfig,
          timeline: result.timeline,
          selectedYearIndex: Math.min(state.selectedYearIndex, result.timeline.length - 1),
        };
      });
    },
    
    setSelectedYearIndex: (index: number) => {
      set({ selectedYearIndex: index });
    },
    
    updateCurrentPlan: (patch: Partial<YearPlan>) => {
      set((state) => {
        const currentYearIndex = state.yearPlans.length - 1;
        const nextPlans = [...state.yearPlans];
        nextPlans[currentYearIndex] = { ...nextPlans[currentYearIndex], ...patch };
        const result = runSimulationFromPlans(state.config, nextPlans);
        return {
          yearPlans: nextPlans,
          timeline: result.timeline,
          selectedYearIndex: result.timeline.length - 1,
        };
      });
    },
    
    deployNextYear: () => {
      const { config, yearPlans, timeline } = get();
      const prevLast = timeline[timeline.length - 1];
      
      // Append a new year, defaulting to the same strategy as this year
      const last = yearPlans[yearPlans.length - 1];
      const nextPlans = [...yearPlans, { ...last }];
      
      const nextResult = runSimulationFromPlans(config, nextPlans);
      const nextLast = nextResult.timeline[nextResult.timeline.length - 1];
      const currentYear = nextLast.year;
      
      // CRITICAL: Add units to OrbitalUnitsStore when deploying
      // This triggers launch animations in LaunchAnimation component
      try {
        const { useOrbitalUnitsStore } = require("./orbitalUnitsStore");
        // deploymentSchedule.ts removed - deployment info now comes from simulation config
        // Calculate pods deployed from timeline
        const podsDelta = Math.max(0, (nextLast.podsTotal || 0) - (prevLast.podsTotal || 0));
        
        if (podsDelta > 0) {
          // Create units based on pods delta
          // Estimate launches: assume ~6 pods per launch (Starship capacity)
          const estimatedLaunches = Math.ceil(podsDelta / 6);
          
          for (let launchNum = 0; launchNum < estimatedLaunches; launchNum++) {
            // Create one unit per launch (represents satellites in that launch)
            const unitId = `deploy_${currentYear}_launch_${launchNum}_${Date.now()}`;
            const unit = {
              id: unitId,
              type: "leo_pod" as const,
              name: `Deployment ${currentYear} Launch ${launchNum + 1}`,
              cost: 2, // $2M per pod
              powerOutputMw: 0.1, // 100 kW
              latencyMs: 65,
              lifetimeYears: 7,
              buildTimeDays: 0, // Instant deploy for year-based deployment
              status: "deployed" as const,
              deployedAt: Date.now(),
            };
            
            // Add directly to units with deployed status (bypass queue)
            useOrbitalUnitsStore.setState((storeState: any) => ({
              units: [...storeState.units, unit],
            }));
          }
          
          console.log(`[simulationStore] ✅ Created ${estimatedLaunches} launches (${podsDelta} pods) for year ${currentYear}`);
        }
      } catch (e) {
        console.error(`[simulationStore] Error creating deployment units:`, e);
      }
      
      set({
        yearPlans: nextPlans,
        timeline: nextResult.timeline,
        selectedYearIndex: nextResult.timeline.length - 1,
        yearTransition: { fromYear: prevLast.year, toYear: nextLast.year },
      });
      
      // Auto-clear animation after 1.2s
      setTimeout(() => {
        set({ yearTransition: null });
      }, 1200);
    },
    
    extendYears: (yearsToAdd: number) => {
      const { config, yearPlans, timeline } = get();
      const prevLast = timeline[timeline.length - 1];
      
      // Append multiple years, all using the current strategy
      const last = yearPlans[yearPlans.length - 1];
      const nextPlans = [...yearPlans];
      for (let i = 0; i < yearsToAdd; i++) {
        nextPlans.push({ ...last });
      }
      
      const nextResult = runSimulationFromPlans(config, nextPlans);
      const nextLast = nextResult.timeline[nextResult.timeline.length - 1];
      
      // Trigger launch animations for deployed satellites
      // Calculate pods delta (new pods deployed in these years)
      const prevPods = prevLast?.podsTotal || 0;
      const newPods = nextLast?.podsTotal || 0;
      const podsDelta = Math.max(0, newPods - prevPods);
      
      // Dispatch event to trigger launch animations
      // Scale by years to show more launches for longer fast-forwards
      if (podsDelta > 0 && typeof window !== 'undefined') {
        const event = new CustomEvent('controls-changed', {
          detail: { podsDelta: podsDelta * yearsToAdd } // Scale by years for visual effect
        });
        window.dispatchEvent(event);
      }
      
      set({
        yearPlans: nextPlans,
        timeline: nextResult.timeline,
        selectedYearIndex: nextResult.timeline.length - 1,
        yearTransition: { fromYear: prevLast.year, toYear: nextLast.year },
      });
      
      // Auto-clear animation after 1.2s
      setTimeout(() => {
        set({ yearTransition: null });
      }, 1200);
    },
    
    recompute: (configOverride?: Partial<SimulationConfig>) => {
      set((state) => {
        const nextConfig = { ...state.config, ...configOverride };
        const result = runSimulationFromPlans(nextConfig, state.yearPlans);
        return {
          config: nextConfig,
          timeline: result.timeline,
          selectedYearIndex: result.timeline.length - 1,
        };
      });
    },
    
    recomputeWithPlans: (nextPlans: YearPlan[]) => {
      set((state) => {
        const result = runSimulationFromPlans(state.config, nextPlans);
        return {
          yearPlans: nextPlans,
          timeline: result.timeline,
          selectedYearIndex: result.timeline.length - 1,
        };
      });
    },
    
    // Futures actions
    runFutures: async (nSims = 1000) => {
      set((s) => ({ ...s, isRunningFutures: true }));
      const state = get();
      const strategy = state.strategies[state.activeStrategy];
      
      // Update world state from current timeline if available
      const lastStep = state.timeline[state.timeline.length - 1];
      const updatedWorldState: WorldState = {
        ...state.worldState,
        year: lastStep?.year || state.worldState.year,
        orbitCost: lastStep ? (lastStep.costPerComputeMix || state.worldState.orbitCost) : state.worldState.orbitCost,
        groundCost: lastStep?.costPerComputeGround || state.worldState.groundCost,
        orbitCapacity: lastStep?.podsTotal || state.worldState.orbitCapacity,
      };
      
      const { forecast, sentiment } = runFuturesMonteCarlo(
        updatedWorldState,
        state.worldParams,
        strategy,
        nSims
      );
      
      set((s) => ({
        ...s,
        futuresForecast: forecast,
        futuresSentiment: sentiment,
        isRunningFutures: false,
        worldState: updatedWorldState,
      }));
    },
    
    setStrategy: (id: StrategyId) => {
      set((s) => ({ ...s, activeStrategy: id }));
    },
    
    updateWorldState: (updates: Partial<WorldState>) => {
      set((s) => ({
        ...s,
        worldState: { ...s.worldState, ...updates },
      }));
    },
    
    setForecastBands: (bands: ForecastBands | null) => {
      set({ forecastBands: bands });
    },
  };
});
