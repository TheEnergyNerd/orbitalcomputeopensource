/**
 * Simple Mode Store
 * Manages the 3 pod-centric decisions: rocket, pod type, pods deployed
 */

import { create } from "zustand";
import type { RocketId, PodTypeId } from "../lib/orbitSim/orbitConfigs";
import type { ScenarioInputs, ScenarioMetrics, YearSeries } from "../lib/orbitSim/scenarioTypes";
import { calculateScenarioMetrics } from "../lib/orbitSim/scenarioCalculator";
import type { SimulationSnapshot, SimulationHistory } from "../lib/orbitSim/orbitStats";
import { createSnapshot } from "../lib/orbitSim/orbitStats";
import { calculateScenarioMetricsWithUpgrades } from "../lib/orbitSim/scenarioHelpers";
import { calculateYearSeries } from "../lib/orbitSim/yearSeriesCalculator";

interface SimpleModeStore {
  // User inputs
  rocketId: RocketId;
  podTypeId: PodTypeId;
  podsDeployed: number;
  groundEnergyPrice: number; // $/MWh
  
  // Constants
  baselineComputeDemandTflopYr: number;
  
  // Computed metrics
  metrics: ScenarioMetrics | null;
  previousMetrics: ScenarioMetrics | null; // For incremental comparison (only set on launch/reset)
  lastLaunchAt: number | null; // Timestamp of last launch for animations
  deploymentHistory: Array<{ podsDeployed: number; metrics: ScenarioMetrics; timestamp: number }>; // Track history for line charts
  simulationHistory: SimulationHistory; // Canonical history with snapshots
  yearSeries: YearSeries | null; // 10-year compute projection
  
  // Actions
  setRocket: (rocketId: RocketId) => void;
  setPodType: (podTypeId: PodTypeId) => void;
  setPodsDeployed: (pods: number) => void; // Direct set (for slider)
  setGroundEnergyPrice: (price: number) => void;
  launchPods: (count: number) => void; // Incrementally launch pods (commit point)
  resetPods: () => void; // Reset to 0 (commit point)
  
  // Recalculate metrics
  recalculateMetrics: () => void;
}

const DEFAULT_PODS = 0; // Start with 0 pods - user must launch to deploy
const DEFAULT_ENERGY_PRICE = 50; // $/MWh
const BASELINE_DEMAND = 10000; // TFLOP-yr

