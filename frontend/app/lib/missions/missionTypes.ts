/**
 * Mission system - clear goals for players to achieve
 */

export interface MissionCondition {
  metric: 'opex' | 'carbon' | 'latency' | 'cost' | 'resilience' | 'energy';
  operator: 'gte' | 'lte'; // greater than or equal, less than or equal
  threshold: number;
  description: string;
}

export interface Mission {
  id: string;
  name: string;
  description: string;
  conditions: MissionCondition[];
  completed: boolean;
  completedAt?: number;
  shareableSummary?: string;
}

export const MISSION_PRESETS: Mission[] = [
  {
    id: 'cheap_orbit',
    name: 'Cheap Orbit',
    description: 'Reduce Annual OPEX by ≥15% vs ground-only while keeping Latency increase <2 ms.',
    conditions: [
      {
        metric: 'opex',
        operator: 'lte',
        threshold: -15,
        description: 'Reduce OPEX by ≥15%',
      },
      {
        metric: 'latency',
        operator: 'lte',
        threshold: 2,
        description: 'Keep Latency increase <2 ms',
      },
    ],
    completed: false,
  },
  {
    id: 'green_orbit',
    name: 'Green Orbit',
    description: 'Reduce Carbon by ≥40% with OPEX increase <5%.',
    conditions: [
      {
        metric: 'carbon',
        operator: 'lte',
        threshold: -40,
        description: 'Reduce Carbon by ≥40%',
      },
      {
        metric: 'opex',
        operator: 'lte',
        threshold: 5,
        description: 'Keep OPEX increase <5%',
      },
    ],
    completed: false,
  },
  {
    id: 'edge_orbit',
    name: 'Edge Orbit',
    description: 'Improve latency by ≥5ms with Energy cost increase <15%.',
    conditions: [
      {
        metric: 'latency',
        operator: 'lte',
        threshold: -5,
        description: 'Improve Latency by ≥5ms',
      },
      {
        metric: 'energy',
        operator: 'lte',
        threshold: 15,
        description: 'Keep Energy cost increase <15%',
      },
    ],
    completed: false,
  },
  {
    id: 'resilient_orbit',
    name: 'Resilient Orbit',
    description: 'Improve resilience by ≥10% with OPEX increase <10%.',
    conditions: [
      {
        metric: 'resilience',
        operator: 'gte',
        threshold: 10,
        description: 'Improve Resilience by ≥10%',
      },
      {
        metric: 'opex',
        operator: 'lte',
        threshold: 10,
        description: 'Keep OPEX increase <10%',
      },
    ],
    completed: false,
  },
  {
    id: 'optimal_balance',
    name: 'Optimal Balance',
    description: 'Achieve balanced improvements across all metrics.',
    conditions: [
      {
        metric: 'opex',
        operator: 'lte',
        threshold: 0,
        description: 'OPEX ≤ 0%',
      },
      {
        metric: 'latency',
        operator: 'lte',
        threshold: 0,
        description: 'Latency ≤ 0ms',
      },
      {
        metric: 'carbon',
        operator: 'lte',
        threshold: -20,
        description: 'Reduce Carbon by ≥20%',
      },
      {
        metric: 'resilience',
        operator: 'gte',
        threshold: 5,
        description: 'Improve Resilience by ≥5%',
      },
    ],
    completed: false,
  },
];

export function checkMissionProgress(
  mission: Mission,
  metrics: {
    opexDelta: number; // % change (negative = reduction)
    carbonDelta: number; // % change (negative = reduction)
    latencyDelta: number; // ms change (negative = reduction)
    costDelta: number; // % change (negative = reduction)
    energyDelta?: number; // % change (negative = reduction)
    resilienceDelta?: number; // % change (positive = improvement)
  }
): { completed: boolean; progress: Record<string, number> } {
  const progress: Record<string, number> = {};
  let allCompleted = true;

  for (const condition of mission.conditions) {
    const value = metrics[`${condition.metric}Delta`];
    const safeValue = value ?? 0; // Handle undefined values
    let conditionMet = false;

    if (condition.operator === 'lte') {
      // For "less than or equal", we want value <= threshold
      const safeValue = value ?? 0;
      conditionMet = safeValue <= condition.threshold;
      
      // Calculate progress: how close are we to the threshold?
      if (condition.threshold < 0) {
        // Threshold is negative (we want reduction)
        // Progress = how much of the reduction we've achieved
        // If value is -40 and threshold is -40, we're at 100%
        // If value is -20 and threshold is -40, we're at 50%
        const targetReduction = Math.abs(condition.threshold);
        const currentReduction = safeValue < 0 ? Math.abs(safeValue) : 0;
        progress[condition.metric] = Math.min(100, Math.max(0, (currentReduction / targetReduction) * 100));
      } else {
        // Threshold is positive (we want to stay below)
        // Progress = how far we are from threshold
        // If threshold is 2 and value is 0, we're at 100%
        // If threshold is 2 and value is 2, we're at 0%
        progress[condition.metric] = Math.min(100, Math.max(0, ((condition.threshold - safeValue) / condition.threshold) * 100));
      }
    } else if (condition.operator === 'gte') {
      // For "greater than or equal", we want value >= threshold
      conditionMet = safeValue >= condition.threshold;
      if (condition.threshold > 0) {
        progress[condition.metric] = Math.min(100, Math.max(0, (safeValue / condition.threshold) * 100));
      } else {
        progress[condition.metric] = safeValue >= condition.threshold ? 100 : 0;
      }
    }

    if (!conditionMet) {
      allCompleted = false;
    }
  }

  return { completed: allCompleted, progress };
}

