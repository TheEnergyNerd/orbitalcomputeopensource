export interface ConstellationParams {
  shells: {
    altitudeKm: number;   // 500, 1200, etc
    planes: number;       // 4–24
    satsPerPlane: number; // 10–60
  }[];
}

export interface ConstellationMetrics {
  latencyMs: number;          // effective orbital latency
  capacityUnits: number;      // total compute capacity unit
  redundancyScore: number;    // 0–1
}


