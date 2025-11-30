/**
 * Simulation engine for Factorio-style production chain
 */

import type { SimState, Machine, ResourceId, ResourceState } from './model';

/**
 * Get machine utilization (0-1, can exceed 1 if bottlenecked)
 * Now considers: inputs, outputs, power, cooling, workforce
 */
export function getMachineUtilization(
  m: Machine,
  resources: Record<ResourceId, ResourceState>,
  constraints?: FactoryConstraints
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

  // Check constraint ratios if constraints are provided
  if (constraints) {
    const totalPowerNeeded = m.powerDrawMW * m.lines;
    const powerAvailableRatio = constraints.powerCapacityMW > 0 
      ? Math.min(1, constraints.powerCapacityMW / totalPowerNeeded)
      : 0;
    maxFeasibleOutput = Math.min(maxFeasibleOutput, maxOutputPerMin * powerAvailableRatio);

    const totalCoolingNeeded = m.heatMW * m.lines;
    const coolingAvailableRatio = constraints.coolingCapacityMW > 0
      ? Math.min(1, constraints.coolingCapacityMW / totalCoolingNeeded)
      : 0;
    maxFeasibleOutput = Math.min(maxFeasibleOutput, maxOutputPerMin * coolingAvailableRatio);

    const totalWorkersNeeded = m.workers * m.lines;
    const workforceAvailableRatio = constraints.workforceTotal > 0
      ? Math.min(1, constraints.workforceTotal / totalWorkersNeeded)
      : 0;
    maxFeasibleOutput = Math.min(maxFeasibleOutput, maxOutputPerMin * workforceAvailableRatio);
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
    constraints: {
      ...state.constraints,
      gridOccupied: state.constraints.gridOccupied.map(row => [...row]), // Deep copy grid
    },
  };

  // Calculate constraint usage from machines
  let totalPowerUsed = 0;
  let totalCoolingUsed = 0;
  let totalWorkforceUsed = 0;

  Object.values(next.machines).forEach(machine => {
    totalPowerUsed += machine.powerDrawMW * machine.lines;
    totalCoolingUsed += machine.heatMW * machine.lines;
    totalWorkforceUsed += machine.workers * machine.lines;
  });

  next.constraints.powerUsedMW = totalPowerUsed;
  next.constraints.coolingUsedMW = totalCoolingUsed;
  next.constraints.workforceUsed = totalWorkforceUsed;

  // Safety checks: apply penalties if over capacity
  const powerOverCapacity = next.constraints.powerUsedMW > next.constraints.powerCapacityMW;
  const coolingOverCapacity = next.constraints.coolingUsedMW > next.constraints.coolingCapacityMW;
  const workforceOverCapacity = next.constraints.workforceUsed > next.constraints.workforceTotal;

  // Reset production/consumption rates
  for (const resourceId of Object.keys(next.resources) as ResourceId[]) {
    next.resources[resourceId] = {
      ...next.resources[resourceId],
      prodPerMin: 0,
      consPerMin: 0,
    };
  }

  // Generate source resources (infinite sources)
  for (const resourceId of Object.keys(next.resources) as ResourceId[]) {
    const resource = next.resources[resourceId];
    if (resource.isSource && resource.baseSourceRate) {
      const sourceProd = resource.baseSourceRate * scaledDt;
      resource.buffer += sourceProd;
      resource.prodPerMin += resource.baseSourceRate;
      // Clamp buffer to a reasonable maximum for visual feedback
      if (resource.buffer > 100000) {
        resource.buffer = 100000;
      }
    }
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

    // Actual output is limited by inputs and constraints
    const actualOutputPerMin = Math.min(maxFeasibleOutput, maxOutputPerMin) * effectiveUtilization;

    // Consume inputs
    for (const { resourceId, rate } of inputConsumptions) {
      const consumed = rate * utilization * scaledDt;
      const resource = next.resources[resourceId];
      if (resource) {
        const actualConsumed = Math.min(consumed, resource.buffer);
        resource.buffer = Math.max(0, resource.buffer - actualConsumed);
        resource.consPerMin += rate * utilization;
        
        // For source resources, don't let buffer go below a minimum threshold
        if (resource.isSource && resource.buffer < 1000) {
          resource.buffer = 1000;
        }
      }
    }

    // Produce outputs
    const produced = actualOutputPerMin * scaledDt;
    const outputResource = next.resources[machine.outputResource];
    if (outputResource) {
      // For discrete resources (pods, launches), round to nearest integer
      if (machine.outputResource === 'pods') {
        const podsProduced = Math.round(produced);
        outputResource.buffer += podsProduced;
      } else if (machine.outputResource === 'launches') {
        // Launches immediately become pods in orbit (no buffer accumulation)
        const launchesProduced = Math.round(produced);
        if (launchesProduced > 0) {
          next.podsInOrbit = Math.floor(next.podsInOrbit + launchesProduced);
          // Don't accumulate launches in buffer - they go directly to orbit
          // But track production rate for UI
        }
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

/**
 * Get resource throughput (max of production and consumption)
 * Used for belt animation - belts should animate based on flow, not net rate
 */
export function getResourceThroughput(
  resourceId: ResourceId,
  sim: SimState
): number {
  const r = sim.resources[resourceId];
  if (!r) return 0;
  // "Flow" is the gross movement through the chain, not the net.
  // Use max of prod and cons so belts animate even in steady-state.
  return Math.max(r.prodPerMin, r.consPerMin, 0);
}

