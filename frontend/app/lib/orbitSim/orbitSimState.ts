/**
 * Core Orbital Sim State Model
 * Pure simulation logic - no React dependencies
 */

// Factory tiers 1–3
export type Tier = 1 | 2 | 3;

export type StageId = 'silicon' | 'chips' | 'racks' | 'pods' | 'launch' | 'orbit';

export interface FactoryStage {
  id: StageId;
  tier: Tier;
  // Throughput in abstract "units per second"
  baseThroughput: number;
  // Derived at runtime
  effectiveThroughput: number;
  utilization: number;    // 0..>1
  bottleneckLevel: 'green' | 'yellow' | 'red';
}

export interface Metrics {
  groundOpex: number;
  orbitOpex: number;
  groundCostPerCompute: number;
  orbitCostPerCompute: number;
  groundLatency: number;
  orbitLatency: number;
  groundCarbon: number;
  orbitCarbon: number;
}

export interface FlowState {
  // Steady-state flow rates through the pipeline
  siliconRate: number;
  chipsRate: number;
  racksRate: number;
  podsRate: number;
  launchesPerYear: number;
  liveOrbitPods: number;
  // Failures/backlog
  launchFailureRate: number;
  backlogFactor: number;   // 0..3 (0 good, >1 backlog)
}

export interface Mission {
  id: 'cheap_orbit' | 'green_leap' | 'energy_collapse' | 'launch_surge' | 'orbital_era';
  name: string;
  description: string;
  // 0..100 progress
  progress: number;
  // completed flag
  completed: boolean;
}

export interface OrbitalSimState {
  // Time
  elapsedSeconds: number;
  // User interaction tracking
  hasInteracted: boolean;  // Prevents mission completion until user acts
  allocationPoints: number;  // Resource budget (100 to start)
  // Pipeline stages
  stages: Record<StageId, FactoryStage>;
  // High-level parameters
  totalComputeDemand: number;  // TFLOP units
  groundComputeShare: number;  // 0..1
  orbitComputeShare: number;   // 0..1 (derived, should sum ~1)
  // Environment / scenario
  groundEnergyStress: number;  // 0..1 (0 chill, 1 crisis)
  // Flow dynamics
  flow: FlowState;
  metrics: Metrics;
  // Economics
  breakpointReached: boolean;
  breakpointAtOrbitShare: number | null; // orbit share at crossing when first hit
  orbitScore: number;   // main score
  // Missions
  currentMission: Mission;
  suggestedMoves: string[];
  // History for graphs
  opexHistory: Array<{ time: number; ground: number; orbit: number }>;
}

// Baseline economic scales
const BASE_GROUND_OPEX = 1000;        // arbitrary units
const BASE_ORBIT_OPEX = 900;          // before improvements
const BASE_LAUNCH_COST_PER_POD = 5;
const BASE_ENERGY_COST = 1.0;
const BASE_COOLING_COST = 0.6;
const BASE_WATER_COST = 0.3;
const BASE_CARBON_COST = 0.3;

// Launch cost collapse sensitivity
const LAUNCH_COST_LEARNING_RATE = 0.3;  // stronger -> faster orbit cost drop

// Latency baseline
const BASE_GROUND_LATENCY = 120;     // ms
const BASE_ORBIT_LATENCY = 80;       // ms at high orbit share

// Carbon baseline
const BASE_GROUND_CARBON = 100;      // relative units
const BASE_ORBIT_CARBON_PER_POD = 0.1;  // small launch carbon per pod

interface TierConfig {
  throughput: number;   // units per second
  energyCost: number;   // relative units
  heatCost: number;     // contributes to cooling/water
}

const TIER_CONFIG: Record<Tier, TierConfig> = {
  1: { throughput: 10, energyCost: 1, heatCost: 1 },
  2: { throughput: 25, energyCost: 2.2, heatCost: 2.4 },
  3: { throughput: 60, energyCost: 5, heatCost: 5.5 },
};

