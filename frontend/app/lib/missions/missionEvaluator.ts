import type { MissionDefinition, MissionProgress, MissionObjective, MissionConstraint } from "../../game/missionTypes";
import { useSimStore } from "../../store/simStore";
import { useSandboxStore } from "../../store/sandboxStore";
import { useOrbitalUnitsStore } from "../../store/orbitalUnitsStore";
import { calculateMetrics } from "../metrics/calculateMetrics";

// Note: These functions are NOT React hooks - they use .getState() to access store state
// This allows them to be called from anywhere without violating Rules of Hooks

/**
 * Resolve a metric value from the current simulation state
 */
function resolveMetric(metricKey: string, region?: string): number {
  const state = useSimStore.getState().state;
  const sandboxState = useSandboxStore.getState();
  const orbitalUnitsStore = useOrbitalUnitsStore.getState();
  
  if (!state) return 0;
  
  const deployedUnits = orbitalUnitsStore.getDeployedUnits();
  const deployedOrbitalCapacity = deployedUnits.reduce((sum, unit) => sum + unit.powerOutputMw, 0);
  const BASE_GROUND_CAPACITY_GW = 42;
  const baseGroundCapacity = BASE_GROUND_CAPACITY_GW * 1000;
  const remainingGroundCapacity = baseGroundCapacity * (1 - sandboxState.groundDCReduction / 100);
  const totalCapacity = deployedOrbitalCapacity + remainingGroundCapacity;
  const orbitShare = totalCapacity > 0 ? deployedOrbitalCapacity / totalCapacity : 0;
  
  // Calculate orbital density
  const orbitalDensity = deployedUnits.length * 50; // Each pod = 50 satellites
  
  // Calculate metrics using the comprehensive calculator
  const metrics = calculateMetrics({
    deployedOrbitalCapacity,
    remainingGroundCapacity,
    baseGroundCapacity,
    isSurgeActive: false, // TODO: get from scenario
    podTier: sandboxState.selectedPodTier,
    orbitMode: sandboxState.orbitMode,
    offloadPct: sandboxState.offloadPct,
    densityMode: sandboxState.densityMode,
    cumulativeDeployedUnits: deployedUnits.length,
    orbitalDensity,
  });
  
  // Parse metric key and return appropriate value
  const parts = metricKey.split(".");
  
  if (parts[0] === "latency") {
    if (parts[1] === "avgMs" || parts[1] === "regional" && parts[2] === "avgMs") {
      return metrics.latency;
    }
  }
  
  if (parts[0] === "coverage") {
    if (parts[1] === "underservedPct") {
      // Coverage based on number of deployed LEO pods (each pod = ~50 satellites)
      // Each pod provides ~2% coverage, scaling with orbit mode
      const leoPods = deployedUnits.filter(u => u.type === "leo_pod").length;
      const geoHubs = deployedUnits.filter(u => u.type === "geo_hub").length;
      const serverFarms = deployedUnits.filter(u => u.type === "server_farm").length;
      
      // LEO pods: ~2% coverage per pod (50 sats each)
      // GEO hubs: ~10% coverage per hub (global coverage)
      // Server farms: ~1.5% coverage per farm
      const leoCoverage = leoPods * 2;
      const geoCoverage = geoHubs * 10;
      const serverFarmCoverage = serverFarms * 1.5;
      
      // GEO has 3x coverage multiplier
      const totalCoverage = leoCoverage + (geoCoverage * 3) + serverFarmCoverage;
      return Math.min(100, totalCoverage);
    }
    if (parts[1] === "lowIncomeRegionsPct") {
      // Similar calculation but slightly lower for low-income regions
      const leoPods = deployedUnits.filter(u => u.type === "leo_pod").length;
      const geoHubs = deployedUnits.filter(u => u.type === "geo_hub").length;
      const serverFarms = deployedUnits.filter(u => u.type === "server_farm").length;
      
      const leoCoverage = leoPods * 1.6; // 80% of normal
      const geoCoverage = geoHubs * 8; // 80% of normal
      const serverFarmCoverage = serverFarms * 1.2; // 80% of normal
      
      const totalCoverage = leoCoverage + (geoCoverage * 3) + serverFarmCoverage;
      return Math.min(100, totalCoverage);
    }
  }
  
  if (parts[0] === "ground") {
    if (parts[1] === "overloadPct") {
      // Simplified: overload decreases with orbit share
      return Math.max(0, 100 - orbitShare * 100);
    }
  }
  
  if (parts[0] === "availability") {
    if (parts[1] === "pct") {
      // Availability improves with orbit share
      return 95 + orbitShare * 5;
    }
  }
  
  if (parts[0] === "coolingCost") {
    if (parts[1] === "reductionPct") {
      const baselineCooling = 400; // $M/year baseline
      const reduction = ((baselineCooling - metrics.coolingCost) / baselineCooling) * 100;
      return Math.max(0, reduction);
    }
  }
  
  if (parts[0] === "latency") {
    if (parts[1] === "changePct") {
      const baselineLatency = 45;
      const change = Math.abs((metrics.latency - baselineLatency) / baselineLatency) * 100;
      return change;
    }
  }
  
  if (parts[0] === "resilienceScore") {
    return metrics.resilienceScore;
  }
  
  if (parts[0] === "energyCost") {
    if (parts[1] === "perUnitReductionPct") {
      const baselineEnergy = 1000; // $M/year baseline
      const reduction = ((baselineEnergy - metrics.energyCost) / baselineEnergy) * 100;
      return Math.max(0, reduction);
    }
  }
  
  if (parts[0] === "carbon") {
    if (parts[1] === "reductionPct") {
      const baselineCarbon = 500; // metric tons/year baseline
      const reduction = ((baselineCarbon - metrics.carbon) / baselineCarbon) * 100;
      return Math.max(0, reduction);
    }
  }
  
  if (parts[0] === "populationServed") {
    if (parts[1] === "billions") {
      // Simplified: ~0.2M people per 50-sat pod
      const satCount = deployedUnits.filter(u => u.type === "leo_pod").length * 50;
      return (satCount * 0.2) / 1000; // Convert to billions
    }
  }
  
  if (parts[0] === "launchTime") {
    if (parts[1] === "months") {
      // Get average build time from deployed units
      const avgBuildTime = deployedUnits.length > 0
        ? deployedUnits.reduce((sum, u) => sum + (u.buildTimeDays || 180), 0) / deployedUnits.length
        : 180;
      return avgBuildTime / 30; // Convert days to months
    }
  }
  
  if (parts[0] === "launchCost") {
    if (parts[1] === "reductionPct") {
      // Calculate cost reduction from scaling economies
      const baseCost = 50; // $50M base
      const latestCost = deployedUnits.length > 0
        ? deployedUnits[deployedUnits.length - 1].cost || baseCost
        : baseCost;
      const reduction = ((baseCost - latestCost) / baseCost) * 100;
      return Math.max(0, reduction);
    }
  }
  
  if (parts[0] === "unitsDeployed") {
    if (parts[1] === "count") {
      return deployedUnits.length;
    }
  }
  
  return 0;
}

