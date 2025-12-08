import { ConstellationParams, ConstellationMetrics } from "./constellationTypes";

export type ConstellationMode = "latency" | "capacity" | "resilience";

export function aiDesignConstellation(mode: ConstellationMode): ConstellationParams {
  if (mode === "latency") {
    return { shells: [{ altitudeKm: 500, planes: 8, satsPerPlane: 25 }] };
  }
  if (mode === "capacity") {
    return { shells: [{ altitudeKm: 900, planes: 16, satsPerPlane: 40 }] };
  }
  return { shells: [
    { altitudeKm: 600, planes: 8, satsPerPlane: 20 },
    { altitudeKm: 1200, planes: 6, satsPerPlane: 30 },
  ]};
}

export function evalConstellation(
  params: ConstellationParams,
): ConstellationMetrics {
  let totalSats = 0;
  let weightedAlt = 0;

  for (const s of params.shells) {
    const sats = s.planes * s.satsPerPlane;
    totalSats += sats;
    weightedAlt += sats * s.altitudeKm;
  }

  if (totalSats === 0) {
    return { latencyMs: 120, capacityUnits: 0, redundancyScore: 0 };
  }

  const avgAlt = weightedAlt / totalSats;

  // Simplified latency: lower altitude = lower latency
  const latencyMs = 20 + (avgAlt / 2000) * 60; // ~20–80ms

  // Capacity: more sats = more capacity, sublinear
  const capacityUnits = Math.pow(totalSats, 0.8);

  // Redundancy: more planes and shells → more resilient
  const totalPlanes = params.shells.reduce((acc, s) => acc + s.planes, 0);
  const redundancyScore = Math.min(1, totalPlanes / 40);

  return { latencyMs, capacityUnits, redundancyScore };
}

