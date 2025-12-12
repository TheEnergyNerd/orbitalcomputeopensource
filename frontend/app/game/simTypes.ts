// Core simulation and mission types for the sandbox "game loop"

export type OrbitBand = "LEO" | "MEO" | "GEO";

export interface OrbitConfig {
  band: OrbitBand;
  satellites: number;
  altitudeKm: number;
  inclinationDeg: number;
}

export interface GroundConfig {
  regions: string[]; // e.g. ["NA", "EU", "AFRICA"]
  groundDcs: number; // total ground DC count
  reductionPct: number; // 0–100, how much ground load reduced
}

export interface ComputeSplit {
  orbitSharePct: number; // 0–100
  groundSharePct: number; // 0–100, should be 100 - orbitShare
}

export interface CostMetrics {
  capexMillionUsd: number;
  opexMillionUsdPerYear: number;
  costPerComputeUnit: number; // arbitrary normalized unit
}

export interface PerformanceMetrics {
  avgLatencyMs: number;
  p95LatencyMs: number;
  resilienceScore: number; // 0–100
  availabilityPct: number; // 0–100
}

export interface SustainabilityMetrics {
  annualCarbonTons: number;
  carbonReductionPct: number; // vs baseline ground-only
  powerMwhPerYear: number;
}

export interface WorldImpactMetrics {
  populationServedMillions: number;
  underservedCoveragePct: number; // e.g. % of Global South population covered
}

export interface SimulationMetrics {
  cost: CostMetrics;
  perf: PerformanceMetrics;
  sustainability: SustainabilityMetrics;
  worldImpact: WorldImpactMetrics;
}

// Mission system
export type MissionObjectiveType =
  | "METRIC_THRESHOLD"
  | "BUDGET_CAP"
  | "SCENARIO_RESILIENCE";

export type MetricKey =
  | "perf.avgLatencyMs"
  | "perf.p95LatencyMs"
  | "sustainability.carbonReductionPct"
  | "cost.capexMillionUsd"
  | "worldImpact.underservedCoveragePct"
  | "worldImpact.populationServedMillions"
  | "perf.resilienceScore";

export type Comparator = "<" | "<=" | ">" | ">=";

export interface MissionObjective {
  id: string;
  type: MissionObjectiveType;
  metric: MetricKey;
  comparator: Comparator;
  target: number;
  description: string; // human-readable
}

export interface MissionConstraint {
  id: string;
  description: string;
  maxSatellites?: number;
  allowedBands?: OrbitBand[];
  budgetCapMillionUsd?: number;
}

export interface MissionReward {
  id: string;
  type: "UNLOCK_MISSION" | "UNLOCK_TECH" | "BADGE";
  value: string; // id of unlocked item
  label: string; // human-readable
}

export type MissionDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface MissionDefinition {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  difficulty: MissionDifficulty;
  startingState: {
    orbit: OrbitConfig;
    ground: GroundConfig;
    split: ComputeSplit;
    budgetMillionUsd: number;
  };
  objectives: MissionObjective[];
  constraints?: MissionConstraint[];
  rewards: MissionReward[];
  scenario?: {
    id: string;
    label: string;
    description: string;
    // toggles that affect sim engine; hook into existing surge / outage logic
    solarStorm?: boolean;
    groundOutageRegions?: string[];
    warzoneRegions?: string[];
  };
}

// Overall game state
export interface SimulationState {
  orbit: OrbitConfig;
  ground: GroundConfig;
  split: ComputeSplit;
  budgetMillionUsd: number;
  metrics: SimulationMetrics;
  currentMissionId?: string;
  completedMissions: string[];
  unlockedTech: string[];
  lastScenarioId?: string;
}










