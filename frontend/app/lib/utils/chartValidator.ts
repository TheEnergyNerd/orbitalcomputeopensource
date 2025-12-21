/**
 * Chart Data Validator
 * 
 * Validates that exported data has required paths for each chart.
 * Used to catch missing data early and provide helpful error messages.
 */

export interface ChartContract {
  chartName: string;
  requiredPaths: string[];
  optionalPaths?: string[];
}

export interface ValidationResult {
  valid: boolean;
  missingPaths: string[];
  nearestPath?: string;
  scenarioId?: string;
  year?: number;
  chartName?: string; // Name of the chart being validated
}

/**
 * Chart contracts - defines what data each chart needs
 */
export const CHART_CONTRACTS: ChartContract[] = [
  {
    chartName: 'GPU-Hour Pricing',
    requiredPaths: [
      'orbit.gpuHourPricing.standard.pricePerGpuHour',
      'ground.gpuHourPricing.standard.pricePerGpuHour',
    ],
  },
  {
    chartName: 'Ground Buildout Constraints',
    requiredPaths: [
      'ground.buildoutDebug.demandGW',
      'ground.buildoutDebug.buildRateGWyr',
      'ground.buildoutDebug.backlogGW',
      'ground.buildoutDebug.timeToPowerYears',
    ],
    optionalPaths: [
      'ground.buildoutDebug.demandNewGW',
      'ground.buildoutDebug.capacityGW',
      'ground.buildoutDebug.pipelineGW',
    ],
  },
  {
    chartName: 'Power Buildout',
    requiredPaths: [
      'ground.buildoutDebug.demandGW',
      'ground.supplyMetrics.maxBuildRateGwYear',
      'ground.backlogGw',
      'ground.avgWaitYears',
    ],
  },
];

/**
 * Get value at a nested path (e.g., "orbit.gpuHourPricing.standard.pricePerGpuHour")
 */
function getValueAtPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Find nearest valid path when a required path is missing
 */
function findNearestPath(obj: any, missingPath: string): string | undefined {
  const parts = missingPath.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const partialPath = parts.slice(0, i).join('.');
    const value = getValueAtPath(obj, partialPath);
    if (value !== null && value !== undefined) {
      return partialPath;
    }
  }
  return undefined;
}

/**
 * Validate a single data point against a chart contract
 */
export function validateChartData(
  data: any,
  contract: ChartContract,
  scenarioId?: string,
  year?: number
): ValidationResult {
  const missingPaths: string[] = [];
  
  for (const path of contract.requiredPaths) {
    const value = getValueAtPath(data, path);
    // Treat 0 as valid (it is), but keep NaN/undefined invalid
    if (value === null || value === undefined || (!isFinite(value) && value !== 0)) {
      missingPaths.push(path);
    }
  }
  
  const nearestPath = missingPaths.length > 0 
    ? findNearestPath(data, missingPaths[0])
    : undefined;
  
  return {
    valid: missingPaths.length === 0,
    missingPaths,
    nearestPath,
    scenarioId,
    year,
    chartName: contract.chartName,
  };
}

/**
 * Validate all chart contracts for a data point
 */
export function validateAllCharts(
  data: any,
  scenarioId?: string,
  year?: number
): ValidationResult[] {
  return CHART_CONTRACTS.map(contract => 
    validateChartData(data, contract, scenarioId, year)
  );
}

/**
 * Ensure ground data is always present (even if orbital is infeasible)
 */
export function ensureGroundData(data: any): any {
  // If ground is missing entirely, create a minimal structure
  if (!data.ground) {
    data.ground = {};
  }
  
  // Ensure gpuHourPricing exists and has all SLA tiers
  if (!data.ground.gpuHourPricing) {
    data.ground.gpuHourPricing = {};
  }
  
  // Always create all SLA tiers if missing
  for (const k of ['basic', 'standard', 'premium'] as const) {
    if (!data.ground.gpuHourPricing[k]) {
      data.ground.gpuHourPricing[k] = { 
        pricePerGpuHour: 0, 
        costBreakdown: {} 
      };
    }
  }
  
  // If ground was missing entirely, also create other required fields
  if (!data.ground.totalCostPerPflopYear && data.ground.totalCostPerPflopYear !== 0) {
    data.ground.totalCostPerPflopYear = 0;
  }
  
  if (!data.ground.tokenPricing) {
    data.ground.tokenPricing = {
      llama70B: { costPer1kTokens: 0 },
      llama405B: { costPer1kTokens: 0 },
    };
  }
  
  if (!data.ground.buildoutDebug) {
    data.ground.buildoutDebug = {
      demandGW: 0,
      buildRateGWyr: 0,
    };
  }
  
  if (data.ground.backlogGw === undefined && data.ground.backlogGw !== 0) {
    data.ground.backlogGw = 0;
  }
  
  if (data.ground.avgWaitYears === undefined && data.ground.avgWaitYears !== 0) {
    data.ground.avgWaitYears = 0;
  }
  
  if (!data.ground.supplyMetrics) {
    data.ground.supplyMetrics = {
      maxBuildRateGwYear: 0,
    };
  }
  
  // Ensure buildoutDebug exists
  if (!data.ground.buildoutDebug) {
    data.ground.buildoutDebug = {
      demandGW: data.ground.supplyMetrics?.demandGw ?? 0,
      buildRateGWyr: data.ground.supplyMetrics?.maxBuildRateGwYear ?? 0,
      demandNewGW: 0,
      capacityGW: data.ground.supplyMetrics?.capacityGw ?? 0,
      pipelineGW: data.ground.supplyMetrics?.pipelineGw ?? 0,
    };
  }
  
  // Normalize backlog + wait fields from multiple sources (fixes chart disappearing)
  const pb = data.metadata?.chartInputs?.powerBuildout;
  
  // FIX: Skip 0 values to allow fallback chain to continue to buildoutDebug
  const backlog =
    (data.ground.backlogGw !== undefined && data.ground.backlogGw > 0 ? data.ground.backlogGw : undefined) ??
    data.ground.buildoutDebug?.backlogGW ??
    data.ground.buildoutDebug?.backlogGw ??
    pb?.backlogGw ??
    0;
  
  const wait =
    data.ground.avgWaitYears ??
    data.ground.buildoutDebug?.timeToPowerYears ??
    data.ground.buildoutDebug?.avgWaitYears ??
    pb?.avgWaitYears ??
    0;
  
  // Normalize to required contract fields
  data.ground.backlogGw = backlog;
  data.ground.avgWaitYears = wait;
  
  // Normalize buildoutDebug names used by charts
  data.ground.buildoutDebug.backlogGW = data.ground.buildoutDebug.backlogGW ?? backlog;
  data.ground.buildoutDebug.timeToPowerYears = data.ground.buildoutDebug.timeToPowerYears ?? wait;
  
  // Ensure supplyMetrics exists
  if (!data.ground.supplyMetrics) {
    data.ground.supplyMetrics = {
      demandGw: data.ground.buildoutDebug?.demandGW ?? 0,
      capacityGw: data.ground.buildoutDebug?.capacityGW ?? 0,
      pipelineGw: data.ground.buildoutDebug?.pipelineGW ?? 0,
      maxBuildRateGwYear: data.ground.buildoutDebug?.buildRateGWyr ?? 0,
      avgWaitYears: wait,
      utilizationPct: 0,
    };
  }
  
  return data;
}

