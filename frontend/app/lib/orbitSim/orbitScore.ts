/**
 * OrbitScore Calculation
 * Centralized scoring function that includes upgrade bonuses
 */

import type { SimulationSnapshot } from './orbitStats';
import type { UpgradesState } from '../../store/upgradeStore';

/**
 * Compute OrbitScore with upgrade bonus
 */
export function computeOrbitScore(
  snapshot: SimulationSnapshot,
  upgrades: UpgradesState
): number {
  const { ground, mix } = snapshot;

  // Calculate advantages (savings/improvements)
  const opexAdv = ground.annualOpex - mix.annualOpex;     // $/yr saved
  const carbonAdv = ground.carbonTons - mix.carbonTons;    // tCO2/yr saved
  const latAdv = ground.latencyMs - mix.latencyMs;         // ms improvement

  // Normalize and scale to match existing scoring system
  // Use percentages to normalize by baseline
  const opexScore = ground.annualOpex > 0
    ? Math.max(0, (opexAdv / ground.annualOpex) * 1000)
    : 0;
  
  const carbonScore = ground.carbonTons > 0
    ? Math.max(0, (carbonAdv / ground.carbonTons) * 800)
    : 0;
  
  const latencyScore = ground.latencyMs > 0
    ? Math.max(0, (latAdv / ground.latencyMs) * 500)
    : 0;

  // Base score
  const baseScore = opexScore + carbonScore + latencyScore;

  // Upgrade bonus = points spent * weight
  const pointsSpent = upgrades.totalPoints - upgrades.pointsRemaining;
  const upgradeBonus = pointsSpent * 5; // Tune this multiplier

  // Breakpoint bonus (orbit share >= 10%)
  const breakpointBonus = snapshot.orbitSharePct >= 10 ? 2000 : 0;

  // Penalties (these would come from scenario metrics, but for now we'll keep them minimal)
  // Launch risk, budget, stress penalties would be calculated elsewhere and passed in if needed

  return Math.round(baseScore + upgradeBonus + breakpointBonus);
}