function initStage(id: StageId, tier: Tier): FactoryStage {
  const { throughput } = TIER_CONFIG[tier];
  return {
    id,
    tier,
    baseThroughput: throughput,
    effectiveThroughput: throughput,
    utilization: 0,
    bottleneckLevel: 'green',
  };
}

export function createInitialState(): OrbitalSimState {
  const stages: Record<StageId, FactoryStage> = {
    silicon: initStage('silicon', 1),
    chips: initStage('chips', 1),
    racks: initStage('racks', 1),
    pods: initStage('pods', 1),
    launch: initStage('launch', 1),
    orbit: initStage('orbit', 1),
  };

  // Start with almost entirely ground compute
  const orbitComputeShare = 0.1;
  const groundComputeShare = 0.9;

  return {
    elapsedSeconds: 0,
    hasInteracted: false,
    allocationPoints: 100,
    stages,
    totalComputeDemand: 1000,
    groundComputeShare,
    orbitComputeShare,
    groundEnergyStress: 0.3,
    flow: {
      siliconRate: 0,
      chipsRate: 0,
      racksRate: 0,
      podsRate: 0,
      launchesPerYear: 0,
      liveOrbitPods: 0,
      launchFailureRate: 0,
      backlogFactor: 0,
    },
    metrics: {
      groundOpex: BASE_GROUND_OPEX,
      orbitOpex: BASE_ORBIT_OPEX,
      groundCostPerCompute: BASE_GROUND_OPEX / 1000, // Initialize with reasonable value
      orbitCostPerCompute: BASE_ORBIT_OPEX / 1000,
      groundLatency: BASE_GROUND_LATENCY,
      orbitLatency: BASE_GROUND_LATENCY,
      groundCarbon: BASE_GROUND_CARBON,
      orbitCarbon: 0, // starts at 0, grows with launches
    },
    breakpointReached: false,
    breakpointAtOrbitShare: null,
    orbitScore: 0,
    currentMission: {
      id: 'cheap_orbit',
      name: 'Cheap Orbit',
      description: 'Make orbit OPEX at least 20% cheaper than ground.',
      progress: 0,
      completed: false,
    },
    suggestedMoves: [],
    opexHistory: [],
  };
}

/**
 * Compute flow through the pipeline
 */
export function computeFlow(state: OrbitalSimState): FlowState {
  const s = state.stages;

  // Base throughput from tiers
  const siliconCap = TIER_CONFIG[s.silicon.tier].throughput;
  const chipsCap = TIER_CONFIG[s.chips.tier].throughput;
  const racksCap = TIER_CONFIG[s.racks.tier].throughput;
  const podsCap = TIER_CONFIG[s.pods.tier].throughput;
  const launchCap = TIER_CONFIG[s.launch.tier].throughput;
  const orbitCap = TIER_CONFIG[s.orbit.tier].throughput;

  // Pipeline flow = min of all caps, with some soft inefficiency
  const siliconRate = siliconCap;
  const chipsRate = Math.min(chipsCap, siliconRate);
  const racksRate = Math.min(racksCap, chipsRate);
  const podsRate = Math.min(podsCap, racksRate);

  // Launch capacity per year (stylized)
  const launchesPerYearCapacity = launchCap * 12; // 12 "months"
  const podsPerLaunch = 10;
  const podsNeededPerYear = podsRate; // 1 pod unit = 1 "pod per year" simplified
  const launchesRequiredPerYear = podsNeededPerYear / podsPerLaunch;

  const backlogFactor = launchesRequiredPerYear / Math.max(launchesPerYearCapacity, 1);
  // Launch failures grow with over-aggressive cadence
  const launchFailureRate = Math.max(0, backlogFactor - 1) * 0.2; // 0..something

  // Live pods = throughput - losses (very stylized; no time integration for now)
  const liveOrbitPods = Math.max(0, podsRate * (1 - launchFailureRate));

  return {
    siliconRate,
    chipsRate,
    racksRate,
    podsRate,
    launchesPerYear: launchesRequiredPerYear,
    liveOrbitPods,
    launchFailureRate,
    backlogFactor: Math.min(backlogFactor, 3),
  };
}

