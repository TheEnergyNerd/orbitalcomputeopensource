import { create } from "zustand";
import { MISSIONS, getMissionById } from "../game/missionEngine";
import type { SimulationState } from "../game/simTypes";
import { useSimStore } from "./simStore";
import { useOrbitalUnitsStore } from "./orbitalUnitsStore";
import type { PodTierId } from "../lib/deployment/podTiers";
import type { LaunchProviderId } from "../lib/deployment/launchProviders";

export type SandboxPreset = "all_earth" | "hybrid_2035" | "orbit_dominant_2060" | "extreme_100_orbit" | "custom";
export type SandboxMode = "freeplay" | "missions";

export type OrbitMode = "LEO" | "MEO" | "GEO";
export type DensityMode = "Safe" | "Aggressive" | "Optimized";

interface SandboxStore {
  orbitalComputeUnits: number; // Number of orbital compute units added
  groundDCReduction: number; // Percentage of ground DCs removed (0-100)
  isMostlySpaceMode: boolean; // >50% orbit share
  currentPreset: SandboxPreset;
  isTutorialActive: boolean;
  tutorialStep: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | "done";
  sandboxMode: SandboxMode;
  activeMissionId: string | null;
  missionProgress: number; // 0-100
  unlockedMissions: string[]; // mission ids
  completedMissions: string[];
  unlockedUnits: string[]; // List of unlocked unit types (e.g., ["geo_hub", "server_farm"])
  isCompleted: boolean; // Whether sandbox tutorial is completed
  tutorialOrbitShareTarget: number; // Target orbit share for step 3 (30%)
  // Mission system state
  unlockedOrbitModes: string[]; // Unlocked orbit modes
  unlockedLaunchProviders: string[]; // Unlocked launch providers
  missionStartTime: number | null; // Timestamp when mission started
  missionTimeLimit: number | null; // Time limit in seconds (optional)
  // Strategic levers
  selectedPodTier: PodTierId; // Currently selected pod tier
  orbitMode: OrbitMode;
  activeLaunchProviders: LaunchProviderId[]; // Multiple providers can be active
  offloadPct: number; // 0-100
  densityMode: DensityMode;
  // Deployment state
  totalPodsBuilt: number; // Total pods ever built (for tier unlocks)
  setOrbitalComputeUnits: (units: number) => void;
  addOrbitalCompute: () => void;
  setGroundDCReduction: (percent: number) => void;
  setPreset: (preset: SandboxPreset) => void;
  setSandboxMode: (mode: SandboxMode) => void;
  setActiveMission: (missionId: string | null) => void;
  setMissionProgress: (progress: number) => void;
  unlockMission: (missionId: string) => void;
  markMissionCompleted: (missionId: string) => void;
  unlockUnit: (unitType: string) => void;
  startTutorial: () => void;
  nextTutorialStep: () => void;
  completeTutorial: () => void;
  resetSandbox: () => void;
  setTutorialOrbitShareTarget: (target: number) => void;
  setOrbitShare: (percent: number) => void; // Directly set orbit share (0-100)
  // Strategic lever setters
  setSelectedPodTier: (tier: PodTierId) => void;
  setOrbitMode: (mode: OrbitMode) => void;
  setActiveLaunchProviders: (providers: LaunchProviderId[]) => void;
  toggleLaunchProvider: (provider: LaunchProviderId) => void;
  setOffloadPct: (pct: number) => void;
  setDensityMode: (mode: DensityMode) => void;
  incrementTotalPodsBuilt: () => void;
}

