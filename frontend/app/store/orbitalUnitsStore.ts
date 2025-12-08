import { create } from "zustand";
import { calculateScalingEconomies } from "../lib/metrics/calculateMetrics";
import { POD_TIERS, getHighestAvailableTier, type PodTierId } from "../lib/deployment/podTiers";
import { calculateDeploymentEngine, type DeploymentState } from "../lib/deployment/deploymentEngine";
import type { LaunchProviderId } from "../lib/deployment/launchProviders";

export type UnitType = "leo_pod"; // GEO and server_farm removed - using 4-shell model only

export interface OrbitalUnit {
  id: string;
  type: UnitType;
  name: string;
  cost: number; // in millions
  powerOutputMw: number;
  latencyMs: number;
  lifetimeYears: number;
  buildTimeDays: number;
  deployedAt?: number; // timestamp when deployed
  buildStartTime?: number; // timestamp when build started
  status: "queued" | "building" | "deployed" | "decommissioned";
  satellites?: string[]; // satellite IDs for LEO pods
  position?: { lat: number; lon: number; alt_km: number }; // for GEO hubs
}

interface StrategicLevers {
  podTier: PodTierId;
  orbitMode: string;
  activeLaunchProviders: LaunchProviderId[];
}

interface OrbitalUnitsStore {
  units: OrbitalUnit[];
  deploymentQueue: OrbitalUnit[];
  totalRealWorldTimeDays: number; // Sum of all deployment real-world times
  addToQueue: (unit: Omit<OrbitalUnit, "id" | "status" | "buildStartTime">, strategicLevers?: StrategicLevers) => boolean; // Returns true if added, false if queue full
  // Internal helper used by addToQueue; exposed here so the store type matches the implementation
  addToQueueInternal: (unit: Omit<OrbitalUnit, "id" | "status" | "buildStartTime">, strategicLevers?: StrategicLevers) => boolean;
  startBuild: (unitId: string) => void;
  deployUnit: (unitId: string) => void;
  removeUnit: (unitId: string) => void;
  getQueuedUnits: () => OrbitalUnit[];
  getBuildingUnits: () => OrbitalUnit[];
  getDeployedUnits: () => OrbitalUnit[];
  updateBuildProgress: () => void;
  reset: () => void;
}

// NEW POWER-FIRST UNIT DEFINITIONS (100kW minimum)
const UNIT_DEFINITIONS: Record<UnitType, Omit<OrbitalUnit, "id" | "status" | "buildStartTime" | "deployedAt">> = {
  leo_pod: {
    type: "leo_pod",
    name: "Orbital Compute Pod",
    cost: 2, // $2M (BASE_POD cost)
    powerOutputMw: 0.1, // 100 kW minimum (0.1 MW)
    latencyMs: 65, // MID-LEO default latency
    lifetimeYears: 7,
    buildTimeDays: 180,
  },
};

