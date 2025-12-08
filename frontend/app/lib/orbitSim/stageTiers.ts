/**
 * Stage Tier Configurations
 * Defines tradeoffs for each tier upgrade
 */

import type { StageId, Tier } from './orbitSimState';

export interface StageTierStats {
  tier: Tier;
  throughputMultiplier: number;
  opexDeltaPerTFLOP: number;   // + = more expensive
  latencyDeltaMs: number;      // - = faster
  carbonDeltaPct: number;      // negative = less carbon
  launchStressDelta: number;   // affects failure risk
}

export const STAGE_TIERS: Record<StageId, StageTierStats[]> = {
  silicon: [
    {
      tier: 1,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 2,
      throughputMultiplier: 2.5,
      opexDeltaPerTFLOP: 0.15,  // +15% more expensive
      latencyDeltaMs: -2,      // slightly faster
      carbonDeltaPct: -5,       // 5% less carbon
      launchStressDelta: 0,
    },
    {
      tier: 3,
      throughputMultiplier: 6.0,
      opexDeltaPerTFLOP: 0.40,  // +40% more expensive
      latencyDeltaMs: -5,       // faster
      carbonDeltaPct: -12,      // 12% less carbon
      launchStressDelta: 0,
    },
  ],
  chips: [
    {
      tier: 1,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 2,
      throughputMultiplier: 2.5,
      opexDeltaPerTFLOP: 0.20,
      latencyDeltaMs: -4,
      carbonDeltaPct: -8,
      launchStressDelta: 0,
    },
    {
      tier: 3,
      throughputMultiplier: 6.0,
      opexDeltaPerTFLOP: 0.50,
      latencyDeltaMs: -10,
      carbonDeltaPct: -18,
      launchStressDelta: 0,
    },
  ],
  racks: [
    {
      tier: 1,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 2,
      throughputMultiplier: 2.5,
      opexDeltaPerTFLOP: 0.18,
      latencyDeltaMs: -3,
      carbonDeltaPct: -7,
      launchStressDelta: 0,
    },
    {
      tier: 3,
      throughputMultiplier: 6.0,
      opexDeltaPerTFLOP: 0.45,
      latencyDeltaMs: -8,
      carbonDeltaPct: -15,
      launchStressDelta: 0,
    },
  ],
  pods: [
    {
      tier: 1,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 2,
      throughputMultiplier: 2.5,
      opexDeltaPerTFLOP: -0.10,  // pods tier 2 actually reduces OPEX (better efficiency)
      latencyDeltaMs: -6,
      carbonDeltaPct: -12,
      launchStressDelta: 0.1,     // slightly more launches needed
    },
    {
      tier: 3,
      throughputMultiplier: 6.0,
      opexDeltaPerTFLOP: -0.25,  // pods tier 3 significantly reduces OPEX
      latencyDeltaMs: -15,
      carbonDeltaPct: -25,
      launchStressDelta: 0.2,
    },
  ],
  launch: [
    {
      tier: 1,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 2,
      throughputMultiplier: 2.5,
      opexDeltaPerTFLOP: 0.05,   // launch infrastructure costs
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: -0.3,   // reduces stress (more capacity)
    },
    {
      tier: 3,
      throughputMultiplier: 6.0,
      opexDeltaPerTFLOP: 0.12,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: -0.5,   // significantly reduces stress
    },
  ],
  orbit: [
    // Orbit stage doesn't have upgrades in the same way
    {
      tier: 1,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 2,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
    {
      tier: 3,
      throughputMultiplier: 1.0,
      opexDeltaPerTFLOP: 0,
      latencyDeltaMs: 0,
      carbonDeltaPct: 0,
      launchStressDelta: 0,
    },
  ],
};

/**
 * Compute preview deltas for a tier upgrade
 */
export function computeTierPreview(
  currentState: {
    stages: Record<StageId, { tier: Tier }>;
    metrics: {
      groundOpex: number;
      orbitOpex: number;
      groundLatency: number;
      orbitLatency: number;
      groundCarbon: number;
      orbitCarbon: number;
    };
    flow: {
      backlogFactor: number;
      launchesPerYear: number;
    };
    orbitComputeShare: number;
  },
  stageId: StageId,
  newTier: Tier
): {
  opexDelta: number;
  opexDeltaPct: number;
  latencyDeltaMs: number;
  carbonDeltaPct: number;
  launchStressDelta: number;
} {
  const currentTier = currentState.stages[stageId].tier;
  const currentStats = STAGE_TIERS[stageId][currentTier - 1];
  const newStats = STAGE_TIERS[stageId][newTier - 1];

  // Calculate deltas based on tier stats
  // These are relative changes, so we apply them to current metrics
  const opexDeltaPct = (newStats.opexDeltaPerTFLOP - currentStats.opexDeltaPerTFLOP) * 100;
  const opexDelta = (opexDeltaPct / 100) * currentState.metrics.groundOpex;
  const latencyDeltaMs = newStats.latencyDeltaMs - currentStats.latencyDeltaMs;
  const carbonDeltaPct = newStats.carbonDeltaPct - currentStats.carbonDeltaPct;
  const launchStressDelta = newStats.launchStressDelta - currentStats.launchStressDelta;

  return {
    opexDelta,
    opexDeltaPct,
    latencyDeltaMs,
    carbonDeltaPct,
    launchStressDelta,
  };
}

