/**
 * Routing Recompute Triggers
 * Only recompute when thresholds are crossed
 */

export interface RoutingState {
  cost: number;
  latency: number;
  congestion: number;
  shells: string[];
  lastRecomputeTime: number;
}

export interface RecomputeTrigger {
  triggered: boolean;
  reason: string;
  delta?: {
    cost?: number;
    latency?: number;
    congestion?: number;
  };
}

const COST_THRESHOLD = 0.03; // 3%
const LATENCY_THRESHOLD_MS = 8; // 8 ms
const CONGESTION_THRESHOLD = 0.12; // 0.12

/**
 * Check if routing should recompute based on state changes
 */
export function shouldRecomputeRouting(
  previousState: RoutingState,
  currentState: RoutingState,
  newShellAdded: boolean = false,
  endOfYear: boolean = false
): RecomputeTrigger {
  // Always recompute if new shell added or end of year
  if (newShellAdded) {
    return {
      triggered: true,
      reason: "New shell added",
    };
  }
  
  if (endOfYear) {
    return {
      triggered: true,
      reason: "End of year deployment",
    };
  }
  
  // Check cost delta
  const costDelta = Math.abs(currentState.cost - previousState.cost) / previousState.cost;
  if (costDelta > COST_THRESHOLD) {
    return {
      triggered: true,
      reason: `Cost delta ${(costDelta * 100).toFixed(1)}% exceeds threshold`,
      delta: { cost: costDelta },
    };
  }
  
  // Check latency delta
  const latencyDelta = Math.abs(currentState.latency - previousState.latency);
  if (latencyDelta > LATENCY_THRESHOLD_MS) {
    return {
      triggered: true,
      reason: `Latency delta ${latencyDelta.toFixed(1)}ms exceeds threshold`,
      delta: { latency: latencyDelta },
    };
  }
  
  // Check congestion delta
  const congestionDelta = Math.abs(currentState.congestion - previousState.congestion);
  if (congestionDelta > CONGESTION_THRESHOLD) {
    return {
      triggered: true,
      reason: `Congestion delta ${congestionDelta.toFixed(3)} exceeds threshold`,
      delta: { congestion: congestionDelta },
    };
  }
  
  return {
    triggered: false,
    reason: "No threshold exceeded",
  };
}

/**
 * Create initial routing state
 */
export function createInitialRoutingState(): RoutingState {
  return {
    cost: 0,
    latency: 0,
    congestion: 0,
    shells: [],
    lastRecomputeTime: Date.now(),
  };
}

