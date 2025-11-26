/**
 * Core data model matching the specification
 * Shared between frontend and backend
 */

export type RegionId = string;
export type NodeId = string;

export type WorkloadType = "ai_inference" | "video" | "blockchain";

export type SimulatorPhase = 
  | "PHASE_0_REALITY" 
  | "PHASE_1_GROUND" 
  | "PHASE_2_FALTER" 
  | "PHASE_3_ORBIT" 
  | "WHY_ORBIT" 
  | "SANDBOX";

export interface GroundSite {
  id: NodeId;
  name: string;
  lat: number;
  lon: number;
  capacityMW: number;
  baseLatencyMs: number;        // local latency baseline
  energyPricePerMWh: number;    // $/MWh
  carbonKgPerMWh: number;       // kgCO2/MWh
  activeJobs: number;
}

export interface OrbitalNode {
  id: NodeId;
  tleLine1: string;
  tleLine2: string;
  lat: number;
  lon: number;
  altKm: number;
  capacityMW: number;
  utilization: number;          // 0–1
  isSunlit: boolean;
  gatewaySiteId: NodeId;         // ground site used as gateway
  latencyMsToGateway: number;
}

export interface WorkloadProfile {
  type: WorkloadType;
  demandMW: number;             // total compute demand
  orbitShare: number;           // 0–1 fraction routed to orbit
}

export interface SystemMetrics {
  avgLatencyMs: number;
  totalEnergyCostUSD: number;
  totalCarbonKgPerMWh: number;
  orbitSharePercent: number;    // % of workloads satisfied in orbit
}

export interface SystemState {
  timestamp: string;
  phase: SimulatorPhase;
  groundSites: GroundSite[];
  orbitalNodes: OrbitalNode[];
  workloads: WorkloadProfile[];
  metrics: SystemMetrics;
}

// Compatibility layer - map old types to new
export function mapLegacyStateToSystemState(legacy: any): SystemState {
  return {
    timestamp: legacy.time || new Date().toISOString(),
    phase: "SANDBOX", // Default for now
    groundSites: (legacy.groundSites || []).map((site: any) => ({
      id: site.id,
      name: site.label || site.id,
      lat: site.lat,
      lon: site.lon,
      capacityMW: site.powerMw || 0,
      baseLatencyMs: 45, // Default
      energyPricePerMWh: site.energyPrice || 50,
      carbonKgPerMWh: site.carbonIntensity || 300,
      activeJobs: site.jobsRunning || 0,
    })),
    orbitalNodes: (legacy.satellites || []).map((sat: any) => ({
      id: sat.id,
      tleLine1: "",
      tleLine2: "",
      lat: sat.lat,
      lon: sat.lon,
      altKm: sat.alt_km,
      capacityMW: sat.capacityMw || 0,
      utilization: sat.utilization || 0,
      isSunlit: sat.sunlit || true,
      gatewaySiteId: sat.nearestGatewayId || "",
      latencyMsToGateway: sat.latencyMs || 0,
    })),
    workloads: [
      {
        type: "ai_inference",
        demandMW: legacy.workload?.jobsRunningGround ? legacy.workload.jobsRunningGround * 0.1 : 20,
        orbitShare: (legacy.metrics?.orbitSharePercent || 0) / 100,
      },
    ],
    metrics: {
      avgLatencyMs: legacy.metrics?.avgLatencyMs || 0,
      totalEnergyCostUSD: (legacy.metrics?.energyCostGround || 0) + (legacy.metrics?.energyCostOrbit || 0),
      totalCarbonKgPerMWh: (legacy.metrics?.carbonGround || 0) + (legacy.metrics?.carbonOrbit || 0),
      orbitSharePercent: legacy.metrics?.orbitSharePercent || 0,
    },
  };
}

