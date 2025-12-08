/**
 * V1 Suggested Moves Heuristics
 * Provides hints based on current state and mission goals
 */

import type { V1Mission } from './v1Missions';
import type { V1State } from '../sim/v1State';
import { calculateMetricDeltas } from '../sim/v1State';

export function computeSuggestedMoves(state: V1State, mission: V1Mission | null): string[] {
  if (!mission) {
    return [];
  }
  
  const { costDelta, opexDelta, latencyDeltaMs, carbonDelta, improvementFlags } = 
    calculateMetricDeltas(state.metrics);
  
  const suggestions: string[] = [];
  
  switch (mission.id) {
    case 'cheap_orbit':
      // Goal: opexDelta <= -0.15, latencyDeltaMs <= 3
      if (opexDelta > -0.15) {
        if (state.orbitalShare < 0.4) {
          suggestions.push('Increase Orbital Share to shift more load to orbit.');
        } else if (state.groundEfficiency > 0.3) {
          suggestions.push('Lower Ground Efficiency slightly to keep baseline costs high, orbit relatively cheaper.');
        }
      }
      if (latencyDeltaMs > 3) {
        suggestions.push('Increase Orbital Share or bump Ground Efficiency to reduce ground latency.');
      }
      break;
      
    case 'green_compute':
      // Goal: carbonDelta <= -0.40, opexDelta <= 0.10
      if (carbonDelta > -0.40) {
        if (state.orbitalShare < 0.5) {
          suggestions.push('Increase Orbital Share to move more compute off fossil ground.');
        } else {
          suggestions.push('Raise Ground Efficiency to cut ground energy waste.');
        }
      }
      if (opexDelta > 0.10) {
        suggestions.push('Lower Launch Cadence or reduce Orbital Share slightly to tame launch costs.');
      }
      break;
      
    case 'low_latency_edge':
      // Goal: orbitLatency <= 100, orbitalShare <= 0.40
      if (state.metrics.latency.mix > 100) {
        if (state.orbitalShare < 0.3) {
          suggestions.push('Increase Orbital Share for faster global reach.');
        } else {
          suggestions.push('Increase Ground Efficiency for better chip performance.');
        }
      }
      if (state.orbitalShare > 0.40) {
        suggestions.push('Reduce Orbital Share to keep enough ground edge nodes online.');
      }
      break;
      
    case 'high_orbit_push':
      // Goal: orbitalShare >= 0.70, launchesPerYear <= 200
      if (state.orbitalShare < 0.70) {
        suggestions.push('Increase Orbital Share; push more capacity off Earth.');
      }
      if (state.launchesPerYear > 200) {
        if (state.launchCadence < 20) {
          suggestions.push('Increase Launch Cadence.');
        } else {
          suggestions.push('Reduce Orbital Share slightly or slow launches to avoid overload.');
        }
      }
      break;
      
    case 'balanced_fleet':
      // Goal: at least 3 metrics improved, at most 1 worse
      const improvedCount = Object.values(improvementFlags).filter(Boolean).length;
      const worseCount = [costDelta, opexDelta, latencyDeltaMs, carbonDelta].filter(d => d > 0.01).length;
      
      if (improvedCount < 3) {
        if (opexDelta > 0) {
          suggestions.push('Nudge Orbital Share up or boost Ground Efficiency to cut OPEX.');
        }
        if (latencyDeltaMs > 0) {
          suggestions.push('Increase Orbital Share slightly for better latency.');
        }
        if (carbonDelta > 0) {
          suggestions.push('Increase Orbital Share or Ground Efficiency to reduce emissions.');
        }
      }
      if (worseCount > 1) {
        suggestions.push('Try lowering Orbital Share or Launch Cadence to reduce stress on the system.');
      }
      break;
  }
  
  // Limit to 3 suggestions
  return suggestions.slice(0, 3);
}

