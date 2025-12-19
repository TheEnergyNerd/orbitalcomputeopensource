/**
 * Networking/Interconnect Scaling Model
 * 
 * Scales networking costs and power with required throughput (Gbps/PFLOP).
 */

export interface NetworkingScalingParams {
  requiredGbpsPerPflop: number; // Required bandwidth per PFLOP
  totalPflops: number; // Total PFLOPs in system
  workloadType: 'inference' | 'training';
  location: 'ground' | 'orbital';
  year: number;
}

export interface NetworkingScalingResult {
  networkCostPerPflopYear: number;
  networkPowerKw: number;
  debug: {
    requiredGbpsPerPflop: number;
    totalGbps: number;
    networkCostPerPflopYear: number;
    networkPowerKw: number;
    networkPowerWPerGbps: number;
  };
}

// Networking requirements by workload type
const NETWORKING_REQUIREMENTS: Record<'inference' | 'training', { gbpsPerPflop: number }> = {
  inference: {
    gbpsPerPflop: 0.1, // 100 Mbps per PFLOP for inference (lower bandwidth)
  },
  training: {
    gbpsPerPflop: 1.0, // 1 Gbps per PFLOP for training (higher bandwidth)
  },
};

// Cost per Gbps-year by location
const COST_PER_GBPS_YEAR: Record<'ground' | 'orbital', (year: number) => number> = {
  ground: (year: number) => {
    const baseCost = 10_000; // $10k/Gbps-year base
    const yearsFrom2025 = year - 2025;
    const learningFactor = Math.pow(0.95, yearsFrom2025); // 5% annual reduction
    return baseCost * learningFactor;
  },
  orbital: (year: number) => {
    const baseCost = 50_000; // $50k/Gbps-year base (higher due to ground stations, spectrum)
    const yearsFrom2025 = year - 2025;
    const learningFactor = Math.pow(0.90, yearsFrom2025); // 10% annual reduction (faster learning)
    return baseCost * learningFactor;
  },
};

// Power per Gbps (W)
const POWER_PER_GBPS = 0.5; // 0.5 W per Gbps

/**
 * Calculate networking costs and power based on required throughput
 */
export function calculateNetworkingScaling(
  params: NetworkingScalingParams
): NetworkingScalingResult {
  const {
    requiredGbpsPerPflop,
    totalPflops,
    workloadType,
    location,
    year,
  } = params;
  
  // Get workload-specific requirement if not provided
  const effectiveGbpsPerPflop = requiredGbpsPerPflop || 
    NETWORKING_REQUIREMENTS[workloadType].gbpsPerPflop;
  
  // Total bandwidth required
  const totalGbps = effectiveGbpsPerPflop * totalPflops;
  
  // Cost per Gbps-year
  const costPerGbpsYear = COST_PER_GBPS_YEAR[location](year);
  
  // Total networking cost per year
  const totalNetworkCostPerYear = totalGbps * costPerGbpsYear;
  
  // Network cost per PFLOP-year
  const networkCostPerPflopYear = totalNetworkCostPerYear / totalPflops;
  
  // Network power (deducts from compute power budget)
  const networkPowerW = totalGbps * POWER_PER_GBPS;
  const networkPowerKw = networkPowerW / 1000;
  
  return {
    networkCostPerPflopYear,
    networkPowerKw,
    debug: {
      requiredGbpsPerPflop: effectiveGbpsPerPflop,
      totalGbps,
      networkCostPerPflopYear,
      networkPowerKw,
      networkPowerWPerGbps: POWER_PER_GBPS,
    },
  };
}


