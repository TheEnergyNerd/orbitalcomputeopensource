/**
 * Factory Engine - Single source of truth for factory state and multipliers
 */

export type FactoryStageId = 'silicon' | 'chips' | 'racks' | 'pods' | 'launch';

export type BreakthroughId =
  | 'silicon_yield'
  | 'chips_density'
  | 'racks_modularity'
  | 'pods_mass'
  | 'launch_reuse';

export interface BreakthroughState {
  id: BreakthroughId;
  level: number;           // 0..maxLevel
  maxLevel: number;
}

export interface FactoryStageState {
  id: FactoryStageId;
  name: string;
  baseCapacityPerYear: number;   // logical units / year
  efficiency: number;            // 0..1
  reliability: number;           // 0..1
  breakthroughs: BreakthroughState[];
}

export interface PowerRailsState {
  overclock: number;   // 0..1 (multiplier, +capacity, +volatility)
  efficient: number;   // 0..1 (-OPEX, -capacity)
  green: number;       // 0..1 (-carbon, -capacity)
}

export interface FactoryState {
  stages: Record<FactoryStageId, FactoryStageState>;
  rails: PowerRailsState;
}

export interface FactoryMultipliers {
  orbitCostMultiplier: number;     // affects cost/compute in overview+futures
  orbitLatencyMultiplier: number;  // affects latency curves
  orbitCapacityPerPodMultiplier: number;
  podsPerLaunchMultiplier: number;
  carbonPerComputeMultiplier: number;
  volatilityFactor: number;        // used by futures cone + sentiment
}

/**
 * Create default factory state with reasonable initial values
 */
export function createDefaultFactoryState(): FactoryState {
  return {
    stages: {
      silicon: {
        id: 'silicon',
        name: 'Silicon',
        baseCapacityPerYear: 1000,
        efficiency: 0.7,
        reliability: 0.8,
        breakthroughs: [
          { id: 'silicon_yield', level: 0, maxLevel: 3 },
        ],
      },
      chips: {
        id: 'chips',
        name: 'Chips',
        baseCapacityPerYear: 800,
        efficiency: 0.75,
        reliability: 0.85,
        breakthroughs: [
          { id: 'chips_density', level: 0, maxLevel: 3 },
        ],
      },
      racks: {
        id: 'racks',
        name: 'Racks',
        baseCapacityPerYear: 600,
        efficiency: 0.8,
        reliability: 0.9,
        breakthroughs: [
          { id: 'racks_modularity', level: 0, maxLevel: 3 },
        ],
      },
      pods: {
        id: 'pods',
        name: 'Pods',
        baseCapacityPerYear: 400,
        efficiency: 0.85,
        reliability: 0.85,
        breakthroughs: [
          { id: 'pods_mass', level: 0, maxLevel: 3 },
        ],
      },
      launch: {
        id: 'launch',
        name: 'Launch',
        baseCapacityPerYear: 200,
        efficiency: 0.9,
        reliability: 0.95,
        breakthroughs: [
          { id: 'launch_reuse', level: 0, maxLevel: 3 },
        ],
      },
    },
    rails: {
      overclock: 0,
      efficient: 0,
      green: 0,
    },
  };
}

/**
 * Get breakthrough level from factory state
 */
function getBreakthroughLevel(
  factory: FactoryState,
  breakthroughId: BreakthroughId
): number {
  for (const stage of Object.values(factory.stages)) {
    const breakthrough = stage.breakthroughs.find(b => b.id === breakthroughId);
    if (breakthrough) {
      return breakthrough.level;
    }
  }
  return 0;
}

/**
 * Compute factory multipliers from factory state
 */
export function computeFactoryMultipliers(factory: FactoryState): FactoryMultipliers {
  // Get breakthrough levels
  const siliconYieldLvl = getBreakthroughLevel(factory, 'silicon_yield');
  const chipsDensityLvl = getBreakthroughLevel(factory, 'chips_density');
  const racksModLvl = getBreakthroughLevel(factory, 'racks_modularity');
  const podsMassLvl = getBreakthroughLevel(factory, 'pods_mass');
  const launchReuseLvl = getBreakthroughLevel(factory, 'launch_reuse');

  // Compute multipliers from breakthroughs
  let orbitCostMultiplier = 1 - 0.04 * siliconYieldLvl - 0.03 * chipsDensityLvl;
  let orbitLatencyMultiplier = 1 - 0.03 * chipsDensityLvl;
  let orbitCapacityPerPodMult = 1 + 0.05 * racksModLvl;
  let podsPerLaunchMultiplier = 1 + 0.07 * (podsMassLvl + launchReuseLvl);
  let carbonPerComputeMult = 1 - 0.05 * (siliconYieldLvl + podsMassLvl);
  let volatilityFactor = 1 + 0.2 * factory.rails.overclock - 0.15 * factory.rails.efficient;

  // Apply power rails effects
  const railCapacityMult =
    1 + 0.3 * factory.rails.overclock - 0.15 * factory.rails.efficient - 0.1 * factory.rails.green;
  orbitCapacityPerPodMult *= railCapacityMult;
  podsPerLaunchMultiplier *= railCapacityMult;
  carbonPerComputeMult *= 1 - 0.3 * factory.rails.green;

  // Clamp values to reasonable ranges
  return {
    orbitCostMultiplier: Math.max(0.5, orbitCostMultiplier),
    orbitLatencyMultiplier: Math.max(0.7, orbitLatencyMultiplier),
    orbitCapacityPerPodMultiplier: Math.max(1.0, orbitCapacityPerPodMult),
    podsPerLaunchMultiplier: Math.max(1.0, podsPerLaunchMultiplier),
    carbonPerComputeMultiplier: Math.max(0.3, carbonPerComputeMult),
    volatilityFactor: Math.max(0.5, Math.min(2.0, volatilityFactor)),
  };
}

/**
 * Find the bottleneck stage (lowest effective capacity)
 */
export function findBottleneck(factory: FactoryState): FactoryStageId {
  let minCapacity = Infinity;
  let bottleneck: FactoryStageId = 'silicon';

  for (const [id, stage] of Object.entries(factory.stages)) {
    const effectiveCapacity = stage.baseCapacityPerYear * stage.efficiency * stage.reliability;
    if (effectiveCapacity < minCapacity) {
      minCapacity = effectiveCapacity;
      bottleneck = id as FactoryStageId;
    }
  }

  return bottleneck;
}

/**
 * Get effective throughput between two stages
 */
export function getEffectiveThroughput(
  factory: FactoryState,
  fromId: FactoryStageId,
  toId: FactoryStageId
): number {
  const fromStage = factory.stages[fromId];
  const toStage = factory.stages[toId];
  
  const fromThroughput = fromStage.baseCapacityPerYear * fromStage.efficiency * fromStage.reliability;
  const toThroughput = toStage.baseCapacityPerYear * toStage.efficiency * toStage.reliability;
  
  // Throughput is limited by the minimum of the two stages
  return Math.min(fromThroughput, toThroughput);
}

