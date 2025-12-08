/**
 * Failure Propagation Engine
 * Propagates failure events to routing and system state
 */

import type { FailureEvent } from './failure';

export interface ActiveRoute {
  id: string;
  shellId: string;
  latency: number;
  cost: number;
  droppedPackets: number;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
}

// Global registry of active routes (should be managed by routing system)
export const ACTIVE_ROUTES: ActiveRoute[] = [];

/**
 * Register an active route
 */
export function registerRoute(route: ActiveRoute): void {
  ACTIVE_ROUTES.push(route);
}

/**
 * Unregister a route
 */
export function unregisterRoute(routeId: string): void {
  const index = ACTIVE_ROUTES.findIndex(r => r.id === routeId);
  if (index >= 0) {
    ACTIVE_ROUTES.splice(index, 1);
  }
}

/**
 * Propagate failure event to affected routes
 * This MUST affect routing, not just visuals
 */
export function propagateFailure(event: FailureEvent): void {
  // Find all routes in the affected shell
  const affectedRoutes = ACTIVE_ROUTES.filter(
    route => route.shellId === event.shellId
  );

  // Apply failure effects to each route
  for (const route of affectedRoutes) {
    // Latency increases with severity
    route.latency *= 1 + event.severity;

    // Cost increases (less than latency, but still significant)
    route.cost *= 1 + event.severity * 0.6;

    // Dropped packets increase with severity
    route.droppedPackets += event.severity * 1000;

    // Track affected routes in event
    if (!event.affectedRoutes) {
      event.affectedRoutes = [];
    }
    if (!event.affectedRoutes.includes(route.id)) {
      event.affectedRoutes.push(route.id);
    }
  }
}

/**
 * Check if a route is in a shock zone
 */
export function isRouteInShockZone(
  route: ActiveRoute,
  event: FailureEvent,
  currentTime: number
): boolean {
  if (!isFailureActive(event, currentTime)) return false;

  // Calculate distance from route midpoint to epicenter
  const routeMidLat = (route.origin.lat + route.destination.lat) / 2;
  const routeMidLon = (route.origin.lon + route.destination.lon) / 2;

  const latDiff = routeMidLat - event.epicenter.lat;
  const lonDiff = routeMidLon - event.epicenter.lon;
  const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);

  // Use severity to determine shock radius
  const shockRadius = event.severity * 45; // degrees (approximate)

  return distance <= shockRadius;
}

/**
 * Clear failure effects (when event expires or is resolved)
 */
export function clearFailureEffects(event: FailureEvent): void {
  if (!event.affectedRoutes) return;

  // Find affected routes and restore baseline (would need to store baseline)
  // For now, we'll just mark them as no longer affected
  // In a full implementation, you'd restore baseline latency/cost
  for (const routeId of event.affectedRoutes) {
    const route = ACTIVE_ROUTES.find(r => r.id === routeId);
    if (route) {
      // Reset dropped packets (they've been lost)
      route.droppedPackets = 0;
      // Note: In a real system, you'd restore baseline latency/cost
      // This requires storing baseline values
    }
  }
}

