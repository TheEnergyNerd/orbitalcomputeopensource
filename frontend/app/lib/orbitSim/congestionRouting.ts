/**
 * ROUTING + CONGESTION MODEL
 * Congestion_Index = active_routes / satellites_in_shell
 * 
 * Latency_Total = Base_Distance_Latency + Shell_Altitude_Delay + Handoff_Penalty + Congestion_Penalty
 * 
 * Congestion must create natural routing phase shifts
 */

import type { OrbitShell } from "./orbitShells";

export interface Route {
  id: string;
  from_shell: OrbitShell["id"];
  to_shell: OrbitShell["id"];
  from_satellite_id: string;
  to_satellite_id: string;
  distance_km: number;
}

export interface ShellState {
  shell_id: OrbitShell["id"];
  satellites_count: number;
  active_routes: number;
  congestion_index: number; // active_routes / satellites_count
  congestion_penalty_ms: number;
}

/**
 * Calculate congestion index for a shell
 */
export function calculateCongestionIndex(
  active_routes: number,
  satellites_in_shell: number
): number {
  if (satellites_in_shell === 0) return 0;
  return active_routes / satellites_in_shell;
}

/**
 * Calculate congestion penalty (latency increase)
 */
export function calculateCongestionPenalty(
  congestion_index: number,
  shell: OrbitShell
): number {
  // Penalty increases exponentially with congestion
  // At 100% capacity, penalty is significant
  const capacity_ratio = congestion_index / (shell.congestion_capacity / 1000); // Normalize
  return Math.pow(capacity_ratio, 2) * 50; // Up to 50ms penalty at high congestion
}

/**
 * Calculate total latency for a route
 */
export function calculateRouteLatency(
  route: Route,
  from_shell: OrbitShell,
  to_shell: OrbitShell,
  from_shell_state: ShellState,
  to_shell_state: ShellState,
  handoff_penalty_ms: number = 10
): number {
  // Base distance latency (simplified - assumes speed of light)
  const speed_of_light_km_per_ms = 300_000 / 1000; // km/ms
  const base_latency = route.distance_km / speed_of_light_km_per_ms;
  
  // Shell altitude delay (average of both shells)
  const avg_shell_latency = (from_shell.latency_ms + to_shell.latency_ms) / 2;
  
  // Handoff penalty (if crossing shells)
  const handoff = from_shell.id !== to_shell.id ? handoff_penalty_ms : 0;
  
  // Congestion penalty (average of both shells)
  const avg_congestion_penalty = (
    from_shell_state.congestion_penalty_ms +
    to_shell_state.congestion_penalty_ms
  ) / 2;
  
  return base_latency + avg_shell_latency + handoff + avg_congestion_penalty;
}

/**
 * Update shell states from routes
 */
export function updateShellStates(
  routes: Route[],
  shell_satellite_counts: Record<OrbitShell["id"], number>,
  shells: OrbitShell[]
): Map<OrbitShell["id"], ShellState> {
  const shell_states = new Map<OrbitShell["id"], ShellState>();
  
  // Count active routes per shell
  const routes_per_shell = new Map<OrbitShell["id"], number>();
  routes.forEach(route => {
    routes_per_shell.set(
      route.from_shell,
      (routes_per_shell.get(route.from_shell) || 0) + 1
    );
    routes_per_shell.set(
      route.to_shell,
      (routes_per_shell.get(route.to_shell) || 0) + 1
    );
  });
  
  // Create shell states
  shells.forEach(shell => {
    const active_routes = routes_per_shell.get(shell.id) || 0;
    const satellites_count = shell_satellite_counts[shell.id] || 0;
    const congestion_index = calculateCongestionIndex(active_routes, satellites_count);
    const congestion_penalty = calculateCongestionPenalty(congestion_index, shell);
    
    shell_states.set(shell.id, {
      shell_id: shell.id,
      satellites_count,
      active_routes,
      congestion_index,
      congestion_penalty_ms: congestion_penalty,
    });
  });
  
  return shell_states;
}

/**
 * Check if shell is at capacity
 */
export function isShellAtCapacity(
  shell_state: ShellState,
  shell: OrbitShell
): boolean {
  return shell_state.active_routes >= shell.congestion_capacity;
}

