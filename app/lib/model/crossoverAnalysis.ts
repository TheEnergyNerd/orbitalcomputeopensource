/**
 * Crossover Analysis and Explanation
 * 
 * Provides functions to analyze crossover drivers and explain why crossover happens when it does.
 */

import { YearlyBreakdown } from './types';

export interface CrossoverDriverExplanation {
  targetYear: number;
  orbitalCost: number;
  groundCost: number;
  costDifference: number;
  costDifferencePct: number;
  topBindingMultipliers: Array<{
    name: string;
    value: number;
    impact: string;
  }>;
  topCostShares: Array<{
    component: string;
    share: number;
    cost: number;
  }>;
  bindingConstraints: string[];
  recommendations: string[];
}

/**
 * Explain crossover drivers for a target year
 * Identifies top binding multipliers and cost shares to understand what's driving crossover
 */
export function explainCrossoverDrivers(
  trajectory: YearlyBreakdown[],
  targetYear: number
): CrossoverDriverExplanation | null {
  const yearData = trajectory.find(y => y.year === targetYear);
  
  if (!yearData) {
    return null;
  }
  
  const orbital = yearData.orbit;
  const ground = yearData.ground;
  const orbitalCost = orbital.totalCostPerPflopYear;
  const groundCost = ground.totalCostPerPflopYear;
  const costDifference = orbitalCost - groundCost;
  const costDifferencePct = (costDifference / groundCost) * 100;
  
  // Extract top binding multipliers
  const multipliers = orbital.effectiveComputeMultipliers;
  const topBindingMultipliers: Array<{ name: string; value: number; impact: string }> = [];
  
  if (multipliers) {
    // Sort by deviation from 1.0 (most binding first)
    const multiplierEntries = [
      { name: 'thermalCapFactor', value: multipliers.thermalCapFactor, ideal: 1.0 },
      { name: 'radiationDerate', value: multipliers.radiationDerate, ideal: 1.0 },
      { name: 'availability', value: multipliers.availability, ideal: 1.0 },
      { name: 'utilization', value: multipliers.utilization, ideal: 1.0 },
    ];
    
    multiplierEntries
      .map(m => ({
        name: m.name,
        value: m.value,
        deviation: Math.abs(m.value - m.ideal),
        impact: m.value < m.ideal 
          ? `Reduces effective compute by ${((1 - m.value) * 100).toFixed(1)}%`
          : m.value > m.ideal
          ? `Increases effective compute by ${((m.value - 1) * 100).toFixed(1)}%`
          : 'No impact',
      }))
      .sort((a, b) => b.deviation - a.deviation)
      .slice(0, 3)
      .forEach(m => {
        topBindingMultipliers.push({
          name: m.name,
          value: m.value,
          impact: m.impact,
        });
      });
  }
  
  // Extract top cost shares
  const costShares = orbital.costShares;
  const topCostShares: Array<{ component: string; share: number; cost: number }> = [];
  
  if (costShares) {
    const shareEntries = [
      { component: 'launch', share: costShares.launch, cost: orbital.launchCostPerPflopYear },
      { component: 'power', share: costShares.power, cost: orbital.energyCostPerPflopYear },
      { component: 'compute', share: costShares.compute, cost: orbital.hardwareCostPerPflopYear },
      { component: 'thermal', share: costShares.thermal, cost: orbital.thermalSystemCost || 0 },
      { component: 'ops', share: costShares.ops, cost: orbital.replacementRateCost || 0 },
      { component: 'networking', share: costShares.networking, cost: orbital.networkingCost || 0 },
    ];
    
    shareEntries
      .sort((a, b) => b.share - a.share)
      .slice(0, 3)
      .forEach(s => {
        topCostShares.push({
          component: s.component,
          share: s.share,
          cost: s.cost,
        });
      });
  }
  
  // Identify binding constraints
  const bindingConstraints: string[] = [];
  
  if (orbital.thermalCapped) {
    bindingConstraints.push(`Thermal: Can only reject ${orbital.maxRejectableKw.toFixed(1)}kW but need ${(orbital.computePowerKw * 0.95).toFixed(1)}kW (cap factor: ${orbital.thermalCapFactor.toFixed(3)})`);
  }
  
  if (multipliers && multipliers.radiationDerate < 0.9) {
    bindingConstraints.push(`Radiation: ${((1 - multipliers.radiationDerate) * 100).toFixed(1)}% compute loss from radiation damage`);
  }
  
  if (orbital.collisionRisk > 0.01) {
    bindingConstraints.push(`Collision risk: ${(orbital.collisionRisk * 100).toFixed(2)}% annual probability`);
  }
  
  if (ground.constraintMultiplier > 2.0) {
    bindingConstraints.push(`Ground constraints: ${ground.constraintMultiplier.toFixed(2)}x multiplier from infrastructure scarcity`);
  }
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (orbital.thermalCapped) {
    recommendations.push('Thermal is binding: Consider larger radiator area or lower compute power target');
  }
  
  if (topCostShares.length > 0 && topCostShares[0].component === 'launch' && topCostShares[0].share > 30) {
    recommendations.push('Launch cost dominates: Crossover timing highly sensitive to launch cost trajectory');
  }
  
  if (topCostShares.length > 0 && topCostShares[0].component === 'ops' && topCostShares[0].share > 25) {
    recommendations.push('Operations cost dominates: Crossover requires aggressive OPEX reduction assumptions');
  }
  
  if (ground.constraintMultiplier > 3.0) {
    recommendations.push('Ground constraints are high: Crossover depends on constraint model assumptions');
  }
  
  const sensitivity = orbital.localSensitivity;
  if (sensitivity) {
    const maxSensitivity = Math.max(
      Math.abs(sensitivity.dCost_dLaunch),
      Math.abs(sensitivity.dCost_dSpecificPower),
      Math.abs(sensitivity.dCost_dGflopsPerW),
      Math.abs(sensitivity.dCost_dFailureRate),
      Math.abs(sensitivity.dCost_dPue)
    );
    
    if (Math.abs(sensitivity.dCost_dLaunch) === maxSensitivity) {
      recommendations.push('Most sensitive to launch cost: Small changes in launch trajectory shift crossover significantly');
    } else if (Math.abs(sensitivity.dCost_dGflopsPerW) === maxSensitivity) {
      recommendations.push('Most sensitive to compute efficiency: Moore\'s Law improvements drive crossover timing');
    }
  }
  
  return {
    targetYear,
    orbitalCost,
    groundCost,
    costDifference,
    costDifferencePct,
    topBindingMultipliers,
    topCostShares,
    bindingConstraints,
    recommendations,
  };
}

