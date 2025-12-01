/**
 * Simulation engine for Factorio-style production chain
 */

import type { SimState, Machine, ResourceId, ResourceState, FactoryConstraints } from './model';
import { DEFAULT_ORBITAL_POD_SPEC } from './orbitConfig';

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
    totalPowerUsed += (machine.powerDrawMW || 0) * machine.lines;
    totalCoolingUsed += (machine.heatMW || 0) * machine.lines;
    totalWorkforceUsed += (machine.workers || 0) * machine.lines;
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

    // Get machine utilization considering constraints
    let utilization = getMachineUtilization(machine, next.resources, next.constraints);
    
    // Apply constraint penalties if over capacity
    // Force utilization reduction if constraints are exceeded
    const powerRatio = next.constraints.powerCapacityMW > 0 
      ? Math.min(1, next.constraints.powerCapacityMW / Math.max(1, totalPowerUsed))
      : 1;
    const coolingRatio = next.constraints.coolingCapacityMW > 0
      ? Math.min(1, next.constraints.coolingCapacityMW / Math.max(1, totalCoolingUsed))
      : 1;
    const workforceRatio = next.constraints.workforceTotal > 0
      ? Math.min(1, next.constraints.workforceTotal / Math.max(1, totalWorkforceUsed))
      : 1;
    
    // Apply the most restrictive constraint
    const constraintMultiplier = Math.min(powerRatio, coolingRatio, workforceRatio);
    utilization = utilization * constraintMultiplier;
    
    // If inputs are missing, mark as starved (utilization < 0.1)
    const hasInputs = Object.keys(machine.inputRates).length === 0 || 
      Object.entries(machine.inputRates).some(([resourceId]) => {
        const resource = next.resources[resourceId as ResourceId];
        return resource && resource.buffer > 0;
      });
    if (!hasInputs && machine.lines > 0) {
      utilization = Math.min(utilization, 0.05); // Starved machines run at 5% max
    }

    // Actual output is limited by inputs and constraints
    const actualOutputPerMin = Math.min(maxFeasibleOutput, maxOutputPerMin) * utilization;

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
        // Track production rate for UI (always, even if no whole launches yet)
        outputResource.prodPerMin += actualOutputPerMin;
        
        // Only add whole launches to orbit (round down to avoid premature launches)
        const wholeLaunches = Math.floor(produced);
        if (wholeLaunches > 0) {
          next.podsInOrbit = Math.floor(next.podsInOrbit + wholeLaunches);
        }
      } else {
        outputResource.buffer += produced;
        outputResource.prodPerMin += actualOutputPerMin;
      }
    }
  }

  // Ensure buffers don't go negative (safety check)
  for (const resourceId of Object.keys(next.resources) as ResourceId[]) {
    if (next.resources[resourceId].buffer < 0) {
      next.resources[resourceId].buffer = 0;
    }
  }

  // Apply pod degradation (3% per year)
  // dtMinutes is in minutes, so 1 year = 365 * 24 * 60 = 525600 minutes
  const degradationPerYear = 0.03;
  const yearsElapsed = scaledDt / (365 * 24 * 60);
  if (yearsElapsed > 0 && next.podsInOrbit > 0) {
    // Degrade by 3% per year
    const degradationFactor = Math.pow(1 - degradationPerYear, yearsElapsed);
    next.podDegradationFactor = Math.max(0.1, next.podDegradationFactor * degradationFactor);
  }

  // Apply generational upgrades to orbital pod spec
  // Each generation increases compute per pod, reduces mass/cost
  if (next.generation > 0) {
    const genMultiplier = Math.pow(1.5, next.generation); // 1.5x per generation
    const costReduction = Math.pow(0.8, next.generation); // 20% cost reduction per generation
    const massReduction = Math.pow(0.85, next.generation); // 15% mass reduction per generation
    
    // Update orbital pod spec with generational improvements
    next.orbitalPodSpec = {
      ...next.orbitalPodSpec,
      computeKw: DEFAULT_ORBITAL_POD_SPEC.computeKw * genMultiplier,
      capexPerPod: DEFAULT_ORBITAL_POD_SPEC.capexPerPod * costReduction,
      // Mass reduction affects launch costs indirectly (handled in economics)
    };
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

