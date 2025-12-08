/**
 * Orbital Failure Event Models
 * Physics-driven failure events that affect routing and metrics
 */

export interface FailureEvent {
  id: string;
  shellId: string;
  type: "COLLISION" | "SAT_FAILURE" | "SPECTRUM_LOCK" | "OVERCAPACITY";
  severity: 0.0 | 0.25 | 0.5 | 0.75 | 1.0;
  timestamp: number;
  epicenter: { lat: number; lon: number };
  duration?: number; // Duration in milliseconds
  affectedRoutes?: string[]; // Route IDs affected
}

/**
 * Create a failure event
 */
export function createFailureEvent(
  id: string,
  shellId: string,
  type: FailureEvent["type"],
  severity: FailureEvent["severity"],
  epicenter: { lat: number; lon: number },
  duration?: number
): FailureEvent {
  return {
    id,
    shellId,
    type,
    severity,
    timestamp: Date.now(),
    epicenter,
    duration,
    affectedRoutes: [],
  };
}

/**
 * Check if a failure event is still active
 */
export function isFailureActive(
  event: FailureEvent,
  currentTime: number
): boolean {
  if (!event.duration) return true; // Permanent until manually cleared
  return currentTime - event.timestamp < event.duration;
}

/**
 * Calculate shock radius from severity
 * Returns radius in degrees (approximate)
 */
export function calculateShockRadius(severity: number): number {
  // Severity 1.0 = ~45 degrees radius
  return severity * 45;
}

/**
 * Calculate wave speed based on orbital velocity
 * Returns degrees per second (approximate)
 */
export function calculateWaveSpeed(altitudeKm: number): number {
  // Higher altitude = slower wave (lower orbital velocity)
  // At 550km: ~7.8 km/s orbital velocity
  // Convert to approximate degrees per second
  const baseSpeed = 0.5; // degrees per second at 550km
  const altitudeFactor = 550 / altitudeKm;
  return baseSpeed * altitudeFactor;
}

