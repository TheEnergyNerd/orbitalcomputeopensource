/**
 * UI semantics for factory nodes - consistent color and state meanings
 */

export interface NodeStatus {
  state: 'idle' | 'healthy' | 'constrained' | 'starved';
  utilization: number;
  buffer: number;
}

/**
 * Classify a node's status based on utilization and buffer
 */
export function classifyNode(status: NodeStatus): 'idle' | 'healthy' | 'constrained' | 'starved' {
  const { utilization, buffer } = status;
  
  // Idle: very low utilization and buffer not changing
  if (utilization < 0.1 && Math.abs(buffer) < 1e-6) return 'idle';
  
  // Starved: buffer near zero but trying to consume
  if (buffer <= 0.01 && utilization > 0.1) return 'starved';
  
  // Constrained: high utilization (bottleneck)
  if (utilization >= 0.8) return 'constrained';
  
  // Healthy: balanced operation
  return 'healthy';
}

/**
 * Get color for a node status
 */
export function getStatusColor(status: 'idle' | 'healthy' | 'constrained' | 'starved'): string {
  switch (status) {
    case 'idle':
      return '#6b7280'; // gray-500
    case 'healthy':
      return '#10b981'; // green-500
    case 'constrained':
      return '#f97316'; // orange-500
    case 'starved':
      return '#ef4444'; // red-500
  }
}

/**
 * Get border color for a node based on status
 */
export function getNodeBorderColor(status: 'idle' | 'healthy' | 'constrained' | 'starved', isSelected: boolean): string {
  if (isSelected) {
    return '#3b82f6'; // blue-500 for selected
  }
  return getStatusColor(status);
}

/**
 * Get text color for net rate based on value
 */
export function getNetRateColor(netRate: number): string {
  if (netRate < -0.01) return '#ef4444'; // red - consuming faster than producing
  if (netRate > 0.01) return '#10b981'; // green - producing
  return '#6b7280'; // gray - balanced
}

