/**
 * Sandbox Mode - Freeplay interaction store
 * Manages workloads, user configuration, orbit capacity changes
 */
import { create } from "zustand";
import { WorkloadProfile, WorkloadType } from "../types/SystemState";

interface SandboxStore {
  workloads: WorkloadProfile[];
  setWorkloadDemand: (type: WorkloadType, demandMW: number) => void;
  setWorkloadOrbitShare: (type: WorkloadType, orbitShare: number) => void;
  addWorkload: (workload: WorkloadProfile) => void;
  removeWorkload: (type: WorkloadType) => void;
  resetWorkloads: () => void;
}

const defaultWorkloads: WorkloadProfile[] = [
  { type: "ai_inference", demandMW: 20, orbitShare: 0.3 },
  { type: "video", demandMW: 15, orbitShare: 0.1 },
  { type: "blockchain", demandMW: 5, orbitShare: 0.5 },
];

export const useSandboxWorkloadStore = create<SandboxStore>((set) => ({
  workloads: defaultWorkloads,
  
  setWorkloadDemand: (type, demandMW) => {
    set((state) => ({
      workloads: state.workloads.map((w) =>
        w.type === type ? { ...w, demandMW } : w
      ),
    }));
  },
  
  setWorkloadOrbitShare: (type, orbitShare) => {
    set((state) => ({
      workloads: state.workloads.map((w) =>
        w.type === type ? { ...w, orbitShare: Math.max(0, Math.min(1, orbitShare)) } : w
      ),
    }));
  },
  
  addWorkload: (workload) => {
    set((state) => ({
      workloads: [...state.workloads, workload],
    }));
  },
  
  removeWorkload: (type) => {
    set((state) => ({
      workloads: state.workloads.filter((w) => w.type !== type),
    }));
  },
  
  resetWorkloads: () => {
    set({ workloads: defaultWorkloads });
  },
}));

