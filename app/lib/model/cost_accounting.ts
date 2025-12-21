/**
 * Cost Accounting Invariants
 * 
 * Ensures cost breakdowns sum to totals exactly.
 * Must never fail silently.
 */

export interface CostComponent {
  name: string;
  value: number;
}

export interface CostAccountingResult {
  valid: boolean;
  errorPct: number;
  total: number;
  sumOfComponents: number;
  discrepancy: number;
  appliedMultipliers: Array<{ name: string; value: number; appliedTo: string }>;
  errors: string[];
}

const TOLERANCE = 1e-6; // 0.0001% tolerance

/**
 * Assert cost accounting is correct
 * 
 * Throws if breakdown doesn't sum to total within tolerance.
 * 
 * @param total Total cost
 * @param components Cost components
 * @param appliedMultipliers List of multipliers applied (for debugging)
 * @throws Error if accounting doesn't match
 */
export function assertCostAccounting(
  total: number,
  components: CostComponent[],
  appliedMultipliers: Array<{ name: string; value: number; appliedTo: string }> = []
): CostAccountingResult {
  const sumOfComponents = components.reduce((sum, c) => sum + c.value, 0);
  const discrepancy = Math.abs(total - sumOfComponents);
  const errorPct = total > 0 ? (discrepancy / total) * 100 : 0;
  
  const errors: string[] = [];
  
  // Check if sum matches total
  if (errorPct > TOLERANCE * 100) {
    errors.push(
      `Cost accounting error: total=${total.toFixed(2)}, sum=${sumOfComponents.toFixed(2)}, ` +
      `discrepancy=${discrepancy.toFixed(2)}, error=${errorPct.toFixed(4)}%`
    );
  }
  
  // Check for NaN or Infinity
  if (!isFinite(total) || !isFinite(sumOfComponents)) {
    errors.push(`Non-finite values: total=${total}, sum=${sumOfComponents}`);
  }
  
  // Check for negative costs (unless explicitly allowed)
  const negativeComponents = components.filter(c => c.value < 0);
  if (negativeComponents.length > 0) {
    errors.push(
      `Negative cost components: ${negativeComponents.map(c => `${c.name}=${c.value}`).join(', ')}`
    );
  }
  
  const valid = errors.length === 0;
  
  if (!valid) {
    throw new Error(
      `Cost accounting failed:\n${errors.join('\n')}\n` +
      `Components: ${components.map(c => `${c.name}=${c.value.toFixed(2)}`).join(', ')}\n` +
      `Applied multipliers: ${appliedMultipliers.map(m => `${m.name}=${m.value.toFixed(3)} (${m.appliedTo})`).join(', ')}`
    );
  }
  
  return {
    valid,
    errorPct,
    total,
    sumOfComponents,
    discrepancy,
    appliedMultipliers,
    errors,
  };
}

/**
 * Validate cost accounting for a trajectory
 */
export function validateTrajectoryCostAccounting(
  trajectory: Array<{
    year: number;
    ground?: { totalCostPerPflopYear: number; [key: string]: any };
    orbit?: { totalCostPerPflopYear: number; [key: string]: any };
  }>
): {
  valid: boolean;
  errors: Array<{ year: number; location: 'ground' | 'orbit'; error: string }>;
} {
  const errors: Array<{ year: number; location: 'ground' | 'orbit'; error: string }> = [];
  
  for (const entry of trajectory) {
    // Validate ground costs
    if (entry.ground) {
      try {
        const components: CostComponent[] = [
          { name: 'energy', value: entry.ground.energyCostPerPflopYear || 0 },
          { name: 'site', value: entry.ground.siteCostPerPflopYear || 0 },
          { name: 'hardware', value: entry.ground.hardwareCapexPerPflopYear || 0 },
        ];
        assertCostAccounting(entry.ground.totalCostPerPflopYear, components);
      } catch (e) {
        errors.push({
          year: entry.year,
          location: 'ground',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    
    // Validate orbital costs
    if (entry.orbit) {
      try {
        const breakdown = entry.orbit.hybridBreakdown || {};
        const components: CostComponent[] = [
          { name: 'power', value: breakdown.power || entry.orbit.energyCostPerPflopYear || 0 },
          { name: 'compute', value: breakdown.compute || entry.orbit.hardwareCostPerPflopYear || 0 },
          { name: 'thermal', value: breakdown.thermal || entry.orbit.thermalSystemCost || 0 },
          { name: 'radiation', value: breakdown.radiation || 0 },
          { name: 'bus', value: breakdown.bus || 0 },
          { name: 'ops', value: breakdown.ops || entry.orbit.replacementRateCost || 0 },
          { name: 'networking', value: breakdown.networking || entry.orbit.networkingCost || 0 },
          { name: 'interconnect', value: breakdown.interconnect || entry.orbit.interconnectCost || 0 },
          { name: 'launch', value: breakdown.launch || entry.orbit.launchCostPerPflopYear || 0 },
          { name: 'regulatory', value: breakdown.regulatory || entry.orbit.regulatoryCost || 0 },
          { name: 'congestion', value: breakdown.congestion || entry.orbit.congestionCostPerPflopYear || 0 },
        ];
        assertCostAccounting(entry.orbit.totalCostPerPflopYear, components);
      } catch (e) {
        errors.push({
          year: entry.year,
          location: 'orbit',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}


