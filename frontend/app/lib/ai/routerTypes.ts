export type JobTypeId = "realtime" | "interactive" | "batch" | "cold";

export type DestId = "groundEdge" | "groundCore" | "orbit";

export interface JobType {
  id: JobTypeId;
  label: string;
  latencySensitivity: number; // 0–1
  sizeUnits: number;          // abstract compute units per job
}

export interface Dest {
  id: DestId;
  label: string;
  baseCostPerUnit: number;
  baseLatencyMs: number;
  baseCarbonPerUnit: number;
}

export const JOB_TYPES: JobType[] = [
  { id: "realtime",    label: "Realtime",    latencySensitivity: 1.0, sizeUnits: 1 },
  { id: "interactive", label: "Interactive", latencySensitivity: 0.6, sizeUnits: 2 },
  { id: "batch",       label: "Batch",       latencySensitivity: 0.2, sizeUnits: 4 },
  { id: "cold",        label: "Cold",        latencySensitivity: 0.0, sizeUnits: 8 },
];

export const DESTS: Dest[] = [
  { id: "groundEdge", label: "Edge DCs",         baseCostPerUnit: 1.1, baseLatencyMs: 15,  baseCarbonPerUnit: 1.0 },
  { id: "groundCore", label: "Core Hyperscale",  baseCostPerUnit: 1.0, baseLatencyMs: 40,  baseCarbonPerUnit: 0.8 },
  { id: "orbit",      label: "Orbit",           baseCostPerUnit: 0.8, baseLatencyMs: 90,  baseCarbonPerUnit: 0.3 },
];

export interface RouterPolicy {
  // jobs[jobTypeId][destId] = probability
  jobs: Record<JobTypeId, Record<DestId, number>>;
}

export interface RouterWeights {
  cost: number;
  latency: number;
  carbon: number;
}

export const defaultPolicy: RouterPolicy = {
  jobs: {
    realtime:   { groundEdge: 0.7, groundCore: 0.2, orbit: 0.1 },
    interactive:{ groundEdge: 0.4, groundCore: 0.4, orbit: 0.2 },
    batch:      { groundEdge: 0.1, groundCore: 0.3, orbit: 0.6 },
    cold:       { groundEdge: 0.0, groundCore: 0.2, orbit: 0.8 },
  },
};