/**
 * Evaluate a single objective
 */
function evaluateObjective(objective: MissionObjective): { current: number; target: number; met: boolean } {
  const current = resolveMetric(objective.metric, objective.region);
  const target = objective.target;
  
  let met = false;
  switch (objective.comparator) {
    case "<=":
      met = current <= target;
      break;
    case ">=":
      met = current >= target;
      break;
    case "<":
      met = current < target;
      break;
    case ">":
      met = current > target;
      break;
    case "==":
      met = Math.abs(current - target) < 0.01;
      break;
  }
  
  return { current, target, met };
}

/**
 * Evaluate a single constraint
 */
function evaluateConstraint(constraint: MissionConstraint): { current: number | boolean; limit: number | boolean; violated: boolean } {
  const sandboxState = useSandboxStore.getState();
  const orbitalUnitsStore = useOrbitalUnitsStore.getState();
  const deployedUnits = orbitalUnitsStore.getDeployedUnits();
  
  let current: number | boolean = 0;
  let limit: number | boolean = constraint.value;
  let violated = false;
  
  switch (constraint.type) {
    case "MAX_UNITS":
      current = deployedUnits.length;
      violated = current > (limit as number);
      break;
    case "BUDGET":
      const totalCost = deployedUnits.reduce((sum, u) => sum + (u.cost || 0), 0);
      current = totalCost;
      violated = current > (limit as number);
      break;
    case "NO_NEW_GROUND":
      current = sandboxState.groundDCReduction === 0;
      violated = !current; // Violated if ground reduction changed
      break;
    case "RESILIENCE_MODE":
      // Simplified: check if density mode is Safe
      current = sandboxState.densityMode === "Safe";
      violated = !current;
      break;
    case "ENERGY_MULTIPLIER":
      // This is applied in metrics calculation, just track it
      current = limit as number;
      violated = false; // Not a violation, just a modifier
      break;
    case "DEBRIS_RISK_THRESHOLD":
      // Simplified: debris risk increases with aggressive density mode
      current = sandboxState.densityMode === "Aggressive" ? 0.2 : 0.05;
      violated = current > (limit as number);
      break;
    case "MAX_GROUND_PCT":
      current = sandboxState.groundDCReduction;
      violated = (100 - current) > (limit as number);
      break;
  }
  
  return { current, limit, violated };
}

/**
 * Evaluate mission progress
 */
export function evaluateMission(mission: MissionDefinition): MissionProgress {
  const objectives: MissionProgress["objectives"] = {};
  const constraints: MissionProgress["constraints"] = {};
  
  // Evaluate all objectives
  mission.objectives.forEach((objective) => {
    const result = evaluateObjective(objective);
    objectives[objective.metric] = {
      current: result.current,
      target: result.target,
      comparator: objective.comparator,
      met: result.met,
    };
  });
  
  // Evaluate all constraints
  mission.constraints.forEach((constraint) => {
    const result = evaluateConstraint(constraint);
    constraints[constraint.type] = {
      current: result.current,
      limit: result.limit,
      violated: result.violated,
    };
  });
  
  // Check if mission is complete
  const allObjectivesMet = Object.values(objectives).every((obj) => obj.met);
  const noConstraintsViolated = Object.values(constraints).every((constraint) => !constraint.violated);
  const isComplete = allObjectivesMet && noConstraintsViolated;
  
  // Check for failures
  let hasFailed = false;
  let failureReason: string | undefined;
  
  if (!noConstraintsViolated) {
    hasFailed = true;
    const violatedConstraint = Object.entries(constraints).find(([_, c]) => c.violated);
    if (violatedConstraint) {
      failureReason = `Constraint violated: ${violatedConstraint[0]}`;
    }
  }
  
  return {
    missionId: mission.id,
    objectives,
    constraints,
    isComplete,
    hasFailed,
    failureReason,
  };
}

