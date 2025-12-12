/**
 * Scenario/Story Mode Store
 * Manages active scenarios, goals, constraints, and narrative events
 */

import { create } from "zustand";

export type ScenarioId = "energy_crisis_2030" | "latency_wars" | "carbon_neutral_2040";

export interface Goal {
  type: "orbit_share" | "latency" | "carbon" | "cost";
  target: number;
  byYear: number;
  description: string;
}

export interface Constraint {
  type: "energy_cost_spike" | "competitor_launch" | "carbon_tax";
  startYear: number;
  endYear?: number;
  value: number; // e.g., 0.4 for 40% spike
}

export interface NarrativeEvent {
  year: number;
  title: string;
  message: string;
  shown: boolean;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  description: string;
  startYear: number;
  endYear: number;
  goals: Goal[];
  constraints: Constraint[];
  narrative: NarrativeEvent[];
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  energy_crisis_2030: {
    id: "energy_crisis_2030",
    title: "The 2030 Energy Crisis",
    description: "Grid costs spike 40% in 2030. Achieve 50% orbit share by 2032.",
    startYear: 2025,
    endYear: 2035,
    goals: [
      { type: "orbit_share", target: 0.5, byYear: 2032, description: "Achieve 50% orbit share" }
    ],
    constraints: [
      { type: "energy_cost_spike", startYear: 2030, value: 0.4 }
    ],
    narrative: [
      { year: 2028, title: "Warning Signs", message: "Energy analysts predict grid instability by 2030. Orbital compute could provide resilience.", shown: false },
      { year: 2030, title: "Crisis Hits", message: "Grid costs spike 40%. Ground data centers struggle. Orbit becomes critical.", shown: false },
      { year: 2032, title: "Recovery", message: "Orbital infrastructure provides stability. Goal: 50% orbit share achieved?", shown: false }
    ]
  },
  latency_wars: {
    id: "latency_wars",
    title: "Latency Wars",
    description: "Competitor launches low-latency constellation. Beat their latency by 2035.",
    startYear: 2025,
    endYear: 2040,
    goals: [
      { type: "latency", target: 30, byYear: 2035, description: "Beat competitor latency (<30ms)" }
    ],
    constraints: [
      { type: "competitor_launch", startYear: 2030, value: 35 } // Competitor achieves 35ms
    ],
    narrative: [
      { year: 2030, title: "Competitor Launch", message: "Rival company launches low-latency constellation. They achieve 35ms average latency.", shown: false },
      { year: 2032, title: "Pressure Mounts", message: "Market demands lower latency. Can you beat 35ms?", shown: false },
      { year: 2035, title: "Victory?", message: "Latency wars conclude. Did you beat the competition?", shown: false }
    ]
  },
  carbon_neutral_2040: {
    id: "carbon_neutral_2040",
    title: "Carbon Neutral by 2040",
    description: "Carbon tax increases 10% per year. Achieve zero net carbon by 2040.",
    startYear: 2025,
    endYear: 2045,
    goals: [
      { type: "carbon", target: 0, byYear: 2040, description: "Zero net carbon emissions" }
    ],
    constraints: [
      { type: "carbon_tax", startYear: 2025, value: 0.1 } // 10% increase per year
    ],
    narrative: [
      { year: 2028, title: "Policy Shift", message: "Global carbon tax increases. Ground compute becomes expensive.", shown: false },
      { year: 2035, title: "Halfway Point", message: "Carbon tax now 100% higher. Orbit's advantage grows.", shown: false },
      { year: 2040, title: "Deadline", message: "2040 deadline arrives. Did you achieve carbon neutrality?", shown: false }
    ]
  }
};

interface ScenarioStore {
  activeScenario: ScenarioId | null;
  setActiveScenario: (scenario: ScenarioId | null) => void;
  getActiveScenario: () => Scenario | null;
  checkGoals: (year: number, metrics: { orbitShare?: number; latency?: number; carbon?: number; cost?: number }) => Goal[];
  getActiveConstraints: (year: number) => Constraint[];
  getNarrativeEvents: (year: number) => NarrativeEvent[];
  markNarrativeShown: (scenarioId: ScenarioId, year: number) => void;
}

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  activeScenario: null,
  setActiveScenario: (scenario) => set({ activeScenario: scenario }),
  getActiveScenario: () => {
    const { activeScenario } = get();
    return activeScenario ? SCENARIOS[activeScenario] : null;
  },
  checkGoals: (year, metrics) => {
    const scenario = get().getActiveScenario();
    if (!scenario) return [];
    return scenario.goals.filter(goal => {
      if (year >= goal.byYear) {
        switch (goal.type) {
          case "orbit_share":
            return (metrics.orbitShare || 0) >= goal.target;
          case "latency":
            return (metrics.latency || Infinity) <= goal.target;
          case "carbon":
            return (metrics.carbon || Infinity) <= goal.target;
          case "cost":
            return (metrics.cost || Infinity) <= goal.target;
        }
      }
      return false;
    });
  },
  getActiveConstraints: (year) => {
    const scenario = get().getActiveScenario();
    if (!scenario) return [];
    return scenario.constraints.filter(c => {
      if (c.endYear) {
        return year >= c.startYear && year <= c.endYear;
      }
      return year >= c.startYear;
    });
  },
  getNarrativeEvents: (year) => {
    const scenario = get().getActiveScenario();
    if (!scenario) return [];
    return scenario.narrative.filter(e => e.year === year && !e.shown);
  },
  markNarrativeShown: (scenarioId, year) => {
    const scenario = SCENARIOS[scenarioId];
    if (scenario) {
      scenario.narrative.forEach(e => {
        if (e.year === year) e.shown = true;
      });
    }
  }
}));