/**
 * Annotate stages with utilization and bottleneck levels
 */
function annotateStages(state: OrbitalSimState, flow: FlowState): Record<StageId, FactoryStage> {
  const newStages = { ...state.stages };

  const stageRates: Record<StageId, number> = {
    silicon: flow.siliconRate,
    chips: flow.chipsRate,
    racks: flow.racksRate,
    pods: flow.podsRate,
    launch: flow.launchesPerYear,     // approximate
    orbit: flow.liveOrbitPods,
  };

  (Object.keys(newStages) as StageId[]).forEach((id) => {
    const stage = newStages[id];
    const cap = TIER_CONFIG[stage.tier].throughput;
    const rate = stageRates[id];
    const utilization = cap === 0 ? 0 : rate / cap;

    let level: FactoryStage['bottleneckLevel'] = 'green';
    if (utilization > 0.9 && utilization <= 1.1) level = 'yellow';
    else if (utilization > 1.1) level = 'red';

    newStages[id] = {
      ...stage,
      baseThroughput: cap,
      effectiveThroughput: rate,
      utilization,
      bottleneckLevel: level,
    };
  });

  return newStages;
}

/**
 * Compute economics (OPEX, latency, carbon, cost per compute)
 */
export function computeEconomics(state: OrbitalSimState, flow: FlowState): Metrics {
  const { groundEnergyStress } = state;

  // Ground energy & cooling scale with factory energy usage + stress
  let totalEnergyCost = 0;
  let totalHeatCost = 0;

  (Object.values(state.stages) as FactoryStage[]).forEach((stage) => {
    const cfg = TIER_CONFIG[stage.tier];
    totalEnergyCost += cfg.energyCost;
    totalHeatCost += cfg.heatCost;
  });

  const energyMultiplier = 1 + groundEnergyStress * 1.5;
  const coolingMultiplier = 1 + totalHeatCost * 0.05; // more factories => more cooling

  const groundEnergyComponent = BASE_ENERGY_COST * totalEnergyCost * energyMultiplier;
  const groundCoolingComponent = BASE_COOLING_COST * totalHeatCost * coolingMultiplier;
  const groundWaterComponent = BASE_WATER_COST * totalHeatCost * 0.3;
  const carbonPenaltyComponent = BASE_CARBON_COST * groundEnergyStress * 2;

  const groundOpex =
    BASE_GROUND_OPEX +
    groundEnergyComponent +
    groundCoolingComponent +
    groundWaterComponent +
    carbonPenaltyComponent;

  // Orbit: launch amortization + maintenance + tiny carbon
  const launchCost = BASE_LAUNCH_COST_PER_POD * flow.launchesPerYear;
  const learningFactor =
    1 / (1 + LAUNCH_COST_LEARNING_RATE * Math.sqrt(flow.launchesPerYear + 1));

  const orbitBaseOpex = BASE_ORBIT_OPEX * learningFactor;
  const maintenanceOpex = 0.5 * flow.liveOrbitPods;
  const orbitCarbon = flow.launchesPerYear * BASE_ORBIT_CARBON_PER_POD;

  const orbitOpex = orbitBaseOpex + launchCost + maintenanceOpex;

  // Compute split
  const totalCompute = state.totalComputeDemand;
  const orbitComputeShare = Math.min(0.95, flow.liveOrbitPods / (totalCompute / 10)); // stylized
  const groundComputeShare = 1 - orbitComputeShare;

  // Cost per compute: divide OPEX by actual compute capacity
  // Ground: uses energy + cooling costs
  // Orbit: uses launch amortization + maintenance, but free solar energy
  const groundComputeCapacity = totalCompute * Math.max(0.05, groundComputeShare); // Ensure non-zero
  const orbitComputeCapacity = totalCompute * Math.max(0.05, orbitComputeShare);
  
  // Ground cost per compute includes all energy/cooling costs
  const groundCostPerCompute = groundOpex / Math.max(groundComputeCapacity, 1);
  
  // Orbit cost per compute: launch costs amortized, but energy is free (solar)
  // At scale, orbit should be cheaper per compute unit due to free solar energy
  // The key insight: orbit energy is FREE (solar), so only launch + maintenance costs matter
  // Ground has to pay for energy + cooling, which is expensive
  
  // Base orbit cost (launch amortization + maintenance, no energy cost)
  const orbitCostPerComputeBase = orbitOpex / Math.max(orbitComputeCapacity, 1);
  
  // When orbit share is significant, the free solar energy makes it cheaper
  // The more orbit share, the cheaper it gets (economies of scale on launch costs)
  // At 0% orbit share, cost is high (just launch setup)
  // At >20% orbit share, orbit is significantly cheaper (free energy dominates)
  const scaleFactor = orbitComputeShare < 0.05 
    ? 1.2  // Slightly more expensive at very low share (setup costs)
    : orbitComputeShare < 0.2
    ? 0.9  // 10% cheaper at moderate share
    : 0.6; // 40% cheaper at high share (free solar dominates)
  
  const effectiveOrbitCostPerCompute = orbitCostPerComputeBase * scaleFactor;
  
  // Latency: orbit wins as share grows
  const groundLatency = BASE_GROUND_LATENCY * (1 + groundEnergyStress * 0.2);
  const orbitLatency =
    BASE_GROUND_LATENCY -
    40 * orbitComputeShare +
    5 * flow.backlogFactor; // backlog makes things jittery

  const groundCarbon = BASE_GROUND_CARBON * (1 + groundEnergyStress * 1.2);
  const orbitCarbonTotal = orbitCarbon; // only launches

  return {
    groundOpex,
    orbitOpex,
    groundCostPerCompute,
    orbitCostPerCompute: effectiveOrbitCostPerCompute,
    groundLatency,
    orbitLatency: Math.max(20, orbitLatency),
    groundCarbon,
    orbitCarbon: orbitCarbonTotal, // only launches
  };
}

