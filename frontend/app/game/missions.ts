import type { MissionDefinition } from "./missionTypes";

// Import missions data - using require for JSON in case tsconfig doesn't support JSON imports
const missionsData = require("./missions.json");

export const MISSIONS: MissionDefinition[] = missionsData as MissionDefinition[];

export function getMissionById(id: string): MissionDefinition | undefined {
  return MISSIONS.find((m) => m.id === id);
}

export function getUnlockedMissions(unlockedIds: string[]): MissionDefinition[] {
  return MISSIONS.filter((m) => unlockedIds.includes(m.id));
}

