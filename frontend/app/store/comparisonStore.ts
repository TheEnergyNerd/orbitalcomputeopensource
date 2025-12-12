/**
 * Comparison Mode Store
 * Manages side-by-side strategy comparison
 */

import { create } from "zustand";
import { StrategyMode } from "../lib/orbitSim/debugState";

export interface ComparisonMetrics {
  orbitShare: number;
  latency: number;
  carbon: number;
  cost: number;
  power: number;
  compute: number;
}

interface ComparisonStore {
  isActive: boolean;
  strategyA: StrategyMode | null;
  strategyB: StrategyMode | null;
  metricsA: ComparisonMetrics | null;
  metricsB: ComparisonMetrics | null;
  yearA: number;
  yearB: number;
  
  setActive: (active: boolean) => void;
  setStrategyA: (strategy: StrategyMode) => void;
  setStrategyB: (strategy: StrategyMode) => void;
  setMetricsA: (metrics: ComparisonMetrics) => void;
  setMetricsB: (metrics: ComparisonMetrics) => void;
  setYearA: (year: number) => void;
  setYearB: (year: number) => void;
  reset: () => void;
}

export const useComparisonStore = create<ComparisonStore>((set) => ({
  isActive: false,
  strategyA: null,
  strategyB: null,
  metricsA: null,
  metricsB: null,
  yearA: 2025,
  yearB: 2025,
  
  setActive: (active) => set({ isActive: active }),
  setStrategyA: (strategy) => set({ strategyA: strategy }),
  setStrategyB: (strategy) => set({ strategyB: strategy }),
  setMetricsA: (metrics) => set({ metricsA: metrics }),
  setMetricsB: (metrics) => set({ metricsB: metrics }),
  setYearA: (year) => set({ yearA: year }),
  setYearB: (year) => set({ yearB: year }),
  reset: () => set({
    isActive: false,
    strategyA: null,
    strategyB: null,
    metricsA: null,
    metricsB: null,
    yearA: 2025,
    yearB: 2025
  })
}));

