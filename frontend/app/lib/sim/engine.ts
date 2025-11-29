/**
 * Simulation engine for Factorio-style production chain
 */

import type { SimState, Machine, ResourceId, ResourceState } from './model';

/**
 * Get machine utilization (0-1, can exceed 1 if bottlenecked)
 */
export function getMachineUtilization(
  m: Machine,
  resources: Record<ResourceId, ResourceState>
): number {
  if (m.lines === 0) return 0;

  // Calculate effective output rate considering upgrades
  const speedMultiplier = 1 + (m.upgrades.speedLevel * 0.2); // 20% per level
  const effectiveOutputPerLine = m.baseOutputPerLine * speedMultiplier;
  const maxOutputPerMin = effectiveOutputPerLine * m.lines;

  // Check input constraints
  let maxFeasibleOutput = Infinity;
  
  for (const [resourceId, consumptionPerLine] of Object.entries(m.inputRates)) {
    const resource = resources[resourceId as ResourceId];
    if (!resource) continue;
    
    const efficiencyMultiplier = 1 - (m.upgrades.efficiencyLevel * 0.1); // 10% reduction per level
    const effectiveConsumption = (consumptionPerLine ?? 0) * efficiencyMultiplier;
    const totalConsumptionPerMin = effectiveConsumption * m.lines;
    
    if (totalConsumptionPerMin > 0) {
      // How long can we run with current buffer?
      const available = resource.buffer;
      const runTimeMinutes = available / totalConsumptionPerMin;
      const feasibleOutput = runTimeMinutes * maxOutputPerMin;
      maxFeasibleOutput = Math.min(maxFeasibleOutput, feasibleOutput);
    }
  }

  if (maxFeasibleOutput === Infinity) {
    maxFeasibleOutput = maxOutputPerMin;
  }

  // Utilization = actual output / max possible output
  const actualOutput = Math.min(maxFeasibleOutput, maxOutputPerMin);
  return maxOutputPerMin > 0 ? actualOutput / maxOutputPerMin : 0;
}

/**
 * Step the simulation forward by dtMinutes
 */
export function stepSim(state: SimState, dtMinutes: number): SimState {
  const scaledDt = dtMinutes * state.timeScale;
  const next: SimState = {
    ...state,
    resources: { ...state.resources },
    machines: { ...state.machines },
  };

  // Reset production/consumption rates
  for (const resourceId of Object.keys(next.resources) as ResourceId[]) {
    next.resources[resourceId] = {
      ...next.resources[resourceId],
      prodPerMin: 0,
      consPerMin: 0,
    };
  }

  // Process each machine
  for (const machineId of Object.keys(next.machines) as Array<keyof typeof next.machines>) {
    const machine = next.machines[machineId];
    if (machine.lines === 0) continue;

    // Calculate effective rates with upgrades
    const speedMultiplier = 1 + (machine.upgrades.speedLevel * 0.2);
    const efficiencyMultiplier = 1 - (machine.upgrades.efficiencyLevel * 0.1);
    const effectiveOutputPerLine = machine.baseOutputPerLine * speedMultiplier;
    const maxOutputPerMin = effectiveOutputPerLine * machine.lines;

    // Check input constraints
    let maxFeasibleOutput = Infinity;
    const inputConsumptions: Array<{ resourceId: ResourceId; rate: number }> = [];

    for (const [resourceId, consumptionPerLine] of Object.entries(machine.inputRates)) {
      const resource = next.resources[resourceId as ResourceId];
      if (!resource || !consumptionPerLine) continue;

      const effectiveConsumption = consumptionPerLine * efficiencyMultiplier;
      const totalConsumptionPerMin = effectiveConsumption * machine.lines;
      inputConsumptions.push({ resourceId: resourceId as ResourceId, rate: totalConsumptionPerMin });

      if (totalConsumptionPerMin > 0) {
        // Calculate feasible output based on available inputs
        const available = resource.buffer;
        const runTimeMinutes = available / totalConsumptionPerMin;
        const feasibleOutput = runTimeMinutes * maxOutputPerMin;
        maxFeasibleOutput = Math.min(maxFeasibleOutput, feasibleOutput);
      }
    }

    if (maxFeasibleOutput === Infinity) {
      maxFeasibleOutput = maxOutputPerMin;
    }

    // Actual output is limited by inputs
    const actualOutputPerMin = Math.min(maxFeasibleOutput, maxOutputPerMin);
    const utilization = maxOutputPerMin > 0 ? actualOutputPerMin / maxOutputPerMin : 0;

    // Consume inputs
    for (const { resourceId, rate } of inputConsumptions) {
      const consumed = rate * utilization * scaledDt;
      const resource = next.resources[resourceId];
      if (resource) {
        const actualConsumed = Math.min(consumed, resource.buffer);
        resource.buffer = Math.max(0, resource.buffer - actualConsumed);
        resource.consPerMin += rate * utilization;
      }
    }

    // Produce outputs
    const produced = actualOutputPerMin * scaledDt;
    const outputResource = next.resources[machine.outputResource];
    if (outputResource) {
      // For discrete resources (pods, launches), round to nearest integer
      if (machine.outputResource === 'pods' || machine.outputResource === 'launches') {
        outputResource.buffer += Math.round(produced);
      } else {
        outputResource.buffer += produced;
      }
      outputResource.prodPerMin += actualOutputPerMin;
    }
  }

  // Ensure buffers don't go negative (safety check)
  for (const resourceId of Object.keys(next.resources) as ResourceId[]) {
    if (next.resources[resourceId].buffer < 0) {
      next.resources[resourceId].buffer = 0;
    }
  }

  return next;
}

