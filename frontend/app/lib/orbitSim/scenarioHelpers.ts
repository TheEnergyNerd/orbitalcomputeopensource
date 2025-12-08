/**
 * Helper functions for scenario calculations with upgrades
 */

import type { ScenarioInputs } from './scenarioTypes';
import { calculateScenarioMetrics } from './scenarioCalculator';
import { useFactoryStore } from '../../store/factoryStore';

/**
 * Calculate scenario metrics with current factory state
 * Gets factory throughput from the factory store and converts to upgrade format for compatibility
 */
export function calculateScenarioMetricsWithUpgrades(inputs: Omit<ScenarioInputs, 'upgrades'>): ReturnType<typeof calculateScenarioMetrics> {
  // Get factory state (not hook)
  const factoryStore = useFactoryStore.getState();
  const computedStages = factoryStore.getComputedStages();
  
  // Convert factory throughput to upgrade multipliers format for compatibility
  // The scenario calculator expects upgrade multipliers, but we derive them from factory throughput
  const launchThroughput = computedStages.launch.throughput; // pods per second
  const podsPerYear = launchThroughput * 365 * 24 * 3600;
  
  // Calculate multipliers based on factory efficiency and reliability
  // This is a bridge to maintain compatibility with existing scenario calculator
  const avgEfficiency = Object.values(computedStages).reduce((sum, s) => sum + s.efficiency, 0) / Object.keys(computedStages).length;
  const avgReliability = Object.values(computedStages).reduce((sum, s) => sum + s.reliability, 0) / Object.keys(computedStages).length;
  
  // Convert to multiplier format (approximate)
  const throughputMultiplier = launchThroughput / 0.001; // relative to base
  const opexMultiplier = 1.0 + (1 - avgEfficiency) * 0.3; // less efficient = higher OPEX
  const carbonMultiplier = 1.0 + (1 - avgEfficiency) * 0.2; // less efficient = more carbon
  const launchRiskBonus = (1 - avgReliability) * 0.1; // lower reliability = higher risk
  
  const multipliers = {
    silicon: throughputMultiplier,
    chips: throughputMultiplier,
    racks: throughputMultiplier,
    launch: throughputMultiplier,
    opexMultiplier,
    carbonMultiplier,
    launchRiskBonus,
  };
  
  const inputsWithUpgrades: ScenarioInputs = {
    ...inputs,
    upgrades: multipliers,
  };
  
  return calculateScenarioMetrics(inputsWithUpgrades);
}

