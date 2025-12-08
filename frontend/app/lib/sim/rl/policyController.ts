/**
 * Policy-Based RL-Lite Controller
 * Model-predictive control for routing and deployment decisions
 */

export interface StateVector {
  orbitalShare: number; // 0-1
  costDelta: number; // orbit - ground cost
  latencyDelta: number; // orbit - ground latency
  carbonDelta: number; // orbit - ground carbon
  congestionIndex: number; // 0-1
}

export interface Action {
  routeSplit: {
    edge: number; // 0-1
    ground: number; // 0-1
    orbit: number; // 0-1
  };
  launchAllocation: Record<string, number>; // per shell
  rndAllocation: {
    pods: number; // 0-1
    launchCadence: number; // 0-1
  };
}

export interface RewardWeights {
  w1: number; // cost weight
  w2: number; // latency weight
  w3: number; // resilience weight
  w4: number; // carbon weight
}

/**
 * Calculate reward for a state-action pair
 * R = -w1 * cost - w2 * latency + w3 * resilience - w4 * carbon
 */
export function calculateReward(
  state: StateVector,
  action: Action,
  weights: RewardWeights
): number {
  const { w1, w2, w3, w4 } = weights;

  // Cost component (negative, lower is better)
  const costComponent = -w1 * Math.abs(state.costDelta);

  // Latency component (negative, lower is better)
  const latencyComponent = -w2 * Math.abs(state.latencyDelta);

  // Resilience component (positive, higher orbital share = more resilient)
  const resilienceComponent = w3 * state.orbitalShare;

  // Carbon component (negative, lower is better)
  const carbonComponent = -w4 * Math.abs(state.carbonDelta);

  return costComponent + latencyComponent + resilienceComponent + carbonComponent;
}

/**
 * Tabular policy gradient update
 * Simple REINFORCE-style policy gradient
 */
export function updatePolicy(
  currentPolicy: (state: StateVector) => Action,
  state: StateVector,
  reward: number,
  baselineReward: number,
  learningRate: number = 0.1
): (state: StateVector) => Action {
  // Simplified: adjust action probabilities based on advantage
  const advantage = reward - baselineReward;

  return (s: StateVector) => {
    const action = currentPolicy(s);

    // Adjust route split based on advantage
    if (advantage > 0) {
      // Good action: increase orbit routing if cost/latency favor it
      if (s.costDelta < 0 && s.latencyDelta < 0) {
        action.routeSplit.orbit = Math.min(1, action.routeSplit.orbit + learningRate * advantage);
        const total = action.routeSplit.edge + action.routeSplit.ground + action.routeSplit.orbit;
        // Renormalize
        action.routeSplit.edge /= total;
        action.routeSplit.ground /= total;
        action.routeSplit.orbit /= total;
      }
    } else {
      // Bad action: reduce orbit routing
      action.routeSplit.orbit = Math.max(0, action.routeSplit.orbit - learningRate * Math.abs(advantage));
      const total = action.routeSplit.edge + action.routeSplit.ground + action.routeSplit.orbit;
      // Renormalize
      action.routeSplit.edge /= total;
      action.routeSplit.ground /= total;
      action.routeSplit.orbit /= total;
    }

    return action;
  };
}

/**
 * Default policy: simple heuristic based on state
 */
export function defaultPolicy(state: StateVector): Action {
  // Route split: favor orbit if cost and latency are better
  let orbitShare = 0.3; // Default
  if (state.costDelta < 0 && state.latencyDelta < 0) {
    orbitShare = 0.7; // Favor orbit
  } else if (state.costDelta > 0 || state.latencyDelta > 0) {
    orbitShare = 0.1; // Favor ground
  }

  // Adjust for congestion
  if (state.congestionIndex > 0.75) {
    orbitShare *= 0.5; // Reduce orbit routing when congested
  }

  const edgeShare = (1 - orbitShare) * 0.6;
  const groundShare = (1 - orbitShare) * 0.4;

  return {
    routeSplit: {
      edge: edgeShare,
      ground: groundShare,
      orbit: orbitShare,
    },
    launchAllocation: {
      LEO1_EQ: 0.4,
      LEO2_MID: 0.4,
      LEO3_POL: 0.2,
    },
    rndAllocation: {
      pods: 0.5,
      launchCadence: 0.5,
    },
  };
}

/**
 * Model-predictive control: look ahead N steps and choose best action
 */
export function modelPredictiveControl(
  initialState: StateVector,
  horizon: number,
  weights: RewardWeights,
  transitionFn: (state: StateVector, action: Action) => StateVector
): Action {
  // Simple: evaluate all possible actions and choose best
  const actions: Action[] = [
    defaultPolicy(initialState),
    { ...defaultPolicy(initialState), routeSplit: { edge: 0.2, ground: 0.3, orbit: 0.5 } },
    { ...defaultPolicy(initialState), routeSplit: { edge: 0.5, ground: 0.3, orbit: 0.2 } },
  ];

  let bestAction = actions[0];
  let bestReward = -Infinity;

  for (const action of actions) {
    let state = initialState;
    let totalReward = 0;

    // Simulate forward
    for (let t = 0; t < horizon; t++) {
      const reward = calculateReward(state, action, weights);
      totalReward += reward;
      state = transitionFn(state, action);
    }

    if (totalReward > bestReward) {
      bestReward = totalReward;
      bestAction = action;
    }
  }

  return bestAction;
}

