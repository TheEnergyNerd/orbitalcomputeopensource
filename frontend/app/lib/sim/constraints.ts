/**
 * Factory constraint validation and grid management
 */

import type { SimState, Machine, MachineId, FactoryConstraints } from "./model";

export interface ConstraintCheckResult {
  canAdd: boolean;
  reason?: string;
  errorType?: "power" | "cooling" | "workforce" | "space";
}

/**
 * Check if a machine line can be added given current constraints
 */
export function canAddMachineLine(
  state: SimState,
  machineId: MachineId,
  additionalLines: number = 1
): ConstraintCheckResult {
  const machine = state.machines[machineId];
  if (!machine) {
    return { canAdd: false, reason: "Machine not found" };
  }

  const constraints = state.constraints;
  const newLines = machine.lines + additionalLines;

  // Check workforce
  const totalWorkersNeeded = machine.workers * newLines;
  if (totalWorkersNeeded > constraints.workforceTotal) {
    return {
      canAdd: false,
      reason: "Not enough operators",
      errorType: "workforce",
    };
  }

  // Check power
  const totalPowerNeeded = machine.powerDrawMW * newLines;
  if (totalPowerNeeded > constraints.powerCapacityMW) {
    return {
      canAdd: false,
      reason: "Insufficient power",
      errorType: "power",
    };
  }

  // Check cooling
  const totalCoolingNeeded = machine.heatMW * newLines;
  if (totalCoolingNeeded > constraints.coolingCapacityMW) {
    return {
      canAdd: false,
      reason: "Insufficient cooling",
      errorType: "cooling",
    };
  }

  // Check floor space
  const footprint = machine.footprint;
  const spaceNeeded = footprint.width * footprint.height * additionalLines;
  const availableSpace = countAvailableGridCells(constraints);
  
  if (spaceNeeded > availableSpace) {
    return {
      canAdd: false,
      reason: "No floor space available",
      errorType: "space",
    };
  }

  return { canAdd: true };
}

/**
 * Count available grid cells
 */
function countAvailableGridCells(constraints: FactoryConstraints): number {
  let count = 0;
  for (let y = 0; y < constraints.gridHeight; y++) {
    for (let x = 0; x < constraints.gridWidth; x++) {
      if (!constraints.gridOccupied[y][x]) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Find a placement spot for a machine footprint
 */
export function findPlacementSpot(
  constraints: FactoryConstraints,
  footprint: { width: number; height: number }
): { x: number; y: number } | null {
  for (let y = 0; y <= constraints.gridHeight - footprint.height; y++) {
    for (let x = 0; x <= constraints.gridWidth - footprint.width; x++) {
      // Check if this area is free
      let isFree = true;
      for (let dy = 0; dy < footprint.height; dy++) {
        for (let dx = 0; dx < footprint.width; dx++) {
          if (constraints.gridOccupied[y + dy][x + dx]) {
            isFree = false;
            break;
          }
        }
        if (!isFree) break;
      }
      
      if (isFree) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Mark grid cells as occupied
 */
export function occupyGridCells(
  constraints: FactoryConstraints,
  x: number,
  y: number,
  footprint: { width: number; height: number }
): void {
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      if (y + dy < constraints.gridHeight && x + dx < constraints.gridWidth) {
        constraints.gridOccupied[y + dy][x + dx] = true;
      }
    }
  }
}

/**
 * Free grid cells
 */
export function freeGridCells(
  constraints: FactoryConstraints,
  x: number,
  y: number,
  footprint: { width: number; height: number }
): void {
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      if (y + dy < constraints.gridHeight && x + dx < constraints.gridWidth) {
        constraints.gridOccupied[y + dy][x + dx] = false;
      }
    }
  }
}

