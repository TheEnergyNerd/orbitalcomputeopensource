export type MissionDifficulty = "EASY" | "MEDIUM" | "HARD" | "EXTREME";
export type OrbitBand = "LEO" | "MEO" | "GEO";
export type Comparator = "<=" | ">=" | "==" | "<" | ">";
export type RewardType = "UNLOCK_MISSION" | "UNLOCK_TECH" | "UNLOCK_ORBIT_MODE" | "UNLOCK_LAUNCH_PROVIDER" | "UNLOCK_MODE";
export type ConstraintType = "MAX_UNITS" | "BUDGET" | "NO_NEW_GROUND" | "RESILIENCE_MODE" | "ENERGY_MULTIPLIER" | "DEBRIS_RISK_THRESHOLD" | "MAX_GROUND_PCT";

export interface MissionStartingState {
  orbitBand: OrbitBand;
  techLevel: number;
  launchProvider: string;
  densityMode: string;
  offloadPct: number;
  unitsAvailable: number;
  budgetMillionUsd: number;
}

export interface MissionObjective {
  metric: string;
  comparator: Comparator;
  target: number;
  region?: string;
}

export interface MissionConstraint {
  type: ConstraintType;
  value: number | boolean;
}

export interface MissionScenario {
  solarStorm: boolean;
  groundOutage: string[];
  heatwave: boolean;
  surgeEvent?: boolean;
}

export interface MissionReward {
  type: RewardType;
  value: string;
}

export interface MissionDefinition {
  id: string;
  title: string;
  description: string;
  difficulty: MissionDifficulty;
  startingState: MissionStartingState;
  objectives: MissionObjective[];
  constraints: MissionConstraint[];
  scenario: MissionScenario;
  rewards: MissionReward[];
}

export interface MissionState {
  activeMissionId: string | null;
  completedMissions: string[];
  unlockedTech: string[];
  unlockedMissions: string[];
  unlockedOrbitModes: string[];
  unlockedLaunchProviders: string[];
  missionStartTime: number | null;
  missionTimeLimit?: number; // seconds
}

export interface MissionProgress {
  missionId: string;
  objectives: {
    [key: string]: {
      current: number;
      target: number;
      comparator: Comparator;
      met: boolean;
    };
  };
  constraints: {
    [key: string]: {
      current: number | boolean;
      limit: number | boolean;
      violated: boolean;
    };
  };
  isComplete: boolean;
  hasFailed: boolean;
  failureReason?: string;
}