/**
 * Update breakpoint detection and ORBITSCORE
 */
function updateBreakpointAndScore(state: OrbitalSimState, metrics: Metrics): OrbitalSimState {
  let { breakpointReached, breakpointAtOrbitShare, orbitScore } = state;
  const { groundOpex, orbitOpex } = metrics;

  const newlyCrossed = !breakpointReached && orbitOpex < groundOpex;

  const orbitAdvantage = (groundOpex - orbitOpex) / groundOpex; // 0..1+
  const stabilityBonus = 1 - Math.min(state.flow.backlogFactor, 1); // 0..1
  const bottleneckPenalty = Object.values(state.stages).filter(
    (st) => st.bottleneckLevel === 'red'
  ).length;

  if (newlyCrossed) {
    breakpointReached = true;
    breakpointAtOrbitShare = state.orbitComputeShare;
  }

  // Score is continuous, no need to wait for breakpoint; but crossing gives a big bump.
  const baseScore =
    3000 * Math.max(0, orbitAdvantage) +
    1000 * stabilityBonus -
    200 * bottleneckPenalty;

  if (breakpointReached) {
    orbitScore = Math.max(orbitScore, Math.round(baseScore + 2000));
  } else {
    orbitScore = Math.max(orbitScore, Math.round(baseScore));
  }

  return {
    ...state,
    breakpointReached,
    breakpointAtOrbitShare,
    orbitScore: Math.max(0, orbitScore),
  };
}

/**
 * Mission definitions
 */
const MISSIONS: Mission[] = [
  {
    id: 'cheap_orbit',
    name: 'Cheap Orbit',
    description: 'Make orbit OPEX at least 20% cheaper than ground.',
    progress: 0,
    completed: false,
  },
  {
    id: 'green_leap',
    name: 'Green Leap',
    description: 'Cut carbon by 60% vs current ground baseline.',
    progress: 0,
    completed: false,
  },
  {
    id: 'energy_collapse',
    name: 'Energy Collapse',
    description: 'Survive a severe ground energy crisis by shifting compute to orbit.',
    progress: 0,
    completed: false,
  },
  {
    id: 'launch_surge',
    name: 'Launch Surge',
    description: 'Use launches efficiently: grow orbit while keeping failures low.',
    progress: 0,
    completed: false,
  },
  {
    id: 'orbital_era',
    name: 'Orbital Era',
    description: 'Cross the breakpoint and reach at least 60% orbit compute.',
    progress: 0,
    completed: false,
  },
];

