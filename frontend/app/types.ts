// Type definitions matching backend Pydantic models

export type OrbitalNode = {
  id: string;
  lat: number;
  lon: number;
  alt_km: number;
  sunlit: boolean;
  utilization: number; // 0–1
  powerMw: number;
  jobsRunning: number;
};

export type GroundSite = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  powerMw: number;
  coolingMw: number;
  jobsRunning: number;
  energyPricePerMwh: number;
  carbonKgPerMwh: number;
};

export type LinkMetric = {
  fromId: string;
  toId: string;
  latencyMs: number;
  bandwidthGbps: number;
};

export type SimMetrics = {
  totalGroundPowerMw: number;
  totalOrbitalPowerMw: number;
  avgLatencyMs: number;
  orbitSharePercent: number;
  totalJobsRunning: number;
  avgEnergyPricePerMwh: number;
  avgCarbonKgPerMwh: number;
};

export type Scenario = {
  mode: "normal" | "price_spike" | "solar_storm" | "fiber_cut";
  orbitOffloadPercent: number;
};

export type SimState = {
  time: string; // ISO
  tick: number;
  satellites: OrbitalNode[];
  orbitalHubs: OrbitalNode[];
  groundSites: GroundSite[];
  links: LinkMetric[];
  metrics: SimMetrics;
  scenario: Scenario;
  lastEvents: string[];
};

