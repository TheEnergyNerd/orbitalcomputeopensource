/**
 * AI Routing Line Geometry Logic
 * Every routing beam encodes four independent state variables
 */

export interface RoutingBeamState {
  thickness: number; // Traffic load
  color: string; // Policy bias
  speed: number; // Latency (inverse)
  jitter: number; // Congestion
}

export type PolicyType = "cost" | "latency" | "carbon" | "resilience" | "mixed";

/**
 * (A) Thickness = Traffic Load
 * thickness = base × log10(1 + Mbps)
 * Low traffic never invisible. Heavy traffic never cartoon-thick.
 */
export function calculateBeamThickness(trafficMbps: number, baseThickness: number = 1): number {
  // Thickness = base × log10(1 + Mbps)
  // Scale to visible range: 0.5 to 5.0
  const logFactor = Math.log10(1 + trafficMbps);
  const thickness = baseThickness * logFactor;
  // Clamp to visible range
  return Math.max(0.5, Math.min(5.0, thickness));
}

/**
 * (B) Color = Policy Bias
 * Policy → Hue mapping
 */
export function getPolicyColor(policy: PolicyType, mixRatio?: number): string {
  const policyColors: Record<PolicyType, string> = {
    cost: "#4a90e2", // Blue
    latency: "#00ffff", // Cyan
    carbon: "#00ff00", // Green
    resilience: "#bd10e0", // Purple
    mixed: "#ffffff", // White (will be interpolated)
  };
  
  if (policy === "mixed" && mixRatio !== undefined) {
    // Interpolate between policies based on mix ratio
    // For now, use weighted average of colors
    return policyColors.latency; // Default to cyan for mixed
  }
  
  return policyColors[policy] || policyColors.latency;
}

/**
 * Interpolate between two colors
 */
function interpolateColor(color1: string, color2: string, t: number): string {
  // Simple RGB interpolation
  const hex1 = color1.replace("#", "");
  const hex2 = color2.replace("#", "");
  
  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);
  
  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);
  
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * (C) Animation Speed = Latency (inverse)
 * speed = k / total_path_latency
 * Ground→Ground slow, Orbital hops visibly fast
 * Add variation: ±30% random variation for visual interest
 */
export function calculateBeamSpeed(totalPathLatencyMs: number, k: number = 100): number {
  if (totalPathLatencyMs <= 0) return 1.0;
  const baseSpeed = k / totalPathLatencyMs;
  // Add ±30% random variation for more visual interest
  const variation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3 (30% variation)
  const variedSpeed = baseSpeed * variation;
  return Math.max(0.1, Math.min(2.5, variedSpeed));
}

/**
 * (D) Jitter = Congestion
 * jitter = congestionIndex² × maxOffset
 * Congestion must look physically unstable, not just busy
 */
export function calculateBeamJitter(congestionIndex: number, maxOffset: number = 0.1): number {
  const jitter = Math.pow(congestionIndex, 2) * maxOffset;
  return Math.min(jitter, maxOffset); // Cap at maxOffset
}

/**
 * Calculate complete routing beam state
 */
export function calculateRoutingBeamState(
  trafficMbps: number,
  policy: PolicyType,
  totalPathLatencyMs: number,
  congestionIndex: number,
  baseThickness: number = 2,
  speedK: number = 100,
  maxJitter: number = 0.1
): RoutingBeamState {
  return {
    thickness: calculateBeamThickness(trafficMbps, baseThickness),
    color: getPolicyColor(policy),
    speed: calculateBeamSpeed(totalPathLatencyMs, speedK),
    jitter: calculateBeamJitter(congestionIndex, maxJitter),
  };
}

