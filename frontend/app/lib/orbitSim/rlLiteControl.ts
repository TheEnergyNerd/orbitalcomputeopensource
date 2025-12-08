/**
 * RL-LITE SYSTEM CONTROL AI
 * State: [orbital_share, cost_delta, latency_delta, carbon_delta, congestion]
 * Actions: [route % edge/core/orbit, shell_allocation %, rd_launch_vs_compute]
 * Reward: R = -(cost × w1) - (latency × w2) - (carbon × w3) + (resilience × w4)
 * 
 * This is control theory, not LLM
 */

export interface RLState {
  orbital_share: number; // 0-1
  cost_delta: number; // orbital - ground (negative is better)
  latency_delta: number; // orbital - ground (negative is better)
  carbon_delta: number; // orbital - ground (negative is better)
  congestion: number; // average congestion index across shells
}

export interface RLAction {
  route_percent_edge: number; // 0-1
  route_percent_core: number; // 0-1
  route_percent_orbit: number; // 0-1 (must sum to 1)
  shell_allocation: Record<string, number>; // shell_id -> allocation % (must sum to 1)
  rd_launch_vs_compute: number; // 0-1, 0 = all launch, 1 = all compute R&D
}

export interface RLReward {
  total_reward: number;
  cost_component: number;
  latency_component: number;
  carbon_component: number;
  resilience_component: number;
}

export interface RLWeights {
  cost_weight: number;
  latency_weight: number;
  carbon_weight: number;
  resilience_weight: number;
}

const DEFAULT_WEIGHTS: RLWeights = {
  cost_weight: 0.4,
  latency_weight: 0.3,
  carbon_weight: 0.2,
  resilience_weight: 0.1,
};

/**
 * Calculate reward for a state-action pair
 */
export function calculateReward(
  state: RLState,
  action: RLAction,
  weights: RLWeights = DEFAULT_WEIGHTS
): RLReward {
  // Cost component (negative - lower is better)
  const cost_component = -state.cost_delta * weights.cost_weight;
  
  // Latency component (negative - lower is better)
  const latency_component = -state.latency_delta * weights.latency_weight;
  
  // Carbon component (negative - lower is better)
  const carbon_component = -state.carbon_delta * weights.carbon_weight;
  
  // Resilience component (positive - higher is better)
  // Resilience = 1 - congestion (less congestion = more resilient)
  const resilience = 1 - Math.min(state.congestion, 1);
  const resilience_component = resilience * weights.resilience_weight;
  
  const total_reward = cost_component + latency_component + carbon_component + resilience_component;
  
  return {
    total_reward,
    cost_component,
    latency_component,
    carbon_component,
    resilience_component,
  };
}

/**
 * Validate action (must sum to 1 for routing percentages)
 */
export function validateAction(action: RLAction): { valid: boolean; error?: string } {
  // Check routing percentages sum to 1
  const route_sum = action.route_percent_edge + action.route_percent_core + action.route_percent_orbit;
  if (Math.abs(route_sum - 1.0) > 0.01) {
    return {
      valid: false,
      error: `Routing percentages must sum to 1.0, got ${route_sum}`,
    };
  }
  
  // Check shell allocation sums to 1
  const shell_sum = Object.values(action.shell_allocation).reduce((a, b) => a + b, 0);
  if (Math.abs(shell_sum - 1.0) > 0.01) {
    return {
      valid: false,
      error: `Shell allocation must sum to 1.0, got ${shell_sum}`,
    };
  }
  
  // Check rd_launch_vs_compute is in [0, 1]
  if (action.rd_launch_vs_compute < 0 || action.rd_launch_vs_compute > 1) {
    return {
      valid: false,
      error: `R&D allocation must be in [0, 1], got ${action.rd_launch_vs_compute}`,
    };
  }
  
  return { valid: true };
}

/**
 * Simple policy: greedy action selection based on current state
 */
export function selectGreedyAction(
  state: RLState,
  available_actions: RLAction[]
): RLAction | null {
  let best_action: RLAction | null = null;
  let best_reward = -Infinity;
  
  for (const action of available_actions) {
    const validation = validateAction(action);
    if (!validation.valid) continue;
    
    const reward = calculateReward(state, action);
    if (reward.total_reward > best_reward) {
      best_reward = reward.total_reward;
      best_action = action;
    }
  }
  
  return best_action;
}

/**
 * Create default action (balanced allocation)
 */
export function createDefaultAction(shell_ids: string[]): RLAction {
  const shell_allocation: Record<string, number> = {};
  const allocation_per_shell = 1.0 / shell_ids.length;
  
  shell_ids.forEach(shell_id => {
    shell_allocation[shell_id] = allocation_per_shell;
  });
  
  return {
    route_percent_edge: 0.3,
    route_percent_core: 0.4,
    route_percent_orbit: 0.3,
    shell_allocation,
    rd_launch_vs_compute: 0.5, // Balanced R&D
  };
}

