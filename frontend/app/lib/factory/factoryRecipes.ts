/**
 * Factorio-style resource chain and recipes
 * Single source of truth for production recipes
 */

export type ResourceId = 'chips' | 'racks' | 'pods' | 'fuel' | 'orbitPods';

export type ResourceInventory = Record<ResourceId, number>;

// FactoryNodeId is defined in factoryLayout.ts - import it instead
import type { FactoryNodeId } from './factoryLayout';

export interface Recipe {
  input: Partial<ResourceInventory>;
  output: Partial<ResourceInventory>;
}

export const FACTORY_RECIPES: Record<FactoryNodeId, Recipe> = {
  chipFab: {
    input: {},
    output: { chips: 200 }, // per line per month
  },
  rackLine: {
    input: { chips: 100 },
    output: { racks: 10 },
  },
  podFactory: {
    input: { chips: 300, racks: 10 },
    output: { pods: 1 },
  },
  fuelDepot: {
    input: {},
    output: { fuel: 50 }, // tons / month
  },
  launchComplex: {
    input: { pods: 1, fuel: 10 },
    output: { orbitPods: 1 },
  },
} as const;

export type FactoryState = {
  lines: Record<FactoryNodeId, number>; // integer lines, min 0
  maxInfraPoints: number; // e.g. 40
  usedInfraPoints: number; // sum(lines)
  inventory: ResourceInventory;
  utilization: Record<FactoryNodeId, number>; // 0-1, >1 = bottleneck
  buffers: ResourceInventory; // current inventory levels
};

export type Bottleneck = {
  resource: ResourceId;
  utilization: number; // 0..>1, >1 = demand > supply
};

export function createDefaultFactoryState(): FactoryState {
  return {
    lines: {
      chipFab: 1,
      rackLine: 1,
      podFactory: 1,
      fuelDepot: 1,
      launchComplex: 1,
    },
    maxInfraPoints: 40,
    usedInfraPoints: 5, // initial 5 lines
    inventory: {
      chips: 0,
      racks: 0,
      pods: 0,
      fuel: 0,
      orbitPods: 0,
    },
    utilization: {
      chipFab: 0,
      rackLine: 0,
      podFactory: 0,
      fuelDepot: 0,
      launchComplex: 0,
    },
    buffers: {
      chips: 0,
      racks: 0,
      pods: 0,
      fuel: 0,
      orbitPods: 0,
    },
  };
}

export type FactoryNodeId = 'chipFab' | 'rackLine' | 'podFactory' | 'fuelDepot' | 'launchComplex';

/**
 * Compute production for one tick (one month)
 */
export function runFactoryTick(
  factory: FactoryState,
  monthFraction: number = 1.0
): FactoryState {
  const next: FactoryState = {
    ...factory,
    inventory: { ...factory.inventory },
    buffers: { ...factory.buffers },
    utilization: { ...factory.utilization },
  };

  // Process each factory node
  const nodeOrder: FactoryNodeId[] = ['chipFab', 'rackLine', 'podFactory', 'fuelDepot', 'launchComplex'];
  
  for (const nodeId of nodeOrder) {
    const lines = factory.lines[nodeId];
    if (lines <= 0) {
      next.utilization[nodeId] = 0;
      continue;
    }

    const recipe = FACTORY_RECIPES[nodeId];
    const potentialOutput = { ...recipe.output };
    
    // Scale by lines and month fraction
    Object.keys(potentialOutput).forEach((key) => {
      const resourceKey = key as ResourceId;
      potentialOutput[resourceKey] = (potentialOutput[resourceKey] ?? 0) * lines * monthFraction;
    });

    // Check input constraints
    let maxFeasibleOutput = Infinity;
    Object.keys(recipe.input).forEach((key) => {
      const resourceKey = key as ResourceId;
      const required = (recipe.input[resourceKey] ?? 0) * lines * monthFraction;
      const available = next.inventory[resourceKey] ?? 0;
      if (required > 0) {
        const feasibleBatches = available / required;
        // Calculate how much output we can produce with available inputs
        const outputAmount = Object.values(potentialOutput)[0] ?? 0;
        maxFeasibleOutput = Math.min(maxFeasibleOutput, feasibleBatches * outputAmount);
      }
    });

    if (maxFeasibleOutput === Infinity) {
      maxFeasibleOutput = Object.values(potentialOutput)[0] ?? 0;
    }

    // Calculate actual output (constrained by inputs)
    const actualOutput = Math.max(0, Math.min(maxFeasibleOutput, Object.values(potentialOutput)[0] ?? 0));
    const maxPossibleOutput = Object.values(potentialOutput)[0] ?? 0;
    
    // Utilization = actual / max possible
    next.utilization[nodeId] = maxPossibleOutput > 0 ? actualOutput / maxPossibleOutput : 0;

    // Consume inputs
    Object.keys(recipe.input).forEach((key) => {
      const resourceKey = key as ResourceId;
      const required = (recipe.input[resourceKey] ?? 0) * lines * monthFraction;
      const actualConsumed = Math.min(required, next.inventory[resourceKey] ?? 0);
      next.inventory[resourceKey] = (next.inventory[resourceKey] ?? 0) - actualConsumed;
    });

    // Add outputs
    Object.keys(recipe.output).forEach((key) => {
      const resourceKey = key as ResourceId;
      const produced = (recipe.output[resourceKey] ?? 0) * lines * monthFraction;
      // Only add if we have enough inputs (scale down if needed)
      const scaleFactor = maxPossibleOutput > 0 ? actualOutput / maxPossibleOutput : 0;
      const amountToAdd = produced * scaleFactor;
      
      // For discrete resources (pods, orbitPods), round to nearest integer
      if (resourceKey === 'pods' || resourceKey === 'orbitPods') {
        next.inventory[resourceKey] = (next.inventory[resourceKey] ?? 0) + Math.round(amountToAdd);
      } else {
        next.inventory[resourceKey] = (next.inventory[resourceKey] ?? 0) + amountToAdd;
      }
    });

    // Update buffers (current inventory levels)
    next.buffers = { ...next.inventory };
  }

  // Update infra points
  next.usedInfraPoints = Object.values(next.lines).reduce((sum, lines) => sum + lines, 0);

  return next;
}

/**
 * Compute bottlenecks
 */
export function computeBottlenecks(factory: FactoryState): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];
  
  // Map factory nodes to resources
  const nodeToResource: Record<FactoryNodeId, ResourceId> = {
    chipFab: 'chips',
    rackLine: 'racks',
    podFactory: 'pods',
    fuelDepot: 'fuel',
    launchComplex: 'launch',
  };

  for (const [nodeId, resource] of Object.entries(nodeToResource)) {
    const utilization = factory.utilization[nodeId as FactoryNodeId];
    if (utilization > 0.95) {
      bottlenecks.push({
        resource: resource as ResourceId,
        utilization: utilization * 100, // Convert to percentage
      });
    }
  }

  return bottlenecks;
}

