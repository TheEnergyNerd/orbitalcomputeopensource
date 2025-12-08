/**
 * Orbital Congestion State Models
 * Real-time congestion tracking for orbital shells
 */

export type OrbitalShellID = string;

export interface OrbitalCongestionState {
  shellId: OrbitalShellID;
  utilization: number;       // 0.0 → 1.0
  packetRate: number;        // jobs/sec
  contentionFactor: number;  // derived from utilization and packetRate
}

export interface GlobalCongestionFrame {
  timestamp: number;
  shells: Record<OrbitalShellID, OrbitalCongestionState>;
}

/**
 * Calculate contention factor from utilization and packet rate
 */
export function calculateContentionFactor(
  utilization: number,
  packetRate: number
): number {
  // Contention increases non-linearly with utilization
  // High packet rate + high utilization = high contention
  const baseContention = utilization * 0.5;
  const packetContention = Math.min(packetRate / 1000, 1.0) * 0.5;
  return Math.min(baseContention + packetContention, 1.0);
}

/**
 * Create a congestion state for a shell
 */
export function createCongestionState(
  shellId: OrbitalShellID,
  utilization: number,
  packetRate: number
): OrbitalCongestionState {
  return {
    shellId,
    utilization: Math.max(0, Math.min(1, utilization)),
    packetRate: Math.max(0, packetRate),
    contentionFactor: calculateContentionFactor(utilization, packetRate),
  };
}

/**
 * Create a global congestion frame from shell states
 */
export function createCongestionFrame(
  shells: Record<OrbitalShellID, OrbitalCongestionState>
): GlobalCongestionFrame {
  return {
    timestamp: Date.now(),
    shells,
  };
}

/**
 * Calculate mean utilization across all shells
 */
export function meanUtilization(frame: GlobalCongestionFrame): number {
  const shells = Object.values(frame.shells);
  if (shells.length === 0) return 0;
  return shells.reduce((sum, s) => sum + s.utilization, 0) / shells.length;
}

/**
 * Calculate variance of utilization across shells
 */
export function utilizationVariance(frame: GlobalCongestionFrame): number {
  const shells = Object.values(frame.shells);
  if (shells.length === 0) return 0;
  const mean = meanUtilization(frame);
  const variance = shells.reduce((sum, s) => {
    const diff = s.utilization - mean;
    return sum + diff * diff;
  }, 0) / shells.length;
  return variance;
}

