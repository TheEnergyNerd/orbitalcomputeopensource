/**
 * Factory Model - Clean factory state and operations
 * Replaces the old factory engine with a simpler model
 */

// Legacy compatibility types for factoryStore.ts
export type StageId = "silicon" | "chips" | "racks" | "pods" | "launch";

export interface StageUpgrades {
  capacityPoints: number;
  efficiencyPoints: number;
  reliabilityPoints: number;
}

export interface StageState {
  id: StageId;
  baseCapacity: number;
  upgrades: StageUpgrades;
  capacity: number;
  efficiency: number;
  reliability: number;
  utilization: number;
  throughput?: number; // Optional for compatibility
}

export interface SupplyEvent {
  id: string;
  stageId: StageId;
  type: string;
  severity: number;
  spawnTime: number;
  duration: number;
  resolved: boolean;
}

export interface FactoryGameState {
  stages: Record<StageId, StageState>;
  allocationTotal: number;
  allocationSpent: number;
  events: SupplyEvent[];
  simTime: number;
}

// New simplified types
export type FactoryStageId = "silicon" | "chips" | "racks" | "pods" | "launch";

export interface FactoryStageState {
  id: FactoryStageId;
  name: string;          // "Silicon", "Chips", etc
  throughputPerYear: number; // units / year at current upgrades
  baseThroughputPerYear: number;
  upgradeLevel: number;      // 0–3
  maxUpgradeLevel: number;   // 3 for now
  efficiencyBonus: number;   // 0–1 multiplicative on cost
  greenBonus: number;        // 0–1 multiplicative on carbon
}

export interface FactoryState {
  stages: FactoryStageState[];
  overclockPct: number;      // affects cost + failure risk
  efficiencyFocusPct: number;
  greenFocusPct: number;
  // Crisis system state
  lastCrisisYear: number | null;
  crisisActive: boolean;
  userDwellStart: number | null;
  currentCrisis: FactoryCrisis | null;
}

export interface FactoryCrisis {
  type: string;
  building: FactoryStageId;
  severity: number;  // 0.1 to 0.3
  effect: {
    throughputPenalty: number;  // 0.2 to 0.5
  };
}

export const createDefaultFactoryState = (): FactoryState => ({
  overclockPct: 0,
  efficiencyFocusPct: 0,
  greenFocusPct: 0,
  lastCrisisYear: null,
  crisisActive: false,
  userDwellStart: null,
  currentCrisis: null,
  stages: [
    { id: "silicon", name: "Silicon", baseThroughputPerYear: 500, throughputPerYear: 500, upgradeLevel: 0, maxUpgradeLevel: 3, efficiencyBonus: 0, greenBonus: 0 },
    { id: "chips",   name: "Chips",   baseThroughputPerYear: 450, throughputPerYear: 450, upgradeLevel: 0, maxUpgradeLevel: 3, efficiencyBonus: 0, greenBonus: 0 },
    { id: "racks",   name: "Racks",   baseThroughputPerYear: 400, throughputPerYear: 400, upgradeLevel: 0, maxUpgradeLevel: 3, efficiencyBonus: 0, greenBonus: 0 },
    { id: "pods",    name: "Pods",    baseThroughputPerYear: 300, throughputPerYear: 300, upgradeLevel: 0, maxUpgradeLevel: 3, efficiencyBonus: 0, greenBonus: 0 },
    { id: "launch",  name: "Launch",  baseThroughputPerYear: 200, throughputPerYear: 200, upgradeLevel: 0, maxUpgradeLevel: 3, efficiencyBonus: 0, greenBonus: 0 },
  ],
});

// Helper: bottleneck throughput
export const getFactoryEffectiveThroughput = (factory: FactoryState): number => {
  return Math.min(...factory.stages.map(s => s.throughputPerYear));
};

