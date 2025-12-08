/**
 * Factory Pipeline Model
 * Canonical model for pipeline stages and visualization
 */

import type { StageId, StageState } from './factoryModel';

export type PipelineStageId = 'silicon' | 'chips' | 'racks' | 'pods' | 'launch';

export interface PipelineStageState {
  id: PipelineStageId;
  label: string;
  throughput: number;     // units per second actually flowing
  capacity: number;       // max units per second
  utilization: number;    // 0..1 (throughput / capacity, capped)
  efficiency: number;     // 0..1 (for advanced view text only)
  reliability: number;    // 0..1 (for launch risk text only)
}

/**
 * Map factory stage states to pipeline visualization model
 */
export function selectPipelineStages(stages: Record<StageId, StageState>): PipelineStageState[] {
  const stageConfigs: Record<StageId, { label: string }> = {
    silicon: { label: 'Silicon' },
    chips: { label: 'Chips' },
    racks: { label: 'Racks' },
    pods: { label: 'Pods' },
    launch: { label: 'Launch' },
  };

  const order: StageId[] = ['silicon', 'chips', 'racks', 'pods', 'launch'];
  
  return order.map(id => {
    const stage = stages[id];
    const config = stageConfigs[id];
    
    return {
      id: id as PipelineStageId,
      label: config.label,
      throughput: stage.throughput,
      capacity: stage.capacity,
      utilization: Math.min(1, stage.utilization || 0),
      efficiency: stage.efficiency || 0.7,
      reliability: stage.reliability || 0.8,
    };
  });
}

/**
 * Map throughput to dot count for conveyor visualization
 */
export function mapThroughputToDotCount(throughput: number): number {
  // Clamp between 4 and 12 dots
  return Math.max(4, Math.min(12, Math.round(4 + throughput * 2)));
}

/**
 * Map throughput to speed class for animation
 */
export function mapThroughputToSpeedClass(throughput: number): 'slow' | 'medium' | 'fast' {
  if (throughput < 2) return 'slow';
  if (throughput < 6) return 'medium';
  return 'fast';
}

/**
 * Calculate bottleneck ratio between two stages
 */
export function calculateBottleneckRatio(from: PipelineStageState, to: PipelineStageState): number {
  const incoming = from.throughput;
  const outgoingCap = to.capacity;
  return Math.max(0, (incoming - outgoingCap) / Math.max(incoming, 1));
}