/**
 * Print crossover driver explanation in human-readable format
 */
export function printCrossoverExplanation(explanation: CrossoverDriverExplanation): string {
  const lines: string[] = [];
  
  lines.push(`\n=== Crossover Analysis for ${explanation.targetYear} ===`);
  lines.push(`Orbital Cost: $${explanation.orbitalCost.toFixed(2)}/PFLOP-year`);
  lines.push(`Ground Cost: $${explanation.groundCost.toFixed(2)}/PFLOP-year`);
  lines.push(`Difference: $${explanation.costDifference.toFixed(2)} (${explanation.costDifferencePct > 0 ? '+' : ''}${explanation.costDifferencePct.toFixed(1)}%)`);
  lines.push('');
  
  lines.push('Top Binding Multipliers:');
  explanation.topBindingMultipliers.forEach((m, i) => {
    lines.push(`  ${i + 1}. ${m.name}: ${m.value.toFixed(3)} - ${m.impact}`);
  });
  lines.push('');
  
  lines.push('Top 3 Cost Shares:');
  explanation.topCostShares.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.component}: ${s.share.toFixed(1)}% ($${s.cost.toFixed(2)})`);
  });
  lines.push('');
  
  if (explanation.bindingConstraints.length > 0) {
    lines.push('Binding Constraints:');
    explanation.bindingConstraints.forEach(c => {
      lines.push(`  - ${c}`);
    });
    lines.push('');
  }
  
  if (explanation.recommendations.length > 0) {
    lines.push('Recommendations:');
    explanation.recommendations.forEach(r => {
      lines.push(`  - ${r}`);
    });
  }
  
  return lines.join('\n');
}