export function getMissionById(id: string): Mission | undefined {
  return MISSIONS.find(m => m.id === id);
}

export function getAllMissions(): Mission[] {
  return MISSIONS;
}

/**
 * Evaluate mission progress and generate suggestions
 */
export function evaluateMission(
  state: OrbitalSimState,
  metrics: Metrics
): { mission: Mission; suggestedMoves: string[] } {
  const m = { ...state.currentMission };
  const { groundOpex, orbitOpex, groundCarbon, orbitCarbon, groundLatency, orbitLatency } = metrics;

  const opexDelta = (orbitOpex - groundOpex) / groundOpex; // negative good
  const carbonDelta = (orbitCarbon - groundCarbon) / groundCarbon; // negative good
  const latencyDelta = orbitLatency - groundLatency;

  let suggestedMoves: string[] = [];
  let progress = 0;
  let completed = false;

  switch (m.id) {
    case 'cheap_orbit': {
      // target opexDelta <= -0.2
      progress = Math.max(0, Math.min(100, (-opexDelta / 0.2) * 100));
      completed = opexDelta <= -0.2;
      if (!completed) {
        if (opexDelta > -0.1) {
          suggestedMoves.push('Upgrade pods and racks to increase orbital throughput.');
        }
        if (state.groundEnergyStress < 0.7) {
          suggestedMoves.push('Raise ground energy stress (scenario slider) to expose cost gap.');
        }
      }
      break;
    }
    case 'green_leap': {
      // carbonDelta <= -0.6
      progress = Math.max(0, Math.min(100, (-carbonDelta / 0.6) * 100));
      completed = carbonDelta <= -0.6;
      if (!completed) {
        suggestedMoves.push('Upgrade pods and orbit integration tiers.');
        suggestedMoves.push('Avoid over-scaling ground factories; that increases carbon.');
      }
      break;
    }
    case 'energy_collapse': {
      // scenario: set groundEnergyStress high, player must still cross breakpoint
      const stress = state.groundEnergyStress;
      const stressScore = Math.min(1, stress);
      const breakpointScore = state.breakpointReached ? 1 : 0;
      progress = Math.round((0.5 * stressScore + 0.5 * breakpointScore) * 100);
      completed = stress > 0.7 && state.breakpointReached;
      if (!completed) {
        if (stress < 0.7) {
          suggestedMoves.push('Increase ground energy stress to simulate a crisis.');
        }
        if (!state.breakpointReached) {
          suggestedMoves.push('Scale orbit pipeline without collapsing under failures.');
        }
      }
      break;
    }
    case 'launch_surge': {
      const failurePenalty = state.flow.launchFailureRate;
      const launchScore = Math.max(
        0,
        1 - failurePenalty - state.flow.backlogFactor * 0.2
      );
      progress = Math.round(launchScore * 100);
      completed = launchScore >= 0.8;
      if (!completed) {
        suggestedMoves.push('Balance launch tier upgrades with pods and racks to avoid backlog.');
        suggestedMoves.push('Do not overshoot launch capacity or reliability will suffer.');
      }
      break;
    }
    case 'orbital_era': {
      const shareScore = Math.min(1, state.orbitComputeShare / 0.6);
      const breakpointScore = state.breakpointReached ? 1 : 0;
      progress = Math.round((0.6 * shareScore + 0.4 * breakpointScore) * 100);
      completed = state.breakpointReached && state.orbitComputeShare >= 0.6;
      if (!completed) {
        suggestedMoves.push('Push more pods into orbit: upgrade pods and launch tiers.');
        suggestedMoves.push('Avoid red bottlenecks in the pipeline for a stable orbit fleet.');
      }
      break;
    }
  }

  m.progress = Math.min(100, progress);
  m.completed = completed;

  return { mission: m, suggestedMoves };
}

