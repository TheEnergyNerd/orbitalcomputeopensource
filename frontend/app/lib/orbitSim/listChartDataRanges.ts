/**
 * List Chart Data Ranges
 * 
 * This script lists out data ranges for the following charts:
 * 1. Compute over time Class A/B
 * 2. Power vs Compute Class A/B
 * 3. Radiator Area vs Compute
 * 4. Power Compute Frontier
 * 
 * Use this to determine appropriate x and y axis scales and increments.
 */

import { getDebugStateEntries } from "./debugState";
import { buildPowerComputeFrontier } from "./selectors/frontier";
import { buildRadiatorComputeSeries } from "./selectors/physics";
import type { ScenarioKey } from "./selectors/scenarios";

interface DataRange {
  min: number;
  max: number;
  values: number[];
}

interface ChartDataRanges {
  computeOverTimeClassA: DataRange;
  computeOverTimeClassB: DataRange;
  powerVsComputeClassA: { power: DataRange; compute: DataRange };
  powerVsComputeClassB: { power: DataRange; compute: DataRange };
  radiatorAreaVsCompute: { area: DataRange; compute: DataRange };
  powerComputeFrontier: { power: DataRange; compute: DataRange };
}

/**
 * Get data ranges for all charts
 */
export function getChartDataRanges(scenarioKey: ScenarioKey = "BASELINE"): ChartDataRanges {
  const entries = getDebugStateEntries(scenarioKey).sort((a, b) => a.year - b.year);
  
  // 1. Compute over time Class A/B
  const computeAValues = entries.map(e => (e.classA_compute_raw ?? 0) / 1e15); // PFLOPs
  const computeBValues = entries.map(e => (e.classB_compute_raw ?? 0) / 1e15); // PFLOPs
  
  // 2. Power vs Compute Class A/B
  const powerAValues = entries.map(e => (e.classA_power_kw ?? 0)); // kW
  const powerBValues = entries.map(e => (e.classB_power_kw ?? 0)); // kW
  const computeAForPower = entries.map(e => (e.classA_compute_raw ?? 0) / 1e15); // PFLOPs
  const computeBForPower = entries.map(e => (e.classB_compute_raw ?? 0) / 1e15); // PFLOPs
  
  // 3. Radiator Area vs Compute
  const radiatorSeries = buildRadiatorComputeSeries(scenarioKey);
  const radiatorAreaValues = radiatorSeries.map(p => p.radiatorAreaM2); // m²
  const radiatorComputeValues = radiatorSeries.map(p => p.computePFlops); // PFLOPs
  
  // 4. Power Compute Frontier
  const frontierSeries = buildPowerComputeFrontier(entries);
  const frontierPowerValues = frontierSeries.map(p => p.powerMw); // MW
  const frontierComputeValues = frontierSeries.map(p => p.computePFlops); // PFLOPs
  
  return {
    computeOverTimeClassA: {
      min: Math.min(...computeAValues.filter(v => v > 0)),
      max: Math.max(...computeAValues),
      values: computeAValues,
    },
    computeOverTimeClassB: {
      min: Math.min(...computeBValues.filter(v => v > 0)),
      max: Math.max(...computeBValues),
      values: computeBValues,
    },
    powerVsComputeClassA: {
      power: {
        min: Math.min(...powerAValues.filter(v => v > 0)),
        max: Math.max(...powerAValues),
        values: powerAValues,
      },
      compute: {
        min: Math.min(...computeAForPower.filter(v => v > 0)),
        max: Math.max(...computeAForPower),
        values: computeAForPower,
      },
    },
    powerVsComputeClassB: {
      power: {
        min: Math.min(...powerBValues.filter(v => v > 0)),
        max: Math.max(...powerBValues),
        values: powerBValues,
      },
      compute: {
        min: Math.min(...computeBForPower.filter(v => v > 0)),
        max: Math.max(...computeBForPower),
        values: computeBForPower,
      },
    },
    radiatorAreaVsCompute: {
      area: {
        min: Math.min(...radiatorAreaValues.filter(v => v > 0)),
        max: Math.max(...radiatorAreaValues),
        values: radiatorAreaValues,
      },
      compute: {
        min: Math.min(...radiatorComputeValues.filter(v => v > 0)),
        max: Math.max(...radiatorComputeValues),
        values: radiatorComputeValues,
      },
    },
    powerComputeFrontier: {
      power: {
        min: Math.min(...frontierPowerValues.filter(v => v > 0)),
        max: Math.max(...frontierPowerValues),
        values: frontierPowerValues,
      },
      compute: {
        min: Math.min(...frontierComputeValues.filter(v => v > 0)),
        max: Math.max(...frontierComputeValues),
        values: frontierComputeValues,
      },
    },
  };
}

/**
 * Format data ranges for console output
 */
