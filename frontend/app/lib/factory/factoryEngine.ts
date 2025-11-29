/**
 * factoryEngine
 *
 * Factorio-style production model for orbital compute.
 * Owns:
 *  - resources
 *  - facilities
 *  - recipes
 *  - bottlenecks
 *  - random events (stubbed)
 *
 * Produces per-tick:
 *  - podsReadyOnGround
 *  - launchSlots
 *  - bottleneck summaries
 *
 * NOTE: This engine is intentionally pure and side-effect free.
 */

// ---------- Core resource & facility types ----------

export type ResourceId =
  | "cash"
  | "chips"
  | "racks"
  | "podShells"
  | "launchSlots"
  | "fuel"
  | "rdPoints";

export type ResourceInventory = Record<ResourceId, number>;

export type FacilityType =
  | "chipFab"
  | "rackLine"
  | "podFactory"
  | "launchComplex"
  | "fuelDepot";

export type FacilityState = {
  type: FacilityType;
  lines: number;        // active, built lines
  desiredLines: number; // target lines set by UI
  level: number;        // upgrade level 1..N
  efficiency: number;   // 0–1, modified by events
};

export type RecipeId =
  | "makeChips"
  | "buildRacks"
  | "buildPodShells"
  | "integratePods"
  | "produceFuel"
  | "prepareLaunch";

export type Recipe = {
  id: RecipeId;
  label: string;
  facility: FacilityType;
  durationDays: number;
  baseInputs: Partial<ResourceInventory>;
  baseOutputs: Partial<ResourceInventory>;
};

export type ActiveRecipe = {
  recipeId: RecipeId;
  facilityType: FacilityType;
  progressDays: number;
};

export type BuildOrder = {
  id: string;
  facilityType: FacilityType;
  deltaLines: number;     // +1 for add, -1 for dismantle
  remainingDays: number;
  capexCost: number;
};

export type FactoryState = {
  inventory: ResourceInventory;
  facilities: FacilityState[];   // one per FacilityType
  activeRecipes: ActiveRecipe[]; // at least one per facility type
  podsBuiltTotal: number;
  podsReadyOnGround: number;
  podsBuiltThisTick: number;
  buildQueue: BuildOrder[];
  maxConcurrentBuilds: number;
  infrastructurePointsUsed: number;
  infrastructurePointsCap: number;
  activeEvents: RandomEvent[]; // Currently active random events
};

// ---------- Static recipes ----------

export const RECIPES: Record<RecipeId, Recipe> = {
  makeChips: {
    id: "makeChips",
    label: "Fabricate AI chips",
    facility: "chipFab",
    durationDays: 10,
    baseInputs: { cash: 5 },
    baseOutputs: { chips: 10 },
  },
  buildRacks: {
    id: "buildRacks",
    label: "Assemble racks",
    facility: "rackLine",
    durationDays: 5,
    baseInputs: { chips: 5, cash: 2 },
    baseOutputs: { racks: 5 },
  },
  buildPodShells: {
    id: "buildPodShells",
    label: "Build pod shells",
    facility: "podFactory",
    durationDays: 6,
    baseInputs: { racks: 5, cash: 6 },
    baseOutputs: { podShells: 1 },
  },
  integratePods: {
    id: "integratePods",
    label: "Integrate compute pods",
    facility: "podFactory",
    durationDays: 8,
    baseInputs: { podShells: 1, chips: 10, cash: 10 },
    baseOutputs: {}, // yields 1 completed pod (special case)
  },
  produceFuel: {
    id: "produceFuel",
    label: "Produce launch fuel",
    facility: "fuelDepot",
    durationDays: 4,
    baseInputs: { cash: 1 },
    baseOutputs: { fuel: 10 },
  },
  prepareLaunch: {
    id: "prepareLaunch",
    label: "Prepare launch slot",
    facility: "launchComplex",
    durationDays: 7,
    baseInputs: { fuel: 10, cash: 5 },
    baseOutputs: { launchSlots: 1 },
  },
};

// ---------- Throughput & bottlenecks ----------

export type BottleneckStage = "chips" | "racks" | "pods" | "launch";

