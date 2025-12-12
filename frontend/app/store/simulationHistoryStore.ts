/**
 * Simulation History Store
 * Stores complete state history for time-lapse/replay
 */

import { create } from "zustand";
import { YearDeploymentState } from "../lib/orbitSim/yearSteppedDeployment";

export interface HistoryEntry {
  year: number;
  state: YearDeploymentState;
  metrics: {
    orbitShare: number;
    latency: number;
    carbon: number;
    cost: number;
    power: number;
    compute: number;
  };
  satellites: Array<{ id: string; x: number; y: number; z: number; class: "A" | "B" }>;
  routes: Array<{ id: string; from: [number, number, number]; to: [number, number, number] }>;
}

interface SimulationHistoryStore {
  history: Map<number, HistoryEntry>;
  maxHistorySize: number;
  
  addEntry: (entry: HistoryEntry) => void;
  getEntry: (year: number) => HistoryEntry | undefined;
  getYears: () => number[];
  clear: () => void;
  getReplayRange: () => { min: number; max: number };
}

export const useSimulationHistoryStore = create<SimulationHistoryStore>((set, get) => ({
  history: new Map(),
  maxHistorySize: 50, // Store last 50 years
  
  addEntry: (entry) => {
    const { history, maxHistorySize } = get();
    const newHistory = new Map(history);
    newHistory.set(entry.year, entry);
    
    // Limit history size
    if (newHistory.size > maxHistorySize) {
      const years = Array.from(newHistory.keys()).sort((a, b) => a - b);
      const oldestYear = years[0];
      newHistory.delete(oldestYear);
    }
    
    set({ history: newHistory });
  },
  
  getEntry: (year) => {
    return get().history.get(year);
  },
  
  getYears: () => {
    return Array.from(get().history.keys()).sort((a, b) => a - b);
  },
  
  clear: () => {
    set({ history: new Map() });
  },
  
  getReplayRange: () => {
    const years = get().getYears();
    if (years.length === 0) {
      return { min: 2025, max: 2025 };
    }
    return { min: Math.min(...years), max: Math.max(...years) };
  }
}));

