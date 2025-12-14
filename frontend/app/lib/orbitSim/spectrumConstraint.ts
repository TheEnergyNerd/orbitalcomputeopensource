/**
 * Spectrum / Downlink Bandwidth Constraint
 * 
 * Per Anno feedback: "You probably also aren't accounting for spectrum limits.
 * There's only so much bandwidth you have from sat to ground."
 * 
 * Even with laser inter-satellite links, all data must eventually downlink to Earth.
 * RF spectrum is finite (ITU allocated), shared (interference), and ground station limited.
 */

export interface SpectrumConstraint {
  groundStationBandwidthGbps: number;  // per station, current tech
  maxGroundStations: number;            // realistic global deployment
  groundStationUtilization: number;     // weather, maintenance (85-95% uptime)
  spectrumEfficiencyBitsPerHz: number; // realistic for satellite
  allocatedSpectrumMHz: number;        // Ka + V band allocation
}

export const SPECTRUM_DEFAULTS: SpectrumConstraint = {
  groundStationBandwidthGbps: 100,      // per station, current tech
  maxGroundStations: 50,                 // realistic global deployment
  groundStationUtilization: 0.85,        // 85% uptime (weather, maintenance)
  spectrumEfficiencyBitsPerHz: 4,        // realistic for satellite
  allocatedSpectrumMHz: 2000,            // Ka + V band allocation
};

/**
 * Calculate maximum downlink capacity (Tbps)
 * Accounts for:
 * - Ground station count (grows over time)
 * - Bandwidth per station (improves over time)
 * - Utilization (weather, maintenance)
 * - Regional spectrum penalty (15% for ITU regulatory overhead, GEO avoidance)
 */
export function calculateDownlinkCapacity(
  year: number,
  config: SpectrumConstraint = SPECTRUM_DEFAULTS
): number {
  // Ground station capacity grows over time (more stations, better tech)
  const stationGrowth = Math.min(
    config.maxGroundStations,
    20 + (year - 2025) * 3 // Start with 20, add 3/year
  );
  
  const bandwidthGrowth = config.groundStationBandwidthGbps * 
    Math.pow(1.1, year - 2025); // 10% improvement per year
  
  const totalDownlinkGbps = stationGrowth * 
    bandwidthGrowth * 
    config.groundStationUtilization;
  
  const totalDownlinkTbps = totalDownlinkGbps / 1000;
  
  // Regional spectrum penalty - different countries have different rules
  // (NA vs Africa vs Europe have different ITU allocations)
  // Also accounts for GEO avoidance requirements (can't interfere with GEO sats)
  const SPECTRUM_REGIONAL_PENALTY = 0.85; // 15% reduction for regulatory overhead
  
  return totalDownlinkTbps * SPECTRUM_REGIONAL_PENALTY;
}

/**
 * Apply spectrum constraint to compute
 * If bandwidth needed > capacity, derate exportable compute
 */
export function applySpectrumConstraint(
  effectiveComputePFLOPs: number,
  year: number,
  config: SpectrumConstraint = SPECTRUM_DEFAULTS
): {
  exportableComputePFLOPs: number;
  spectrumDerating: number;
  spectrumConstrained: boolean;
  downlinkCapacityTbps: number;
  downlinkUsedTbps: number;
  downlinkUtilizationPercent: number;
} {
  const maxDownlinkTbps = calculateDownlinkCapacity(year, config);
  
  // Calculate bandwidth needed for compute export
  // Rough model: 1 PFLOP of inference ≈ 0.001 Tbps of results
  // (this varies wildly by workload - inference vs training)
  const TBPS_PER_PFLOP = 0.001; // Conservative: 1 Gbps per PFLOP
  
  const bandwidthNeededTbps = effectiveComputePFLOPs * TBPS_PER_PFLOP;
  
  const downlinkUsedTbps = Math.min(bandwidthNeededTbps, maxDownlinkTbps);
  const downlinkUtilizationPercent = maxDownlinkTbps > 0
    ? Math.min(100, (bandwidthNeededTbps / maxDownlinkTbps) * 100)
    : 0;
  
  // If bandwidth constrained, cap useful compute
  if (bandwidthNeededTbps > maxDownlinkTbps) {
    const spectrumDerating = maxDownlinkTbps / bandwidthNeededTbps;
    
    const exportableComputePFLOPs = effectiveComputePFLOPs * spectrumDerating;
    
    return {
      exportableComputePFLOPs,
      spectrumDerating,
      spectrumConstrained: true,
      downlinkCapacityTbps: maxDownlinkTbps,
      downlinkUsedTbps,
      downlinkUtilizationPercent,
    };
  } else {
    return {
      exportableComputePFLOPs: effectiveComputePFLOPs,
      spectrumDerating: 1.0,
      spectrumConstrained: false,
      downlinkCapacityTbps: maxDownlinkTbps,
      downlinkUsedTbps,
      downlinkUtilizationPercent,
    };
  }
}

/**
 * Workload-specific bandwidth requirements
 * Different use cases have very different bandwidth needs
 */
export const BANDWIDTH_BY_WORKLOAD = {
  // Inference: small inputs, small outputs
  inference_llm: 0.0001,      // 0.1 Gbps per PFLOP
  inference_image: 0.001,   // 1 Gbps per PFLOP
  
  // Training: huge gradient syncs
  training_distributed: 0.1,  // 100 Gbps per PFLOP (!)
  
  // Edge processing: process in orbit, send summaries
  earth_observation: 0.01,    // 10 Gbps per PFLOP
  
  // Batch jobs: results can wait, trickle down
  batch_scientific: 0.0001,   // 0.1 Gbps per PFLOP
};

// For orbital compute, inference and batch are viable
// Training in orbit is probably NOT viable due to bandwidth