export type BottleneckSummary = {
  stage: BottleneckStage;
  requiredPerMonth: number;
  actualPerMonth: number;
  utilization: number; // actual / required
  limitingResource?: ResourceId;
};

export type RandomEventType =
  | "chipSupplyShock"
  | "launchFailure"
  | "fuelShortage"
  | "debrisIncident";

export type RandomEvent = {
  id: string;
  type: RandomEventType;
  label: string;
  description: string;
  durationDays: number;
  remainingDays: number;
  affectedFacility?: FacilityType;
  efficiencyPenalty: number; // 0-1, multiplies facility efficiency
  deploymentBlocked?: boolean; // If true, blocks deployment for duration
};

export type FactoryTickResult = {
  nextFactory: FactoryState;
  podsCompletedThisTick: number;
  launchSlotsCreatedThisTick: number;
  bottlenecks: BottleneckSummary[];
  activeEvents: RandomEvent[];
  newEvents: RandomEvent[];
};

/**
 * Compute a throughput multiplier for a facility based on
 * number of lines, upgrade level, and efficiency.
 */
export function facilityThroughputMultiplier(f: FacilityState): number {
  const lineCount = f.lines ?? 0;
  const countFactor = Math.max(0, lineCount);
  const levelFactor = Math.pow(1.5, Math.max(0, f.level - 1)); // diminishing returns
  const efficiency = Math.max(0, Math.min(1, f.efficiency));
  return countFactor * levelFactor * efficiency;
}

// ---------- Helpers ----------

function getFacility(state: FactoryState, type: FacilityType): FacilityState {
  let facility = state.facilities.find((f) => f.type === type);
  if (!facility) {
    facility = { type, lines: 0, desiredLines: 0, level: 1, efficiency: 1 };
    state.facilities.push(facility);
  }
  return facility;
}

function getActiveRecipe(state: FactoryState, type: FacilityType): ActiveRecipe {
  let active = state.activeRecipes.find((r) => r.facilityType === type);
  if (!active) {
    // Default recipe for each facility type
    const defaultRecipeId: Record<FacilityType, RecipeId> = {
      chipFab: "makeChips",
      rackLine: "buildRacks",
      podFactory: "buildPodShells",
      fuelDepot: "produceFuel",
      launchComplex: "prepareLaunch",
    };
    active = {
      recipeId: defaultRecipeId[type],
      facilityType: type,
      progressDays: 0,
    };
    state.activeRecipes.push(active);
  }
  return active;
}

function cloneInventory(inv: ResourceInventory): ResourceInventory {
  return { ...inv };
}

// ---------- Build configuration & infra ----------

export const FACILITY_BUILD_CONFIG: Record<
  FacilityType,
  { capexPerLine: number; buildDaysPerLine: number; opexPerLinePerMonth: number }
> = {
  chipFab:       { capexPerLine: 30, buildDaysPerLine: 360, opexPerLinePerMonth: 1.5 },
  rackLine:      { capexPerLine: 10, buildDaysPerLine: 180, opexPerLinePerMonth: 0.5 },
  podFactory:    { capexPerLine: 20, buildDaysPerLine: 240, opexPerLinePerMonth: 0.8 },
  fuelDepot:     { capexPerLine: 5,  buildDaysPerLine: 120, opexPerLinePerMonth: 0.2 },
  launchComplex: { capexPerLine: 50, buildDaysPerLine: 540, opexPerLinePerMonth: 2.0 },
};

