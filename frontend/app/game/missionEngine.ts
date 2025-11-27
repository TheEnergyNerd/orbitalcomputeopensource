import missionsJson from "./missions.json";
import {
  MissionDefinition,
  SimulationState,
  MissionObjective,
} from "./simTypes";

export const MISSIONS: MissionDefinition[] =
  missionsJson as unknown as MissionDefinition[];

export function getMissionById(
  id: string | undefined
): MissionDefinition | undefined {
  if (!id) return undefined;
  return MISSIONS.find((m) => m.id === id);
}

// naive metric resolver; extend as needed
function resolveMetric(state: SimulationState, metricKey: string): number {
  const [group, field] = metricKey.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metrics: any = state.metrics;
  if (!metrics) return 0;
  const groupObj = metrics[group];
  if (!groupObj) return 0;
  const value = groupObj[field];
  return typeof value === "number" ? value : 0;
}

function checkObjective(state: SimulationState, obj: MissionObjective): boolean {
  const value = resolveMetric(state, obj.metric);
  const target = obj.target;

  switch (obj.comparator) {
    case "<":
      return value < target;
    case "<=":
      return value <= target;
    case ">":
      return value > target;
    case ">=":
      return value >= target;
    default:
      return false;
  }
}

export function evaluateMission(state: SimulationState): {
  allObjectivesMet: boolean;
  failedConstraints: string[];
} {
  const mission = getMissionById(state.currentMissionId);
  if (!mission) return { allObjectivesMet: false, failedConstraints: [] };

  const allObjectivesMet = mission.objectives.every((obj) =>
    checkObjective(state, obj)
  );

  const failedConstraints: string[] = [];
  const constraints = mission.constraints ?? [];

  constraints.forEach((cons) => {
    if (typeof cons.maxSatellites === "number") {
      const sats = state.orbit.satellites;
      if (sats > cons.maxSatellites) {
        failedConstraints.push(cons.id);
      }
    }
    if (typeof cons.budgetCapMillionUsd === "number") {
      if (state.budgetMillionUsd > cons.budgetCapMillionUsd) {
        failedConstraints.push(cons.id);
      }
    }
    // allowedBands etc. can be enforced by UI rather than failing retroactively
  });

  return { allObjectivesMet, failedConstraints };
}


