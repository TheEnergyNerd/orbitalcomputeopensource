import { create } from "zustand";

// Types matching the new SimState contract
export type Satellite = {
  id: string;
  lat: number;
  lon: number;
  alt_km: number;
  sunlit: boolean;
  utilization: number; // 0–1 compute availability
  capacityMw: number;
  nearestGatewayId: string;
  latencyMs: number;
};

export type GroundSite = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  powerMw: number;
  coolingMw: number;
  jobsRunning: number;
  carbonIntensity: number; // kgCO2/MWh
  energyPrice: number; // $/MWh
  type?: "data_center" | "launch_site"; // Type of ground site
};

export type Workload = {
  jobsPending: number;
  jobsRunningOrbit: number;
  jobsRunningGround: number;
  jobsCompleted: number;
};

export type Metrics = {
  totalGroundPowerMw: number;
  totalOrbitalPowerMw: number;
  avgLatencyMs: number;
  orbitSharePercent: number;
  totalJobsRunning: number;
  energyCostGround: number;
  energyCostOrbit: number;
  carbonGround: number;
  carbonOrbit: number;
};

export type SimState = {
  time: string;
  satellites: Satellite[];
  groundSites: GroundSite[];
  workload: Workload;
  metrics: Metrics;
  events: string[]; // commentary strings
};

export type Scenario = "normal" | "price_spike" | "solar_storm" | "fiber_cut";

interface SimStore {
  state: SimState | null;
  loading: boolean;
  error: string | null;
  selectedEntity: { type: "satellite" | "ground"; id: string } | null;
  scenario: Scenario;
  orbitOffloadPercent: number; // 0-100
  performanceMode: boolean; // If true, limit displayed satellites for performance
  setState: (state: SimState) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedEntity: (entity: { type: "satellite" | "ground"; id: string } | null) => void;
  setScenario: (scenario: Scenario) => void;
  setOrbitOffloadPercent: (percent: number) => void;
  setPerformanceMode: (enabled: boolean) => void;
}

export const useSimStore = create<SimStore>((set) => ({
  state: null,
  loading: false, // Start as false - new OrbitSim doesn't need backend
  error: null,
  selectedEntity: null,
  scenario: "normal",
  orbitOffloadPercent: 30,
  performanceMode: true, // Default to performance mode (limit to 500 satellites)
  setState: (state) => set({ state }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  setScenario: (scenario) => set({ scenario }),
  setOrbitOffloadPercent: (percent) => set({ orbitOffloadPercent: percent }),
  setPerformanceMode: (enabled) => set({ performanceMode: enabled }),
}));