export const useSimpleModeStore = create<SimpleModeStore>((set, get) => {
  // Initial calculation (with upgrades)
  const initialInputs: ScenarioInputs = {
    rocketId: 'falcon',
    podTypeId: 'hyperscale',
    podsDeployed: DEFAULT_PODS,
    groundEnergyPrice: DEFAULT_ENERGY_PRICE,
    baselineComputeDemandTflopYr: BASELINE_DEMAND,
  };
  const initialMetrics = calculateScenarioMetricsWithUpgrades(initialInputs);
  const initialYearSeries = calculateYearSeries(initialInputs);
  const initialSnapshot = createSnapshot(DEFAULT_PODS, initialMetrics);
  
  return {
    rocketId: 'falcon',
    podTypeId: 'hyperscale',
    podsDeployed: DEFAULT_PODS,
    groundEnergyPrice: DEFAULT_ENERGY_PRICE,
    baselineComputeDemandTflopYr: BASELINE_DEMAND,
    metrics: initialMetrics,
    previousMetrics: null,
    lastLaunchAt: null,
    deploymentHistory: [{ podsDeployed: DEFAULT_PODS, metrics: initialMetrics, timestamp: Date.now() }],
    simulationHistory: {
      history: [initialSnapshot],
      lastDelta: {},
    },
    yearSeries: initialYearSeries,
    
    setRocket: (rocketId: RocketId) => {
      set((state) => {
        const newState = { ...state, rocketId };
        const inputs: ScenarioInputs = {
          rocketId: newState.rocketId,
          podTypeId: newState.podTypeId,
          podsDeployed: newState.podsDeployed,
          groundEnergyPrice: newState.groundEnergyPrice,
          baselineComputeDemandTflopYr: newState.baselineComputeDemandTflopYr,
        };
        const metrics = calculateScenarioMetricsWithUpgrades(inputs);
        const yearSeries = calculateYearSeries(inputs);
        // Don't update previousMetrics on rocket/pod type change - only on launch
        return { ...newState, metrics, yearSeries };
      });
    },
    
    setPodType: (podTypeId: PodTypeId) => {
      set((state) => {
        const newState = { ...state, podTypeId };
        const inputs: ScenarioInputs = {
          rocketId: newState.rocketId,
          podTypeId: newState.podTypeId,
          podsDeployed: newState.podsDeployed,
          groundEnergyPrice: newState.groundEnergyPrice,
          baselineComputeDemandTflopYr: newState.baselineComputeDemandTflopYr,
        };
        const metrics = calculateScenarioMetricsWithUpgrades(inputs);
        const yearSeries = calculateYearSeries(inputs);
        // Don't update previousMetrics on rocket/pod type change - only on launch
        return { ...newState, metrics, yearSeries };
      });
    },
    
    setPodsDeployed: (pods: number) => {
      set((state) => {
        const newState = { ...state, podsDeployed: pods };
        const inputs: ScenarioInputs = {
          rocketId: newState.rocketId,
          podTypeId: newState.podTypeId,
          podsDeployed: newState.podsDeployed,
          groundEnergyPrice: newState.groundEnergyPrice,
          baselineComputeDemandTflopYr: newState.baselineComputeDemandTflopYr,
        };
        const metrics = calculateScenarioMetricsWithUpgrades(inputs);
        const yearSeries = calculateYearSeries(inputs);
        // Don't update previousMetrics on slider move - only on launch
        return { ...newState, metrics, yearSeries };
      });
    },
    
    setGroundEnergyPrice: (price: number) => {
      set((state) => {
        const newState = { ...state, groundEnergyPrice: price };
        const inputs: ScenarioInputs = {
          rocketId: newState.rocketId,
          podTypeId: newState.podTypeId,
          podsDeployed: newState.podsDeployed,
          groundEnergyPrice: newState.groundEnergyPrice,
          baselineComputeDemandTflopYr: newState.baselineComputeDemandTflopYr,
        };
        const metrics = calculateScenarioMetricsWithUpgrades(inputs);
        const yearSeries = calculateYearSeries(inputs);
        // Don't update previousMetrics on energy price change
        return { ...newState, metrics, yearSeries };
      });
    },
    
    launchPods: (count: number) => {
      set((state) => {
        // 1. Before applying launch, save before snapshot using CURRENT metrics
        // This captures the state right before the launch
        const beforeMetrics = state.metrics;
        const beforeSnapshot = beforeMetrics 
          ? createSnapshot(state.podsDeployed, beforeMetrics)
          : undefined;
        
        const nextPods = Math.max(0, state.podsDeployed + count);
        const newState = { ...state, podsDeployed: nextPods };
        
        // 2. Compute metrics AFTER launch
        const inputs: ScenarioInputs = {
          rocketId: newState.rocketId,
          podTypeId: newState.podTypeId,
          podsDeployed: newState.podsDeployed,
          groundEnergyPrice: newState.groundEnergyPrice,
          baselineComputeDemandTflopYr: newState.baselineComputeDemandTflopYr,
        };
        const after = calculateScenarioMetricsWithUpgrades(inputs);
        const yearSeries = calculateYearSeries(inputs);
        
        // 3. Create after snapshot
        const afterSnapshot = createSnapshot(nextPods, after);
        
        // 4. Push after into history (only launch events, not slider changes)
        const newHistory = [...(state.simulationHistory.history || []), afterSnapshot];
        // Keep only last 20 snapshots for performance
        const trimmedHistory = newHistory.slice(-20);
        
        // 5. Set lastDelta = { before, after } for incremental comparison
        const newSimulationHistory: SimulationHistory = {
          history: trimmedHistory,
          lastDelta: {
            before: beforeSnapshot,
            after: afterSnapshot,
          },
        };
        
        // Store previous metrics and update timestamp for animations
        // Add to deployment history (legacy format for compatibility)
        const history = [...(state.deploymentHistory || []), { 
          podsDeployed: nextPods, 
          metrics: after, 
          timestamp: Date.now() 
        }];
        // Keep only last 20 deployments for performance
        const trimmedDeploymentHistory = history.slice(-20);
        
        return { 
          ...newState, 
          previousMetrics: beforeMetrics, 
          metrics: after,
          yearSeries,
          lastLaunchAt: Date.now(),
          deploymentHistory: trimmedDeploymentHistory,
          simulationHistory: newSimulationHistory,
        };
      });
    },
    
    resetPods: () => {
      set((state) => {
        const before = state.metrics;
        const newState = { ...state, podsDeployed: 0 };
        const inputs: ScenarioInputs = {
          rocketId: newState.rocketId,
          podTypeId: newState.podTypeId,
          podsDeployed: 0,
          groundEnergyPrice: newState.groundEnergyPrice,
          baselineComputeDemandTflopYr: newState.baselineComputeDemandTflopYr,
        };
        const after = calculateScenarioMetricsWithUpgrades(inputs);
        const yearSeries = calculateYearSeries(inputs);
        const resetSnapshot = createSnapshot(0, after);
        
        // Reset deployment history
        const history = [{ podsDeployed: 0, metrics: after, timestamp: Date.now() }];
        const resetSimulationHistory: SimulationHistory = {
          history: [resetSnapshot],
          lastDelta: {},
        };
        
        return { 
          ...newState, 
          previousMetrics: before, 
          metrics: after,
          yearSeries,
          lastLaunchAt: Date.now(),
          deploymentHistory: history,
          simulationHistory: resetSimulationHistory,
        };
      });
    },
    
    recalculateMetrics: () => {
      const state = get();
      // Use helper that includes upgrades
      const inputs: ScenarioInputs = {
        rocketId: state.rocketId,
        podTypeId: state.podTypeId,
        podsDeployed: state.podsDeployed,
        groundEnergyPrice: state.groundEnergyPrice,
        baselineComputeDemandTflopYr: state.baselineComputeDemandTflopYr,
      };
      const metrics = calculateScenarioMetricsWithUpgrades(inputs);
      const yearSeries = calculateYearSeries(inputs);
      set({ metrics, yearSeries });
    },
  };
});