/**
 * Single tick update function - call this each frame/interval
 */
export function tick(state: OrbitalSimState, dtSeconds: number): OrbitalSimState {
  // 1. Advance time
  let next: OrbitalSimState = { ...state, elapsedSeconds: state.elapsedSeconds + dtSeconds };

  // 2. Compute flow
  const flow = computeFlow(next);
  next.flow = flow;

  // 3. Annotate stages with bottlenecks
  next.stages = annotateStages(next, flow);

  // 4. Compute economics
  const metrics = computeEconomics(next, flow);
  next.metrics = metrics;

  // 5. Update orbit/ground share (stylized)
  const orbitShare = Math.min(0.95, flow.liveOrbitPods / (next.totalComputeDemand / 10 || 1));
  next.orbitComputeShare = orbitShare;
  next.groundComputeShare = 1 - orbitShare;

  // 6. Breakpoint + score
  next = updateBreakpointAndScore(next, metrics);

  // 7. Mission evaluation (only if user has interacted)
  if (next.hasInteracted) {
    const { mission, suggestedMoves } = evaluateMission(next, metrics);
    next.currentMission = mission;
    next.suggestedMoves = suggestedMoves;
  } else {
    // Keep mission at 0% progress until interaction
    next.currentMission = {
      ...next.currentMission,
      progress: 0,
      completed: false,
    };
    next.suggestedMoves = [];
  }

  // 8. Update OPEX history (keep last 100 points)
  next.opexHistory = [
    ...next.opexHistory,
    { time: next.elapsedSeconds, ground: metrics.groundOpex, orbit: metrics.orbitOpex }
  ].slice(-100);

  return next;
}

/**
 * Action: Upgrade a stage tier
 */
export function upgradeStage(state: OrbitalSimState, stageId: StageId, newTier: Tier): OrbitalSimState {
  const stage = state.stages[stageId];
  if (!stage || newTier < 1 || newTier > 3) return state;
  
  // Calculate allocation point cost
  const currentTier = stage.tier;
  let cost = 0;
  if (currentTier === 1 && newTier === 2) {
    cost = 10;
  } else if (currentTier === 2 && newTier === 3) {
    cost = 20;
  } else if (currentTier === 1 && newTier === 3) {
    cost = 30; // T1 -> T3 costs both upgrades
  }
  
  // Check if user has enough points
  if (state.allocationPoints < cost) {
    return state; // Not enough points
  }

  return {
    ...state,
    allocationPoints: state.allocationPoints - cost,
    stages: {
      ...state.stages,
      [stageId]: {
        ...stage,
        tier: newTier,
      },
    },
  };
}

/**
 * Action: Set ground energy stress
 */
export function setGroundEnergyStress(state: OrbitalSimState, stress: number): OrbitalSimState {
  const oldStress = state.groundEnergyStress;
  const newStress = Math.max(0, Math.min(1, stress));
  const stressDelta = Math.abs(newStress - oldStress);
  
  // Calculate cost: 15 AP per 10% reduction (only charge for reductions)
  let cost = 0;
  if (newStress < oldStress) {
    cost = Math.ceil((stressDelta / 0.1) * 15);
  }
  
  // Check if user has enough points
  if (state.allocationPoints < cost) {
    return state; // Not enough points
  }
  
  return {
    ...state,
    allocationPoints: state.allocationPoints - cost,
    groundEnergyStress: newStress,
  };
}

/**
 * Action: Set current mission
 */
export function setCurrentMission(state: OrbitalSimState, missionId: string): OrbitalSimState {
  const mission = getMissionById(missionId);
  if (!mission) return state;

  return {
    ...state,
    currentMission: {
      ...mission,
      progress: 0,
      completed: false,
    },
  };
}