export const LINE_POINTS: Record<FacilityType, number> = {
  chipFab: 3,
  rackLine: 1,
  podFactory: 2,
  fuelDepot: 1,
  launchComplex: 4,
};

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function reconcileDesiredLines(
  factory: FactoryState,
  cash: number
): FactoryState {
  const next: FactoryState = {
    ...factory,
    facilities: factory.facilities.map((f) => ({ ...f })),
    buildQueue: factory.buildQueue.map((o) => ({ ...o })),
  };

  // Track current pending delta per facility (existing build orders)
  const pendingByFac: Partial<Record<FacilityType, number>> = {};
  next.buildQueue.forEach((o) => {
    pendingByFac[o.facilityType] = (pendingByFac[o.facilityType] ?? 0) + o.deltaLines;
  });

  for (const fac of next.facilities) {
    const existingPending = pendingByFac[fac.type] ?? 0;
    const desiredTotalLines = Math.max(0, fac.desiredLines);
    const targetRelative =
      desiredTotalLines - (fac.lines + existingPending);
    if (targetRelative === 0) {
      // Nothing new to do for this facility
      continue;
    }

    const direction = targetRelative > 0 ? 1 : -1;
    const remaining = Math.abs(targetRelative);
    let appliedDelta = 0;

    for (let i = 0; i < remaining; i++) {
      if (next.buildQueue.length >= next.maxConcurrentBuilds) break;

      const cfg = FACILITY_BUILD_CONFIG[fac.type];
      const capex = cfg.capexPerLine;

      // Infra cap check (only for adding lines)
      if (direction > 0) {
        const usedPoints = next.infrastructurePointsUsed;
        const costPoints = LINE_POINTS[fac.type];
        if (usedPoints + costPoints > next.infrastructurePointsCap) {
          break;
        }
      }

      if (cash < capex) break;
      cash -= capex;

      next.buildQueue.push({
        id: cryptoRandomId(),
        facilityType: fac.type,
        deltaLines: direction,
        remainingDays: cfg.buildDaysPerLine,
        capexCost: capex,
      });
      appliedDelta += direction;
      pendingByFac[fac.type] = (pendingByFac[fac.type] ?? 0) + direction;
    }

    // Snap desiredLines back to the maximum achievable target
    fac.desiredLines = fac.lines + (pendingByFac[fac.type] ?? 0);
  }

  return next;
}

export function runBuildQueueTick(factory: FactoryState, days: number): FactoryState {
  const next: FactoryState = {
    ...factory,
    facilities: factory.facilities.map((f) => ({ ...f })),
    buildQueue: factory.buildQueue.map((o) => ({ ...o })),
  };

  for (const order of next.buildQueue) {
    order.remainingDays -= days;
    if (order.remainingDays <= 0) {
      const fac = next.facilities.find((f) => f.type === order.facilityType);
      if (!fac) continue;
      fac.lines = Math.max(0, fac.lines + order.deltaLines);
      // Sync desiredLines toward actual when builds finish
      fac.desiredLines = fac.lines;

      // Adjust infra points
      const points = LINE_POINTS[order.facilityType];
      if (order.deltaLines > 0) {
        next.infrastructurePointsUsed += points;
      } else if (order.deltaLines < 0) {
        next.infrastructurePointsUsed = Math.max(
          0,
          next.infrastructurePointsUsed - points
        );
      }
    }
  }

  next.buildQueue = next.buildQueue.filter((o) => o.remainingDays > 0);
  return next;
}

// ---------- Core tick ----------

