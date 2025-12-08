/**
 * Factory Types and Configuration
 * Core types for the Factorio-style throughput machine
 */

export type StageId = "silicon" | "chips" | "racks" | "pods" | "launch";

export type PodType = "edge" | "bulk" | "green";

export type RocketType = "heavy" | "medium" | "light";

export interface StageTuning {
  capacityLevel: number;   // 0–10
  automationLevel: number; // 0–10
}

export type FactoryTuning = Record<StageId, StageTuning>;

export interface StageThroughput {
  stageId: StageId;
  maxThroughputPerDeploy: number; // units / deployment
  effectiveThroughputPerDeploy: number; // after bottlenecks
}

/**
 * Base throughput per stage (units per deployment)
 */
export const BASE_THROUGHPUT_PER_DEPLOY: Record<StageId, number> = {
  silicon: 8,
  chips: 5.6,
  racks: 4.2,
  pods: 2.8,
  launch: 1.4,
};

/**
 * Derive efficiency from automation level
 * 0 → 0.6, 10 → 0.9
 */
export function deriveEfficiency(automationLevel: number): number {
  return Math.min(0.9, 0.6 + 0.03 * automationLevel);
}

/**
 * Derive reliability from automation level
 * 0 → 0.7, 10 → 0.95
 */
export function deriveReliability(automationLevel: number): number {
  return Math.min(0.95, 0.7 + 0.025 * automationLevel);
}

/**
 * Max throughput from capacity level
 */
export function maxThroughputFromCapacity(
  stageId: StageId,
  capacityLevel: number
): number {
  const base = BASE_THROUGHPUT_PER_DEPLOY[stageId];
  return base * (1 + 0.25 * capacityLevel);
}

/**
 * Pod type profiles
 */
export const POD_TYPE_PROFILES: Record<
  PodType,
  { costMultiplier: number; latencyMultiplier: number; carbonMultiplier: number }
> = {
  edge: { costMultiplier: 1.4, latencyMultiplier: 0.4, carbonMultiplier: 1.0 },
  bulk: { costMultiplier: 0.6, latencyMultiplier: 2.0, carbonMultiplier: 1.4 },
  green: { costMultiplier: 1.0, latencyMultiplier: 1.4, carbonMultiplier: 0.3 },
};

/**
 * Rocket type profiles
 */
export const ROCKET_TYPE_PROFILES: Record<
  RocketType,
  {
    launchCostMultiplier: number;
    podsPerDeploymentMultiplier: number;
    carbonMultiplier: number;
  }
> = {
  heavy: {
    launchCostMultiplier: 1.3,
    podsPerDeploymentMultiplier: 2.2,
    carbonMultiplier: 1.8,
  },
  medium: {
    launchCostMultiplier: 1.0,
    podsPerDeploymentMultiplier: 1.0,
    carbonMultiplier: 0.7,
  },
  light: {
    launchCostMultiplier: 0.7,
    podsPerDeploymentMultiplier: 0.5,
    carbonMultiplier: 1.2,
  },
};

/**
 * Pod Mix - Distribution of pod types
 */
export interface PodMix {
  edge: number;
  bulk: number;
  green: number;
}

/**
 * Rocket Mix - Distribution of rocket types
 */
export interface RocketMix {
  heavy: number;
  medium: number;
  light: number;
}

/**
 * Normalize pod mix to sum to 1
 */
export function normalizePodMix(m: PodMix): PodMix {
  const sum = m.edge + m.bulk + m.green || 1;
  return { edge: m.edge / sum, bulk: m.bulk / sum, green: m.green / sum };
}

/**
 * Normalize rocket mix to sum to 1
 */
export function normalizeRocketMix(m: RocketMix): RocketMix {
  const sum = m.heavy + m.medium + m.light || 1;
  return {
    heavy: m.heavy / sum,
    medium: m.medium / sum,
    light: m.light / sum,
  };
}

/**
 * Mix pod profiles based on distribution
 */
export function mixPodProfile(mix: PodMix) {
  const n = normalizePodMix(mix);
  const entries: [PodType, number][] = [
    ["edge", n.edge],
    ["bulk", n.bulk],
    ["green", n.green],
  ];

  let cost = 0, lat = 0, carb = 0;
  for (const [type, w] of entries) {
    const p = POD_TYPE_PROFILES[type];
    cost += w * p.costMultiplier;
    lat += w * p.latencyMultiplier;
    carb += w * p.carbonMultiplier;
  }
  return { costMultiplier: cost, latencyMultiplier: lat, carbonMultiplier: carb };
}

/**
 * Mix rocket profiles based on distribution
 */
export function mixRocketProfile(mix: RocketMix) {
  const n = normalizeRocketMix(mix);
  const entries: [RocketType, number][] = [
    ["heavy", n.heavy],
    ["medium", n.medium],
    ["light", n.light],
  ];

  let launchCost = 0, podsMult = 0, carb = 0;
  for (const [type, w] of entries) {
    const r = ROCKET_TYPE_PROFILES[type];
    launchCost += w * r.launchCostMultiplier;
    podsMult += w * r.podsPerDeploymentMultiplier;
    carb += w * r.carbonMultiplier;
  }
  return {
    launchCostMultiplier: launchCost,
    podsPerDeploymentMultiplier: podsMult,
    carbonMultiplier: carb,
  };
}

/**
 * Strategy → Pod Mix conversion
 */
export function podMixFromStrategy(strategy: "edge_heavy" | "bulk_heavy" | "green_heavy" | "balanced"): PodMix {
  switch (strategy) {
    case "edge_heavy":
      return { edge: 0.7, bulk: 0.2, green: 0.1 };
    case "bulk_heavy":
      return { edge: 0.1, bulk: 0.7, green: 0.2 };
    case "green_heavy":
      return { edge: 0.15, bulk: 0.15, green: 0.7 };
    case "balanced":
    default:
      return { edge: 0.4, bulk: 0.3, green: 0.3 };
  }
}

/**
 * Strategy → Rocket Mix conversion
 */
export function rocketMixFromStrategy(strategy: "heavy" | "medium" | "light"): RocketMix {
  switch (strategy) {
    case "heavy":
      return { heavy: 0.7, medium: 0.2, light: 0.1 };
    case "light":
      return { heavy: 0.1, medium: 0.2, light: 0.7 };
    case "medium":
    default:
      return { heavy: 0.2, medium: 0.6, light: 0.2 };
  }
}

