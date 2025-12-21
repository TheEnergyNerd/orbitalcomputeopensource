/**
 * SLA Definitions and Pricing
 * 
 * Comprehensive SLA tiers with real-world benchmarks and orbital-specific considerations.
 */

export type SLATier = 'basic' | 'standard' | 'premium';

export interface SLADefinition {
  tier: SLATier;
  
  availabilityTarget: number;
  maxDowntimeHoursPerMonth: number;
  plannedMaintenanceHoursMonth: number;
  
  maxLatencyMs: number;
  guaranteedBandwidthGbps: number;
  burstBandwidthGbps: number;
  
  maxRecoveryTimeMinutes: number;
  rpoMinutes: number;
  
  creditPerViolationPct: number;
  maxCreditPct: number;
  
  excludedEvents: string[];
  
  redundancyOverhead: number;
  riskBuffer: number;
}

export const SLA_DEFINITIONS: Record<SLATier, SLADefinition> = {
  basic: {
    tier: 'basic',
    availabilityTarget: 0.99,
    maxDowntimeHoursPerMonth: 7.3,
    plannedMaintenanceHoursMonth: 4,
    maxLatencyMs: 100,
    guaranteedBandwidthGbps: 1,
    burstBandwidthGbps: 10,
    maxRecoveryTimeMinutes: 60,
    rpoMinutes: 60,
    creditPerViolationPct: 10,
    maxCreditPct: 30,
    excludedEvents: ['solar_storm', 'debris_avoidance', 'planned_maintenance', 'force_majeure'],
    redundancyOverhead: 1.10,
    riskBuffer: 0.01,
  },
  standard: {
    tier: 'standard',
    availabilityTarget: 0.999,
    maxDowntimeHoursPerMonth: 0.73,
    plannedMaintenanceHoursMonth: 1,
    maxLatencyMs: 50,
    guaranteedBandwidthGbps: 10,
    burstBandwidthGbps: 100,
    maxRecoveryTimeMinutes: 15,
    rpoMinutes: 15,
    creditPerViolationPct: 25,
    maxCreditPct: 50,
    excludedEvents: ['solar_storm', 'force_majeure'],
    redundancyOverhead: 1.15,
    riskBuffer: 0.005,
  },
  premium: {
    tier: 'premium',
    availabilityTarget: 0.9999,
    maxDowntimeHoursPerMonth: 0.073,
    plannedMaintenanceHoursMonth: 0.5,
    maxLatencyMs: 20,
    guaranteedBandwidthGbps: 100,
    burstBandwidthGbps: 400,
    maxRecoveryTimeMinutes: 5,
    rpoMinutes: 1,
    creditPerViolationPct: 50,
    maxCreditPct: 100,
    excludedEvents: ['force_majeure'],
    redundancyOverhead: 1.20,
    riskBuffer: 0.001,
  },
};

export const CLOUD_BENCHMARKS = {
  aws_p5: {
    provider: 'AWS',
    instance: 'p5.48xlarge (H100)',
    availabilitySla: 0.9999,
    pricePerHour: 98.32,
    networkGbps: 3200,
    notes: 'On-demand pricing, 8x H100',
  },
  gcp_a3: {
    provider: 'Google Cloud',
    instance: 'a3-highgpu-8g (H100)',
    availabilitySla: 0.999,
    pricePerHour: 80.00,
    networkGbps: 1600,
    notes: 'On-demand pricing, 8x H100',
  },
  lambda_h100: {
    provider: 'Lambda Labs',
    instance: '1x H100',
    availabilitySla: 0.995,
    pricePerHour: 2.49,
    networkGbps: 200,
    notes: 'Spot-like availability, single GPU',
  },
  coreweave_h100: {
    provider: 'CoreWeave',
    instance: '1x H100 SXM',
    availabilitySla: 0.999,
    pricePerHour: 4.25,
    networkGbps: 400,
    notes: 'Reserved pricing',
  },
};

export const ORBITAL_SLA_FACTORS = {
  eclipse: {
    description: 'LEO satellites spend ~35 min in shadow per 90-min orbit',
    mitigation: 'Batteries maintain compute through eclipse',
    impactOnAvailability: 0,
    costImpact: 'Included in battery mass/cost',
  },
  groundStationCoverage: {
    description: 'Continuous connectivity requires ground station mesh',
    mitigation: 'Inter-satellite links (ISL) + distributed ground stations',
    coverageByConfig: {
      '5_stations': 0.60,
      '20_stations': 0.95,
      'isl_mesh': 0.99,
    },
    costImpact: 'Included in networking costs',
  },
  debrisAvoidance: {
    description: 'Occasional collision avoidance maneuvers',
    frequency: '1-5 per satellite per year',
    duration: '< 1 hour per event',
    impactOnAvailability: 0.001,
    mitigation: 'Scheduled during low-demand periods',
  },
  solarStorms: {
    description: 'Geomagnetic storms can increase radiation, disrupt comms',
    frequency: '~10 significant events per solar cycle (11 years)',
    impactOnAvailability: 0.002,
    mitigation: 'Safe mode, ground backup for critical workloads',
    slaExclusion: true,
  },
  radiationEffects: {
    description: 'Single-event upsets (SEU) cause bit flips',
    mitigation: 'ECC memory, TMR for critical systems',
    impactOnCompute: 0.05,
    impactOnAvailability: 0.001,
  },
};

export function calculateGpuHourPrice(
  baseCostPerGpuHour: number,
  slaTier: SLADefinition,
  margin: number = 0.15
): {
  pricePerGpuHour: number;
  breakdown: {
    baseCost: number;
    redundancyCost: number;
    riskBufferCost: number;
    margin: number;
  };
} {
  const redundancyCost = baseCostPerGpuHour * (slaTier.redundancyOverhead - 1);
  const riskBufferCost = baseCostPerGpuHour * slaTier.riskBuffer;
  const subtotal = baseCostPerGpuHour + redundancyCost + riskBufferCost;
  const marginCost = subtotal * margin;
  const total = subtotal + marginCost;
  
  return {
    pricePerGpuHour: total,
    breakdown: {
      baseCost: baseCostPerGpuHour,
      redundancyCost,
      riskBufferCost,
      margin: marginCost,
    },
  };
}


