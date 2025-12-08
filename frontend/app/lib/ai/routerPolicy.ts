/**
 * AI Router Policy with Congestion Awareness
 * Router must react to congestion and failure events
 */

import type { RouterPolicy } from './routerTypes';
import type { GlobalCongestionFrame } from '../sim/orbit/congestion';
import type { FailureEvent } from '../sim/orbit/failure';
import { isRouteInShockZone } from '../sim/orbit/failurePropagation';
import { ACTIVE_ROUTES } from '../sim/orbit/failurePropagation';

/**
 * Check if a shell should be avoided due to congestion or failure
 */
export function shouldAvoidShell(
  shellId: string,
  congestionFrame: GlobalCongestionFrame | null,
  activeFailures: FailureEvent[]
): boolean {
  // Check congestion
  if (congestionFrame) {
    const shell = congestionFrame.shells[shellId];
    if (shell && shell.utilization > 0.75) {
      return true; // Avoid highly congested shells
    }
  }

  // Check for active failures in this shell
  const currentTime = Date.now();
  for (const failure of activeFailures) {
    if (failure.shellId === shellId && failure.timestamp + (failure.duration || Infinity) > currentTime) {
      return true; // Avoid shells with active failures
    }
  }

  return false;
}

/**
 * Adjust router policy to avoid congested/failed shells
 */
export function adjustPolicyForCongestion(
  basePolicy: RouterPolicy,
  congestionFrame: GlobalCongestionFrame | null,
  activeFailures: FailureEvent[]
): RouterPolicy {
  // If no congestion or failures, return base policy
  if (!congestionFrame && activeFailures.length === 0) {
    return basePolicy;
  }

  const adjustedPolicy: RouterPolicy = {
    jobs: {} as any,
  };

  // For each job type, adjust routing probabilities
  for (const [jobTypeId, destProbs] of Object.entries(basePolicy.jobs)) {
    const adjustedProbs: Record<string, number> = { ...destProbs };

    // Check if orbit shell should be avoided
    if (shouldAvoidShell('orbit', congestionFrame, activeFailures)) {
      // Reduce orbit probability, redistribute to ground
      const orbitProb = adjustedProbs.orbit || 0;
      const reduction = orbitProb * 0.7; // Reduce by 70%
      adjustedProbs.orbit = orbitProb - reduction;
      
      // Redistribute to ground destinations proportionally
      const groundEdgeProb = adjustedProbs.groundEdge || 0;
      const groundCoreProb = adjustedProbs.groundCore || 0;
      const groundTotal = groundEdgeProb + groundCoreProb;
      
      if (groundTotal > 0) {
        adjustedProbs.groundEdge = groundEdgeProb + (reduction * (groundEdgeProb / groundTotal));
        adjustedProbs.groundCore = groundCoreProb + (reduction * (groundCoreProb / groundTotal));
      } else {
        // If no ground routing, split between edge and core
        adjustedProbs.groundEdge = reduction * 0.6;
        adjustedProbs.groundCore = reduction * 0.4;
      }
    }

    // Normalize probabilities to sum to 1
    const sum = Object.values(adjustedProbs).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const key in adjustedProbs) {
        adjustedProbs[key] /= sum;
      }
    }

    adjustedPolicy.jobs[jobTypeId as keyof typeof adjustedPolicy.jobs] = adjustedProbs as any;
  }

  return adjustedPolicy;
}

/**
 * Check if a route is in a shock zone (for routing decisions)
 */
export function isInShockZone(
  route: { origin: { lat: number; lon: number }; destination: { lat: number; lon: number } },
  failures: FailureEvent[]
): boolean {
  const currentTime = Date.now();
  for (const failure of failures) {
    // Create a temporary route object for checking
    const tempRoute = {
      id: 'temp',
      shellId: failure.shellId,
      latency: 0,
      cost: 0,
      droppedPackets: 0,
      origin: route.origin,
      destination: route.destination,
    };
    
    if (isRouteInShockZone(tempRoute, failure, currentTime)) {
      return true;
    }
  }
  return false;
}

