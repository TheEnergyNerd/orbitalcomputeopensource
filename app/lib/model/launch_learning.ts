/**
 * Launch Learning Model
 * 
 * Tracks cumulative mass to orbit and applies Wright's Law based on doublings.
 * Also enforces cadence constraints (max flights/year).
 */

export interface LaunchLearningState {
  year: number;
  cumulativeMassKg: number;
  massLaunchedThisYearKg: number;
  flightsThisYear: number;
  orbitalBacklogKg: number; // Mass waiting to be launched
}

export interface LaunchLearningParams {
  year: number;
  massDemandedKg: number; // Mass requested this year
  baselineMassKg: number; // Baseline for doublings calculation
  launchCost0PerKg: number; // Initial launch cost ($/kg)
  learningRate: number; // Learning rate per doubling (default: 0.15 = 15% reduction)
  maxFlightsPerYear: number; // Maximum flights per year (default: 1000)
  payloadPerFlightKg: number; // Payload per flight (default: 100,000 kg for Starship)
}

export interface LaunchLearningResult {
  launchCostPerKg: number;
  massLaunchedKg: number;
  flightsPerYear: number;
  orbitalBacklogKg: number;
  state: LaunchLearningState;
  debug: {
    cumulativeMassKg: number;
    doublings: number;
    launchCostPerKgRaw: number;
    launchCostPerKgCapped: number;
    flightsPerYear: number;
    payloadPerFlight: number;
    massDemandedKg: number;
    massLaunchedKg: number;
    orbitalBacklogKg: number;
  };
}

const DEFAULT_LEARNING_RATE = 0.15; // 15% reduction per doubling
const DEFAULT_MAX_FLIGHTS_PER_YEAR = 1000;
const DEFAULT_PAYLOAD_PER_FLIGHT_KG = 100_000; // Starship capacity

/**
 * Step launch learning state forward one year
 */
export function stepLaunchLearning(
  prevState: LaunchLearningState | null,
  params: LaunchLearningParams
): LaunchLearningResult {
  const {
    year,
    massDemandedKg,
    baselineMassKg,
    launchCost0PerKg,
    learningRate = DEFAULT_LEARNING_RATE,
    maxFlightsPerYear = DEFAULT_MAX_FLIGHTS_PER_YEAR,
    payloadPerFlightKg = DEFAULT_PAYLOAD_PER_FLIGHT_KG,
  } = params;
  
  // Initialize state if first year
  const prevCumulativeMass = prevState?.cumulativeMassKg || baselineMassKg;
  const prevBacklog = prevState?.orbitalBacklogKg || 0;
  
  // Total mass to launch = new demand + backlog
  const totalMassToLaunch = massDemandedKg + prevBacklog;
  
  // Cadence constraint: max mass that can be launched this year
  const maxMassPerYear = maxFlightsPerYear * payloadPerFlightKg;
  const massLaunchedKg = Math.min(totalMassToLaunch, maxMassPerYear);
  
  // Update backlog: unmet demand goes to backlog
  const orbitalBacklogKg = Math.max(0, totalMassToLaunch - massLaunchedKg);
  
  // Update cumulative mass
  const cumulativeMassKg = prevCumulativeMass + massLaunchedKg;
  
  // Calculate doublings: log2(cumulativeMassKg / baselineMassKg)
  const doublings = Math.log2(cumulativeMassKg / baselineMassKg);
  
  // Apply learning: launchCostPerKg = launchCost0 * (1 - lr) ^ doublings
  const launchCostPerKgRaw = launchCost0PerKg * Math.pow(1 - learningRate, doublings);
  
  // Cap at minimum (floor cost)
  const MIN_LAUNCH_COST_PER_KG = 10; // $10/kg floor
  const launchCostPerKg = Math.max(MIN_LAUNCH_COST_PER_KG, launchCostPerKgRaw);
  
  // Calculate flights needed
  const flightsPerYear = Math.ceil(massLaunchedKg / payloadPerFlightKg);
  
  const state: LaunchLearningState = {
    year,
    cumulativeMassKg,
    massLaunchedThisYearKg: massLaunchedKg,
    flightsThisYear: flightsPerYear,
    orbitalBacklogKg,
  };
  
  return {
    launchCostPerKg,
    massLaunchedKg,
    flightsPerYear,
    orbitalBacklogKg,
    state,
    debug: {
      cumulativeMassKg,
      doublings,
      launchCostPerKgRaw,
      launchCostPerKgCapped: launchCostPerKg,
      flightsPerYear,
      payloadPerFlight: payloadPerFlightKg,
      massDemandedKg,
      massLaunchedKg,
      orbitalBacklogKg,
    },
  };
}

/**
 * Generate launch learning trajectory
 */
export function generateLaunchLearningTrajectory(
  startYear: number,
  endYear: number,
  massDemandedByYear: (year: number) => number,
  params: Omit<LaunchLearningParams, 'year' | 'massDemandedKg'>
): LaunchLearningResult[] {
  const trajectory: LaunchLearningResult[] = [];
  let currentState: LaunchLearningState | null = null;
  
  for (let year = startYear; year <= endYear; year++) {
    const massDemanded = massDemandedByYear(year);
    const result = stepLaunchLearning(currentState, {
      ...params,
      year,
      massDemandedKg: massDemanded,
    });
    trajectory.push(result);
    currentState = result.state;
  }
  
  return trajectory;
}


