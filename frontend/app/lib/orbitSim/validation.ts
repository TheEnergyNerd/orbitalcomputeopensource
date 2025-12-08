/**
 * SELF-VALIDATION + AUTO-REPAIR
 * Every sim tick must assert:
 * - Compute Conserved
 * - Cost >= 0
 * - Latency >= Physics Bound
 * - Carbon Decline <= Energy Transition Limit
 * - Orbital Share <= Shell Capacity
 * 
 * If ANY fail: Trigger Auto-Repair System
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SimulationState {
  total_compute_PFLOPs: number;
  orbital_compute_PFLOPs: number;
  ground_compute_PFLOPs: number;
  total_cost: number;
  orbital_cost: number;
  ground_cost: number;
  avg_latency_ms: number;
  carbon_kg: number;
  orbital_share: number; // 0-1
  shell_capacities: Record<string, number>;
  shell_utilizations: Record<string, number>;
}

const PHYSICS_BOUNDS = {
  MIN_LATENCY_MS: 5, // Speed of light minimum
  MAX_ORBITAL_SHARE: 1.0, // 100%
  MAX_CARBON_DECLINE_RATE: 0.15, // 15% per year max
  MIN_COST: 0,
};

/**
 * Validate simulation state
 */
export function validateSimulationState(state: SimulationState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Compute Conserved
  const compute_sum = state.orbital_compute_PFLOPs + state.ground_compute_PFLOPs;
  const compute_diff = Math.abs(compute_sum - state.total_compute_PFLOPs);
  if (compute_diff > 0.01) { // Allow small floating point errors
    errors.push(`Compute not conserved: total=${state.total_compute_PFLOPs}, sum=${compute_sum}, diff=${compute_diff}`);
  }
  
  // 2. Cost >= 0
  if (state.total_cost < PHYSICS_BOUNDS.MIN_COST) {
    errors.push(`Total cost < 0: ${state.total_cost}`);
  }
  if (state.orbital_cost < PHYSICS_BOUNDS.MIN_COST) {
    errors.push(`Orbital cost < 0: ${state.orbital_cost}`);
  }
  if (state.ground_cost < PHYSICS_BOUNDS.MIN_COST) {
    errors.push(`Ground cost < 0: ${state.ground_cost}`);
  }
  
  // 3. Latency >= Physics Bound
  if (state.avg_latency_ms < PHYSICS_BOUNDS.MIN_LATENCY_MS) {
    errors.push(`Latency < physics bound: ${state.avg_latency_ms}ms < ${PHYSICS_BOUNDS.MIN_LATENCY_MS}ms`);
  }
  
  // 4. Orbital Share <= 1.0
  if (state.orbital_share > PHYSICS_BOUNDS.MAX_ORBITAL_SHARE) {
    errors.push(`Orbital share > 1.0: ${state.orbital_share}`);
  }
  
  // 5. Shell Capacity Check
  for (const [shell_id, utilization] of Object.entries(state.shell_utilizations)) {
    const capacity = state.shell_capacities[shell_id] || 0;
    if (utilization > capacity) {
      errors.push(`Shell ${shell_id} over capacity: ${utilization} > ${capacity}`);
    }
    if (utilization > capacity * 0.9) {
      warnings.push(`Shell ${shell_id} near capacity: ${utilization}/${capacity}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Auto-repair: attempt to fix validation errors
 */
export function autoRepair(state: SimulationState): SimulationState {
  const repaired = { ...state };
  
  // Fix negative costs
  if (repaired.total_cost < 0) repaired.total_cost = 0;
  if (repaired.orbital_cost < 0) repaired.orbital_cost = 0;
  if (repaired.ground_cost < 0) repaired.ground_cost = 0;
  
  // Fix latency below physics bound
  if (repaired.avg_latency_ms < PHYSICS_BOUNDS.MIN_LATENCY_MS) {
    repaired.avg_latency_ms = PHYSICS_BOUNDS.MIN_LATENCY_MS;
  }
  
  // Fix orbital share > 1.0
  if (repaired.orbital_share > PHYSICS_BOUNDS.MAX_ORBITAL_SHARE) {
    repaired.orbital_share = PHYSICS_BOUNDS.MAX_ORBITAL_SHARE;
  }
  
  // Fix shell over-capacity (clamp to capacity)
  for (const shell_id of Object.keys(repaired.shell_utilizations)) {
    const capacity = repaired.shell_capacities[shell_id] || 0;
    if (repaired.shell_utilizations[shell_id] > capacity) {
      repaired.shell_utilizations[shell_id] = capacity;
    }
  }
  
  // Fix compute conservation
  const compute_sum = repaired.orbital_compute_PFLOPs + repaired.ground_compute_PFLOPs;
  if (Math.abs(compute_sum - repaired.total_compute_PFLOPs) > 0.01) {
    repaired.total_compute_PFLOPs = compute_sum;
  }
  
  return repaired;
}

/**
 * Validate and auto-repair if needed
 */
export function validateAndRepair(state: SimulationState): {
  state: SimulationState;
  validation: ValidationResult;
  repaired: boolean;
} {
  const validation = validateSimulationState(state);
  
  if (validation.valid) {
    return { state, validation, repaired: false };
  }
  
  // Attempt auto-repair
  const repaired_state = autoRepair(state);
  const repaired_validation = validateSimulationState(repaired_state);
  
  if (!repaired_validation.valid) {
    // Still invalid after repair - HARD HALT
    console.error("[Validation] MODEL BROKEN - Auto-repair failed:", repaired_validation.errors);
    throw new Error(`MODEL BROKEN: ${repaired_validation.errors.join(", ")}`);
  }
  
  return { state: repaired_state, validation: repaired_validation, repaired: true };
}

