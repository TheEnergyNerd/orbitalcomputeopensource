/**
 * Congestion Calculator
 * Calculates orbital congestion from actual traffic volume
 */

import type { GlobalCongestionFrame, OrbitalCongestionState } from './congestion';
import { createCongestionState, createCongestionFrame } from './congestion';
import type { RouterPolicy } from '../../ai/routerTypes';
import type { JobDemand } from '../../ai/routerEval';

export interface TrafficVolume {
  shellId: string;
  packetRate: number; // jobs/sec
  capacity: number; // max jobs/sec
}

/**
 * Calculate congestion from router policy and job demand
 */
export function calculateCongestionFromTraffic(
  routerPolicy: RouterPolicy,
  jobDemand: JobDemand[],
  orbitalCapacity: number, // Total orbital capacity (TWh/yr or equivalent)
  shells: Array<{ id: string; capacity: number }> = [{ id: 'orbit', capacity: 1 }] // Default single shell
): GlobalCongestionFrame {
  // Calculate total traffic to orbit
  let totalOrbitTraffic = 0;
  for (const demand of jobDemand) {
    const policyRow = routerPolicy.jobs[demand.jobTypeId];
    const orbitShare = policyRow?.orbit || 0;
    totalOrbitTraffic += demand.jobsPerYear * orbitShare;
  }

  // Convert to jobs/sec (approximate)
  const secondsPerYear = 365.25 * 24 * 3600;
  const orbitPacketRate = totalOrbitTraffic / secondsPerYear;

  // Calculate utilization per shell
  const shellStates: Record<string, OrbitalCongestionState> = {};
  
  for (const shell of shells) {
    // Distribute traffic across shells (simplified: equal distribution for now)
    const shellTraffic = orbitPacketRate / shells.length;
    const shellCapacity = (shell.capacity / shells.length) * (orbitalCapacity / secondsPerYear);
    const utilization = shellCapacity > 0 ? Math.min(1, shellTraffic / shellCapacity) : 0;

    shellStates[shell.id] = createCongestionState(
      shell.id,
      utilization,
      shellTraffic
    );
  }

  return createCongestionFrame(shellStates);
}

/**
 * Calculate congestion from traffic particles (for real-time visualization)
 */
export function calculateCongestionFromParticles(
  particles: Array<{ isOrbit: boolean; jobType: string }>,
  orbitalCapacity: number,
  shells: Array<{ id: string; capacity: number }> = [{ id: 'orbit', capacity: 1 }]
): GlobalCongestionFrame {
  // Count orbit particles
  const orbitParticles = particles.filter(p => p.isOrbit).length;
  const totalParticles = particles.length;
  
  // Estimate packet rate from particle count (normalize to jobs/sec)
  // Assume each particle represents ~1000 jobs/sec
  const basePacketRate = 1000;
  const orbitPacketRate = (orbitParticles / Math.max(1, totalParticles)) * basePacketRate;

  // Calculate utilization per shell
  const shellStates: Record<string, OrbitalCongestionState> = {};
  
  for (const shell of shells) {
    const shellTraffic = orbitPacketRate / shells.length;
    const shellCapacity = (shell.capacity / shells.length) * (orbitalCapacity / 1000); // Simplified
    const utilization = shellCapacity > 0 ? Math.min(1, shellTraffic / shellCapacity) : 0;

    shellStates[shell.id] = createCongestionState(
      shell.id,
      utilization,
      shellTraffic
    );
  }

  return createCongestionFrame(shellStates);
}