export const useOrbitalUnitsStore = create<OrbitalUnitsStore>((set, get) => ({
  units: [],
  deploymentQueue: [],
  totalRealWorldTimeDays: 0,
  
  addToQueue: (unitData, strategicLevers?: StrategicLevers) => {
    return get().addToQueueInternal(unitData, strategicLevers);
  },
  
  addToQueueInternal: (unitData, strategicLevers?: StrategicLevers) => {
    const state = get();
    
    // Get deployment state from sandbox store
    let podTier: PodTierId = "tier1";
    let orbitMode = "LEO";
    let activeLaunchProviders: LaunchProviderId[] = ["F9"];
    let totalPodsBuilt = 0;
    
    try {
      const { useSandboxStore } = require("./sandboxStore");
      const sandboxState = useSandboxStore.getState();
      podTier = strategicLevers?.podTier || sandboxState.selectedPodTier;
      orbitMode = strategicLevers?.orbitMode || sandboxState.orbitMode;
      activeLaunchProviders = strategicLevers?.activeLaunchProviders || sandboxState.activeLaunchProviders;
      totalPodsBuilt = sandboxState.totalPodsBuilt;
    } catch (e) {
      // Use defaults if store not available
    }
    
    // Calculate deployment engine state
    const totalPodsInOrbit = state.units.filter(u => u.status === "deployed").length;
    const totalPodsInQueue = state.deploymentQueue.length;
    
    const deploymentState: DeploymentState = {
      totalPodsBuilt,
      totalPodsInOrbit,
      totalPodsInQueue,
      activeLaunchProviders,
    };
    
    const engine = calculateDeploymentEngine(deploymentState);
    
    // Check queue cap
    if (totalPodsInQueue >= engine.maxQueue) {
      return false; // Queue full
    }
    
    // Get pod tier definition
    const tier = POD_TIERS.find(t => t.id === podTier) || POD_TIERS[0];
    
    // Calculate learning-adjusted cost and time
    const learningRate = 0.08;
    const timeLearningRate = 0.04;
    const costPerPod = tier.baseCostM * Math.pow(1 - learningRate, Math.min(totalPodsBuilt, 100));
    const buildTimePerPod = tier.baseBuildDays * Math.pow(1 - timeLearningRate, Math.min(totalPodsBuilt, 100));
    
    // For now, use leo_pod as base unit type
    // TODO: Map pod tiers to actual unit types
      const unit: OrbitalUnit = {
        ...unitData,
      cost: Math.round(costPerPod * 100) / 100,
      buildTimeDays: Math.round(buildTimePerPod),
        id: `unit_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        status: "queued",
      };

    set((state) => ({
        deploymentQueue: [...state.deploymentQueue, unit],
    }));
    
    return true; // Successfully added
  },
  
  startBuild: (unitId) => {
    const unit = get().deploymentQueue.find((u) => u.id === unitId);
    if (!unit) return;
    
    // Check if this unit is already being built or deployed (to avoid double-counting time)
    const existingUnit = get().units.find((u) => u.id === unitId);
    if (existingUnit) return; // Already building or deployed
    
    // Allow parallel builds - start immediately if there are available slots
    set((state) => {
      const currentlyBuilding = state.units.filter(
        (u) => u.status === "building"
      );
      const newUnits = [
        ...state.units,
        {
          ...unit,
          status: "building",
          buildStartTime: Date.now(),
        } as OrbitalUnit,
      ];

      // Logarithmic "parallel batch" time curve:
      // 1 unit  = 1x base time
      // 2 units = ~1.5x base time
      // 3+ units = diminishing additional time
      const BASE_DAYS = unit.buildTimeDays;
      const prevCount = currentlyBuilding.length;
      const newCount = prevCount + 1;
      const curve = (n: number) =>
        n <= 0 ? 0 : BASE_DAYS * (1 + 0.5 * Math.log2(n));

      const prevBatchTime = curve(prevCount);
      const newBatchTime = curve(newCount);
      const timeToAdd = newBatchTime - prevBatchTime;

      return {
        deploymentQueue: state.deploymentQueue.filter(
          (u) => u.id !== unitId
        ),
        units: newUnits,
        totalRealWorldTimeDays:
          state.totalRealWorldTimeDays + Math.max(0, timeToAdd),
      };
    });
  },
  
  deployUnit: (unitId) => {
    set((state) => {
      const unit = state.units.find(u => u.id === unitId);
      if (!unit || unit.status === "deployed") return state;
      
      // Increment total pods built in sandbox store
      try {
        const { useSandboxStore } = require("./sandboxStore");
        useSandboxStore.getState().incrementTotalPodsBuilt();
      } catch (e) {
        // Ignore if store not available
      }
      
      return {
      units: state.units.map((u) =>
        u.id === unitId
            ? { ...u, status: "deployed" as const, deployedAt: Date.now() }
          : u
      ),
      };
    });
  },
  
  removeUnit: (unitId) => {
    set((state) => ({
      units: state.units.filter((u) => u.id !== unitId),
      deploymentQueue: state.deploymentQueue.filter((u) => u.id !== unitId),
    }));
  },
  
  getQueuedUnits: () => get().deploymentQueue,
  
  getBuildingUnits: () => get().units.filter((u) => u.status === "building"),
  
  getDeployedUnits: () => get().units.filter((u) => u.status === "deployed"),
  
  updateBuildProgress: () => {
    const now = Date.now();
    // Base build time is 5 seconds, but parallel builds reduce time using logarithmic scaling
    // Formula: baseTime / (1 + log2(parallelCount))
    // So 1 unit = 5s, 2 units = 5/2 = 2.5s, 4 units = 5/3 = 1.67s, 8 units = 5/4 = 1.25s, etc.
    const BASE_BUILD_TIME_MS = 5000; // 5 seconds base
    
    set((state) => {
      const buildingUnits = state.units.filter((u) => u.status === "building");
      const parallelCount = buildingUnits.length;
      // Logarithmic scaling: more units = faster, but diminishing returns
      const buildTimeMs = parallelCount > 1 
        ? BASE_BUILD_TIME_MS / (1 + Math.log2(parallelCount))
        : BASE_BUILD_TIME_MS;
      
      return {
        units: state.units.map((unit) => {
          if (unit.status === "building" && unit.buildStartTime) {
            const elapsed = now - unit.buildStartTime;
            if (elapsed >= buildTimeMs) {
              return { ...unit, status: "deployed", deployedAt: now };
            }
          }
          return unit;
        }),
      };
    });
  },
  
  reset: () => {
    set({
      units: [],
      deploymentQueue: [],
      totalRealWorldTimeDays: 0,
    });
  },
}));

export { UNIT_DEFINITIONS };