export function runFactoryTick(
  factory: FactoryState,
  days: number,
  requiredThroughput: { targetPodsPerMonth: number }
): FactoryTickResult {
  const next: FactoryState = {
    ...factory,
    inventory: cloneInventory(factory.inventory),
    facilities: factory.facilities.map((f) => ({ ...f })),
    activeRecipes: factory.activeRecipes.map((r) => ({ ...r })),
    podsBuiltTotal: factory.podsBuiltTotal,
    podsReadyOnGround: factory.podsReadyOnGround,
    podsBuiltThisTick: 0,
    buildQueue: factory.buildQueue.map((o) => ({ ...o })),
    maxConcurrentBuilds: factory.maxConcurrentBuilds,
    infrastructurePointsUsed: factory.infrastructurePointsUsed,
    infrastructurePointsCap: factory.infrastructurePointsCap,
  };

  // First, advance build queue (lines change over time)
  let withBuilds = runBuildQueueTick(next, days);

  // Apply opex based on active lines
  let cash = withBuilds.inventory.cash ?? 0;
  const monthFraction = days / 30;
  withBuilds.facilities.forEach((fac) => {
    const cfg = FACILITY_BUILD_CONFIG[fac.type];
    const opex = fac.lines * cfg.opexPerLinePerMonth * monthFraction;
    cash -= opex;
  });
  withBuilds.inventory.cash = cash;

  let podsCompletedThisTick = 0;
  let launchSlotsCreatedThisTick = 0;

  const facilityTypes: FacilityType[] = [
    "chipFab",
    "rackLine",
    "podFactory",
    "fuelDepot",
    "launchComplex",
  ];

  facilityTypes.forEach((type) => {
    const facility = getFacility(withBuilds, type);
    if (facility.lines <= 0 || facility.efficiency <= 0) return;

    const active = getActiveRecipe(withBuilds, type);
    const recipe = RECIPES[active.recipeId];

    const batchesPerMonth =
      (30 / recipe.durationDays) * facilityThroughputMultiplier(facility);

    // Convert the requested days into monthly fraction
    const monthFraction = days / 30;
    let idealBatches = batchesPerMonth * monthFraction;

    if (idealBatches <= 0) return;

    // Determine input-limited batches
    const inv = withBuilds.inventory;
    let maxBatchesByInputs = Infinity;
    (Object.keys(recipe.baseInputs) as ResourceId[]).forEach((rid) => {
      const requiredPerBatch = recipe.baseInputs[rid] ?? 0;
      if (requiredPerBatch <= 0) return;
      const available = inv[rid] ?? 0;
      maxBatchesByInputs = Math.min(
        maxBatchesByInputs,
        available / requiredPerBatch
      );
    });

    if (maxBatchesByInputs === Infinity) {
      maxBatchesByInputs = idealBatches;
    }

    const actualBatches = Math.max(
      0,
      Math.min(idealBatches, maxBatchesByInputs)
    );

    if (actualBatches <= 0) return;

    // Apply inputs
    (Object.keys(recipe.baseInputs) as ResourceId[]).forEach((rid) => {
      const requiredPerBatch = recipe.baseInputs[rid] ?? 0;
      if (requiredPerBatch <= 0) return;
      const totalRequired = requiredPerBatch * actualBatches;
      inv[rid] = (inv[rid] ?? 0) - totalRequired;
    });

    // Apply outputs
    (Object.keys(recipe.baseOutputs) as ResourceId[]).forEach((rid) => {
      const producedPerBatch = recipe.baseOutputs[rid] ?? 0;
      if (producedPerBatch <= 0) return;
      const totalProduced = producedPerBatch * actualBatches;
      inv[rid] = (inv[rid] ?? 0) + totalProduced;
      if (rid === "launchSlots") {
        launchSlotsCreatedThisTick += totalProduced;
      }
    });

    // Special case: integratePods creates whole pods, not inventory items
    if (recipe.id === "integratePods") {
      const podsThisTick = actualBatches; // 1 pod per batch
      podsCompletedThisTick += podsThisTick;
      withBuilds.podsBuiltThisTick += podsThisTick;
      withBuilds.podsBuiltTotal += podsThisTick;
      withBuilds.podsReadyOnGround += podsThisTick;
    }
  });

  // Spawn and process random events
  const { newEvents, updatedEvents } = spawnRandomEvents(withBuilds, days);
  withBuilds.activeEvents = [...updatedEvents, ...newEvents];
  
  // Apply event effects to facilities
  const withEvents = applyEventEffects(withBuilds, withBuilds.activeEvents);

  const bottlenecks = getBottlenecksSummary(withEvents, requiredThroughput);

  // Soft efficiency penalties for overbuilt stages
  const stageToFacility: Record<BottleneckStage, FacilityType> = {
    chips: "chipFab",
    racks: "rackLine",
    pods: "podFactory",
    launch: "launchComplex",
  };

  bottlenecks.forEach((b) => {
    const fac = withEvents.facilities.find(
      (f) => f.type === stageToFacility[b.stage]
    );
    if (!fac) return;
    if (b.utilization > 1.5) {
      // Overbuilt: idle lines drag down efficiency
      fac.efficiency = Math.max(0.4, fac.efficiency * 0.85);
    }
  });

  // If cash is deeply negative, degrade efficiency slightly to signal stress
  if (withEvents.inventory.cash < 0) {
    withEvents.facilities.forEach((f) => {
      f.efficiency = Math.max(0.3, f.efficiency * 0.9);
    });
  }

  // Earn RD points from pod production (1 point per pod)
  withEvents.inventory.rdPoints = (withEvents.inventory.rdPoints ?? 0) + podsCompletedThisTick;

  return {
    nextFactory: withEvents,
    podsCompletedThisTick,
    launchSlotsCreatedThisTick,
    bottlenecks,
    activeEvents: withEvents.activeEvents,
    newEvents,
  };
}