export const useSandboxStore = create<SandboxStore>((set, get) => ({
  orbitalComputeUnits: 0,
  groundDCReduction: 0,
  isMostlySpaceMode: false,
  currentPreset: "custom",
  sandboxMode: "freeplay" as SandboxMode,
  activeMissionId: null,
  missionProgress: 0,
  unlockedMissions: ["mission_latency_desert"], // Start with first mission unlocked
  completedMissions: [],
  unlockedUnits: ["leo_pod"], // Start with only LEO pod unlocked
  isTutorialActive: false,
  tutorialStep: 0,
  isCompleted: false, // Sandbox tutorial completion status
  tutorialOrbitShareTarget: 30, // Default target for step 3
  // Mission system state
  unlockedOrbitModes: ["LEO"], // Start with LEO only
  unlockedLaunchProviders: ["F9"], // Start with F9 only
  missionStartTime: null,
  missionTimeLimit: null,
  // Strategic levers - defaults
  selectedPodTier: "tier1", // Start with Tier 1
  orbitMode: "LEO", // Start with LEO (first mission requirement)
  activeLaunchProviders: ["F9"], // Start with F9 only
  offloadPct: 0, // 0% = all ground
  densityMode: "Safe", // Start with Safe (first mission requirement)
  // Deployment state
  totalPodsBuilt: 0, // Start at 0 pods built
  setOrbitalComputeUnits: (units) => {
    set({ orbitalComputeUnits: units });
    // Check if we've entered "mostly space" mode
    const orbitShare = (units / (units + (100 - get().groundDCReduction))) * 100;
    set({ isMostlySpaceMode: orbitShare > 50 });
  },
  addOrbitalCompute: () => {
    set((state) => {
      const newUnits = state.orbitalComputeUnits + 1;
      const orbitShare = (newUnits / (newUnits + (100 - state.groundDCReduction))) * 100;
      return {
        orbitalComputeUnits: newUnits,
        isMostlySpaceMode: orbitShare > 50,
      };
    });
  },
  setGroundDCReduction: (percent) => {
    set({ groundDCReduction: Math.max(0, Math.min(100, percent)) });
    const state = get();
    const orbitShare = (state.orbitalComputeUnits / (state.orbitalComputeUnits + (100 - percent))) * 100;
    set({ isMostlySpaceMode: orbitShare > 50 });
    // Update mission progress if active
    if (state.activeMissionId) {
      const totalCompute = state.orbitalComputeUnits + (100 - percent);
      const currentOrbitShare = totalCompute > 0 ? (state.orbitalComputeUnits / totalCompute) * 100 : 0;
      if (state.activeMissionId === "stabilize_abilene" || state.activeMissionId === "surge_event") {
        const targetOrbitShare = 50;
        const progress = Math.min(100, (currentOrbitShare / targetOrbitShare) * 100);
        set({ missionProgress: progress });
      }
    }
  },
  setPreset: (preset) => {
    if (preset === "all_earth") {
      set({ orbitalComputeUnits: 0, groundDCReduction: 0, currentPreset: preset });
    } else if (preset === "hybrid_2035") {
      set({ orbitalComputeUnits: 30, groundDCReduction: 0, currentPreset: preset });
    } else if (preset === "orbit_dominant_2060") {
      set({ orbitalComputeUnits: 75, groundDCReduction: 20, currentPreset: preset });
    } else if (preset === "extreme_100_orbit") {
      set({ orbitalComputeUnits: 100, groundDCReduction: 100, currentPreset: preset });
    } else {
      set({ currentPreset: preset });
    }
    const state = get();
    const orbitShare = (state.orbitalComputeUnits / (state.orbitalComputeUnits + (100 - state.groundDCReduction))) * 100;
    set({ isMostlySpaceMode: orbitShare > 50 });
  },
  setSandboxMode: (mode) => {
    set({ sandboxMode: mode });
    // In freeplay, unlock all units. In missions, only LEO pod is unlocked
    if (mode === "freeplay") {
      set({ unlockedUnits: ["leo_pod", "geo_hub", "server_farm"] });
    } else {
      set({ unlockedUnits: ["leo_pod"] });
    }
  },
  setActiveMission: (missionId) => {
    if (!missionId) {
      set({ 
        activeMissionId: null, 
        sandboxMode: "freeplay",
        missionStartTime: null,
        missionTimeLimit: null,
      });
      return;
    }

    // Load mission from missions module
    import("../game/missions").then((missionsModule) => {
      const mission = missionsModule.getMissionById(missionId);
      
      if (mission) {
        const startingState = mission.startingState;
        const { reset } = require("./orbitalUnitsStore").useOrbitalUnitsStore.getState();
        
        // Reset deployment queue
        reset();
        
        // Apply mission starting state
        set({
          activeMissionId: missionId,
          sandboxMode: "missions",
          orbitalComputeUnits: 0,
          groundDCReduction: 0,
          currentPreset: "custom",
          missionProgress: 0,
          selectedPodTier: "tier1", // Missions start with tier 1
          orbitMode: startingState.orbitBand as OrbitMode,
          activeLaunchProviders: startingState.launchProvider ? [startingState.launchProvider as LaunchProviderId] : ["F9"],
          densityMode: startingState.densityMode as DensityMode,
          offloadPct: startingState.offloadPct,
          missionStartTime: Date.now(),
          missionTimeLimit: null,
        });
      }
    });
  },
  setMissionProgress: (progress) => {
    const newProgress = Math.max(0, Math.min(100, progress));
    set({ missionProgress: newProgress });
    // Check if mission is complete and unlock units
    const state = get();
    if (newProgress >= 100 && state.activeMissionId) {
      if (state.activeMissionId === "stabilize_abilene" && !state.unlockedUnits.includes("geo_hub")) {
        set((s) => ({ unlockedUnits: [...s.unlockedUnits, "geo_hub"] }));
      } else if (state.activeMissionId === "surge_event" && !state.unlockedUnits.includes("server_farm")) {
        set((s) => ({ unlockedUnits: [...s.unlockedUnits, "server_farm"] }));
      }
    }
  },
  unlockUnit: (unitType) => set((state) => ({
    unlockedUnits: state.unlockedUnits.includes(unitType) 
      ? state.unlockedUnits 
      : [...state.unlockedUnits, unitType]
  })),
  unlockMission: (missionId) =>
    set((state) => ({
      unlockedMissions: state.unlockedMissions.includes(missionId)
        ? state.unlockedMissions
        : [...state.unlockedMissions, missionId],
    })),
  markMissionCompleted: (missionId) => {
    import("../game/missions").then((missionsModule) => {
      const mission = missionsModule.getMissionById(missionId);
      
      if (mission) {
        const state = get();
        const newCompleted = state.completedMissions.includes(missionId)
          ? state.completedMissions
          : [...state.completedMissions, missionId];
        
        // Apply rewards
        const newUnlockedMissions = [...state.unlockedMissions];
        const newUnlockedOrbitModes = [...state.unlockedOrbitModes];
        const newUnlockedLaunchProviders = [...state.unlockedLaunchProviders];
        
        mission.rewards.forEach((reward: any) => {
          if (reward.type === "UNLOCK_MISSION" && !newUnlockedMissions.includes(reward.value)) {
            newUnlockedMissions.push(reward.value);
          }
          if (reward.type === "UNLOCK_ORBIT_MODE" && !newUnlockedOrbitModes.includes(reward.value)) {
            newUnlockedOrbitModes.push(reward.value);
          }
          if (reward.type === "UNLOCK_LAUNCH_PROVIDER" && !newUnlockedLaunchProviders.includes(reward.value)) {
            newUnlockedLaunchProviders.push(reward.value);
          }
          // Note: Tech level unlocks are now handled by pod tier unlocks (automatic at 100/500 pods)
        });
        
        set({
          completedMissions: newCompleted,
          unlockedMissions: newUnlockedMissions,
          unlockedOrbitModes: newUnlockedOrbitModes,
          unlockedLaunchProviders: newUnlockedLaunchProviders,
          activeMissionId: null, // Complete mission, return to freeplay
          sandboxMode: "freeplay",
          missionStartTime: null,
        });
      }
    });
  },
  startTutorial: () => {
    // Reset sandbox to baseline (ground-only) when starting tutorial
    const state = get();
    set({ 
      isTutorialActive: true, 
      tutorialStep: 1,
      orbitalComputeUnits: 0,
      groundDCReduction: 0,
      currentPreset: "all_earth",
      missionProgress: 0,
      activeMissionId: null,
    });
  },
  nextTutorialStep: () => set((state) => {
    if (state.tutorialStep === "done") return state;
    const next = state.tutorialStep + 1;
    if (next > 11) {
      return { tutorialStep: "done", isTutorialActive: false, isCompleted: true };
    }
    return { tutorialStep: next as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 };
  }),
  completeTutorial: () => set({ isTutorialActive: false, tutorialStep: "done", isCompleted: true }),
  setTutorialOrbitShareTarget: (target) => set({ tutorialOrbitShareTarget: target }),
  setOrbitShare: (percent) => {
    const targetShare = Math.max(0, Math.min(100, percent)) / 100;
    const state = get();
    
    // Base ground capacity: 100 units
    // Formula: orbitShare = orbitalUnits / (orbitalUnits + groundCapacity) * 100
    // Solving for orbitalUnits: orbitalUnits = (targetShare * groundCapacity) / (1 - targetShare)
    
    const baseGroundCapacity = 100;
    
    if (targetShare === 0) {
      // 0% orbit: all ground, no reduction
      set({ orbitalComputeUnits: 0, groundDCReduction: 0, isMostlySpaceMode: false });
    } else if (targetShare === 1) {
      // 100% orbit: all orbital, all ground reduced
      set({ orbitalComputeUnits: 200, groundDCReduction: 100, isMostlySpaceMode: true });
    } else {
      // Calculate required orbital units to achieve target share
      // Strategy: Set ground reduction proportionally, then calculate orbital units
      // More orbit share = more ground reduction
      const groundReduction = targetShare * 100;
      const remainingGroundCapacity = baseGroundCapacity * (1 - groundReduction / 100);
      
      // Now solve: targetShare = orbitalUnits / (orbitalUnits + remainingGroundCapacity)
      // orbitalUnits = (targetShare * remainingGroundCapacity) / (1 - targetShare)
      const requiredOrbitalUnits = (targetShare * remainingGroundCapacity) / (1 - targetShare);
      
      set({ 
        orbitalComputeUnits: Math.max(0, Math.round(requiredOrbitalUnits)),
        groundDCReduction: Math.round(groundReduction),
        isMostlySpaceMode: targetShare > 0.5,
      });
    }
  },
  resetSandbox: () => {
    const state = get();
    const mode = state.sandboxMode;
    // In freeplay, unlock all units. In missions, only LEO pod
    const defaultUnlocked = mode === "freeplay" 
      ? ["leo_pod", "geo_hub", "server_farm"]
      : ["leo_pod"];
    set({ 
      orbitalComputeUnits: 0, 
      groundDCReduction: 0, 
      isMostlySpaceMode: false, 
      currentPreset: "custom",
      activeMissionId: null,
      missionProgress: 0,
      unlockedUnits: defaultUnlocked,
      // Reset strategic levers to defaults
      selectedPodTier: "tier1",
      orbitMode: "MEO",
      activeLaunchProviders: ["F9"],
      offloadPct: 0,
      densityMode: "Optimized",
      totalPodsBuilt: 0,
    });
  },
  // Strategic lever setters
  setSelectedPodTier: (tier) => set({ selectedPodTier: tier }),
  setOrbitMode: (mode) => set({ orbitMode: mode }),
  setActiveLaunchProviders: (providers) => set({ activeLaunchProviders: providers }),
  toggleLaunchProvider: (provider) => set((state) => {
    const current = state.activeLaunchProviders;
    if (current.includes(provider)) {
      // Remove if already active (but keep at least one)
      if (current.length > 1) {
        return { activeLaunchProviders: current.filter(p => p !== provider) };
      }
      return state; // Can't remove the last provider
    } else {
      // Add if not active
      return { activeLaunchProviders: [...current, provider] };
    }
  }),
  setOffloadPct: (pct) => set({ offloadPct: Math.max(0, Math.min(100, pct)) }),
  setDensityMode: (mode) => set({ densityMode: mode }),
  incrementTotalPodsBuilt: () => set((state) => ({ totalPodsBuilt: state.totalPodsBuilt + 1 })),
}));