export function formatChartDataRanges(ranges: ChartDataRanges): string {
  let output = "=== CHART DATA RANGES ===\n\n";
  
  output += "1. COMPUTE OVER TIME CLASS A/B\n";
  output += `   Class A Compute: ${ranges.computeOverTimeClassA.min.toExponential(2)} - ${ranges.computeOverTimeClassA.max.toExponential(2)} PFLOPs\n`;
  output += `   Class B Compute: ${ranges.computeOverTimeClassB.min.toExponential(2)} - ${ranges.computeOverTimeClassB.max.toExponential(2)} PFLOPs\n`;
  output += `   Years: 2025-2040 (16 data points)\n\n`;
  
  output += "2. POWER VS COMPUTE CLASS A/B\n";
  output += `   Class A Power: ${ranges.powerVsComputeClassA.power.min.toFixed(2)} - ${ranges.powerVsComputeClassA.power.max.toFixed(2)} kW\n`;
  output += `   Class A Compute: ${ranges.powerVsComputeClassA.compute.min.toExponential(2)} - ${ranges.powerVsComputeClassA.compute.max.toExponential(2)} PFLOPs\n`;
  output += `   Class B Power: ${ranges.powerVsComputeClassB.power.min.toFixed(2)} - ${ranges.powerVsComputeClassB.power.max.toFixed(2)} kW\n`;
  output += `   Class B Compute: ${ranges.powerVsComputeClassB.compute.min.toExponential(2)} - ${ranges.powerVsComputeClassB.compute.max.toExponential(2)} PFLOPs\n\n`;
  
  output += "3. RADIATOR AREA VS COMPUTE\n";
  output += `   Radiator Area: ${ranges.radiatorAreaVsCompute.area.min.toFixed(2)} - ${ranges.radiatorAreaVsCompute.area.max.toFixed(2)} m²\n`;
  output += `   Compute: ${ranges.radiatorAreaVsCompute.compute.min.toExponential(2)} - ${ranges.radiatorAreaVsCompute.compute.max.toExponential(2)} PFLOPs\n\n`;
  
  output += "4. POWER COMPUTE FRONTIER\n";
  output += `   Power: ${ranges.powerComputeFrontier.power.min.toFixed(2)} - ${ranges.powerComputeFrontier.power.max.toFixed(2)} MW\n`;
  output += `   Compute: ${ranges.powerComputeFrontier.compute.min.toExponential(2)} - ${ranges.powerComputeFrontier.compute.max.toExponential(2)} PFLOPs\n\n`;
  
  // Add sample values for each chart
  output += "=== SAMPLE VALUES (First 5 years) ===\n\n";
  
  output += "1. Compute Over Time Class A/B:\n";
  output += "   Year | Class A (PFLOPs) | Class B (PFLOPs)\n";
  output += "   -----|------------------|------------------\n";
  for (let i = 0; i < Math.min(5, ranges.computeOverTimeClassA.values.length); i++) {
    const year = 2025 + i;
    output += `   ${year}  | ${ranges.computeOverTimeClassA.values[i].toExponential(2).padStart(16)} | ${ranges.computeOverTimeClassB.values[i].toExponential(2).padStart(16)}\n`;
  }
  output += "\n";
  
  output += "2. Power vs Compute Class A/B:\n";
  output += "   Year | Class A Power (kW) | Class A Compute (PFLOPs) | Class B Power (kW) | Class B Compute (PFLOPs)\n";
  output += "   -----|-------------------|-------------------------|-------------------|-------------------------\n";
  for (let i = 0; i < Math.min(5, ranges.powerVsComputeClassA.power.values.length); i++) {
    const year = 2025 + i;
    output += `   ${year}  | ${ranges.powerVsComputeClassA.power.values[i].toFixed(2).padStart(17)} | ${ranges.powerVsComputeClassA.compute.values[i].toExponential(2).padStart(23)} | ${ranges.powerVsComputeClassB.power.values[i].toFixed(2).padStart(17)} | ${ranges.powerVsComputeClassB.compute.values[i].toExponential(2).padStart(23)}\n`;
  }
  output += "\n";
  
  output += "3. Radiator Area vs Compute:\n";
  output += "   Year | Radiator Area (m²) | Compute (PFLOPs)\n";
  output += "   -----|-------------------|------------------\n";
  for (let i = 0; i < Math.min(5, ranges.radiatorAreaVsCompute.area.values.length); i++) {
    const year = 2025 + i;
    output += `   ${year}  | ${ranges.radiatorAreaVsCompute.area.values[i].toFixed(2).padStart(17)} | ${ranges.radiatorAreaVsCompute.compute.values[i].toExponential(2).padStart(16)}\n`;
  }
  output += "\n";
  
  output += "4. Power Compute Frontier:\n";
  output += "   Year | Power (MW) | Compute (PFLOPs)\n";
  output += "   -----|------------|------------------\n";
  for (let i = 0; i < Math.min(5, ranges.powerComputeFrontier.power.values.length); i++) {
    const year = 2025 + i;
    output += `   ${year}  | ${ranges.powerComputeFrontier.power.values[i].toFixed(2).padStart(10)} | ${ranges.powerComputeFrontier.compute.values[i].toExponential(2).padStart(16)}\n`;
  }
  
  return output;
}