// ---------- Bottleneck summary ----------

export function getBottlenecksSummary(
  factory: FactoryState,
  requiredThroughput: { targetPodsPerMonth: number }
): BottleneckSummary[] {
  const { targetPodsPerMonth } = requiredThroughput;

  // For now, approximate stage throughput from facility counts & recipes only.
  // Later we can refine this using a more detailed flow model.
  const stageFromFacility = (type: FacilityType, recipeId: RecipeId): number => {
    const facility =
      factory.facilities.find((f) => f.type === type) ??
      ({ type, lines: 0, desiredLines: 0, level: 1, efficiency: 1 } as FacilityState);
    const recipe = RECIPES[recipeId];
    const batchesPerMonth =
      (30 / recipe.durationDays) * facilityThroughputMultiplier(facility);
    // Stage throughput measured in "pods per month equivalent"
    // For chip/rack stages this is a rough proxy.
    return batchesPerMonth;
  };

  const chipsPerMonth = stageFromFacility("chipFab", "makeChips");
  const racksPerMonth = stageFromFacility("rackLine", "buildRacks");
  const podsPerMonth = stageFromFacility("podFactory", "integratePods");
  const launchesPerMonth = stageFromFacility("launchComplex", "prepareLaunch");

  const makeStage = (
    stage: BottleneckStage,
    actual: number
  ): BottleneckSummary => ({
    stage,
    requiredPerMonth: targetPodsPerMonth,
    actualPerMonth: actual,
    utilization:
      targetPodsPerMonth > 0 ? actual / targetPodsPerMonth : actual > 0 ? 1 : 0,
  });

  return [
    makeStage("chips", chipsPerMonth),
    makeStage("racks", racksPerMonth),
    makeStage("pods", podsPerMonth),
    makeStage("launch", launchesPerMonth),
  ];
}

// ---------- Factory initialisation ----------

export function createDefaultFactoryState(): FactoryState {
  const inventory: ResourceInventory = {
    cash: 100,
    chips: 0,
    racks: 0,
    podShells: 0,
    launchSlots: 0,
    fuel: 0,
    rdPoints: 0,
  };

  const facilities: FacilityState[] = [
    { type: "chipFab", lines: 1, desiredLines: 1, level: 1, efficiency: 1 },
    { type: "rackLine", lines: 1, desiredLines: 1, level: 1, efficiency: 1 },
    { type: "podFactory", lines: 1, desiredLines: 1, level: 1, efficiency: 1 },
    { type: "fuelDepot", lines: 1, desiredLines: 1, level: 1, efficiency: 1 },
    { type: "launchComplex", lines: 1, desiredLines: 1, level: 1, efficiency: 1 },
  ];

  const activeRecipes: ActiveRecipe[] = [
    { recipeId: "makeChips", facilityType: "chipFab", progressDays: 0 },
    { recipeId: "buildRacks", facilityType: "rackLine", progressDays: 0 },
    { recipeId: "buildPodShells", facilityType: "podFactory", progressDays: 0 },
    { recipeId: "produceFuel", facilityType: "fuelDepot", progressDays: 0 },
    { recipeId: "prepareLaunch", facilityType: "launchComplex", progressDays: 0 },
  ];

  return {
    inventory,
    facilities,
    activeRecipes,
    podsBuiltTotal: 0,
    podsReadyOnGround: 0,
    podsBuiltThisTick: 0,
    buildQueue: [],
    maxConcurrentBuilds: 3,
    infrastructurePointsUsed: facilities.reduce(
      (sum, f) => sum + f.lines * LINE_POINTS[f.type],
      0
    ),
    infrastructurePointsCap: 40,
    activeEvents: [],
  };
}