// Upgrade logic
export const applyStageUpgrade = (factory: FactoryState, id: FactoryStageId): FactoryState => {
  return {
    ...factory,
    stages: factory.stages.map(stage => {
      if (stage.id !== id || stage.upgradeLevel >= stage.maxUpgradeLevel) return stage;

      const level = stage.upgradeLevel + 1;

      // Simple rule of thumb:
      // each level → +15% throughput, -5% cost, -5% carbon
      const throughputPerYear = stage.baseThroughputPerYear * (1 + 0.15 * level);
      const efficiencyBonus = 0.05 * level;
      const greenBonus = 0.05 * level;

      return { ...stage, upgradeLevel: level, throughputPerYear, efficiencyBonus, greenBonus };
    }),
  };
};

// Legacy compatibility functions for factoryStore.ts
export function computePipeline(
  stages: Record<StageId, StageState>,
  events: SupplyEvent[]
): Record<StageId, StageState> {
  // Calculate effective throughput for each stage
  const result: Record<StageId, StageState> = {} as Record<StageId, StageState>;
  
  for (const [id, stage] of Object.entries(stages)) {
    // Apply upgrade multipliers
    const capacityMultiplier = 1 + stage.upgrades.capacityPoints * 0.1;
    const efficiencyMultiplier = 0.7 + stage.upgrades.efficiencyPoints * 0.05;
    const reliabilityMultiplier = 0.8 + stage.upgrades.reliabilityPoints * 0.05;
    
    // Calculate effective capacity
    const effectiveCapacity = stage.baseCapacity * capacityMultiplier;
    const effectiveEfficiency = Math.min(1.0, efficiencyMultiplier);
    const effectiveReliability = Math.min(1.0, reliabilityMultiplier);
    
    // Throughput is limited by the bottleneck (minimum of all stages)
    const throughput = effectiveCapacity * effectiveEfficiency * effectiveReliability;
    
    result[id as StageId] = {
      ...stage,
      capacity: effectiveCapacity,
      efficiency: effectiveEfficiency,
      reliability: effectiveReliability,
      throughput,
    };
  }
  
  return result;
}

export function getBottleneckStage(
  stages: Record<StageId, StageState>
): StageId | null {
  let minCapacity = Infinity;
  let bottleneck: StageId | null = null;

  for (const [id, stage] of Object.entries(stages)) {
    const effectiveCapacity = stage.capacity * stage.efficiency * stage.reliability;
    if (effectiveCapacity < minCapacity) {
      minCapacity = effectiveCapacity;
      bottleneck = id as StageId;
    }
  }

  return bottleneck;
}

export function getStageAllocationCost(upgrades: StageUpgrades): number {
  // Simple cost calculation
  return upgrades.capacityPoints * 2 + 
         upgrades.efficiencyPoints * 3 + 
         upgrades.reliabilityPoints * 3;
}

export function getAllocationCost(
  stageId: StageId,
  field: keyof StageUpgrades,
  currentPoints: number
): number {
  // Cost increases with level
  const baseCosts: Record<keyof StageUpgrades, number> = {
    capacityPoints: 2,
    efficiencyPoints: 3,
    reliabilityPoints: 3,
  };
  return baseCosts[field] * (currentPoints + 1);
}

// Stage definitions for UI
export type ItemSpriteKind = "ingot" | "die" | "rack" | "pod" | "rocket";

export interface StageDef {
  id: StageId;
  name: string;
  label: string; // Short label for UI
  color: string;
  icon: string;
  itemSprite: ItemSpriteKind; // Required sprite for conveyor items
}

const STAGE_DEFS: Record<StageId, StageDef> = {
  silicon: { id: "silicon", name: "Silicon", label: "Silicon", color: "#00d4aa", icon: "🧠", itemSprite: "ingot" },
  chips: { id: "chips", name: "Chips", label: "Chips", color: "#3b82f6", icon: "💾", itemSprite: "die" },
  racks: { id: "racks", name: "Racks", label: "Racks", color: "#8b5cf6", icon: "📦", itemSprite: "rack" },
  pods: { id: "pods", name: "Pods", label: "Pods", color: "#f59e0b", icon: "🔧", itemSprite: "pod" },
  launch: { id: "launch", name: "Launch", label: "Launch", color: "#ef4444", icon: "🚀", itemSprite: "rocket" },
};

export function getStageDef(id: StageId): StageDef | null {
  return STAGE_DEFS[id] || null;
}

export function getStageLabel(id: StageId): string {
  return STAGE_DEFS[id]?.label || id;
}
