/**
 * Future-Friendly Routing Model
 * No cables, no real backbones - physics-based only
 */

import type { OrbitalShell } from '../orbit/shellModel';
import { calculatePropagationDelay } from '../orbit/shellModel';

export interface Route {
  id: string;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  shellId?: string; // If routing through orbit
  active: boolean;
}

export interface RoutingMetrics {
  totalLatency: number; // ms
  shellAltitudeDelay: number; // ms
  handoffPenalty: number; // ms
  congestionPenalty: number; // ms
  routeCost: number; // multiplier
}

/**
 * Calculate distance between two points (great circle, km)
 */
function calculateDistance(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLon = (destination.lon - origin.lon) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(origin.lat * Math.PI / 180) *
    Math.cos(destination.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate total latency for a route
 * Formula: distance / c + shellAltitudeDelay + handoffPenalty + congestionPenalty
 */
export function calculateRouteLatency(
  route: Route,
  shell: OrbitalShell | null,
  activeRoutes: Route[],
  satellitesPerShell: number
): RoutingMetrics {
  const SPEED_OF_LIGHT_KM_S = 299792.458;
  const distance = calculateDistance(route.origin, route.destination);
  
  // Signal propagation delay (distance / c)
  const propagationDelay = (distance / SPEED_OF_LIGHT_KM_S) * 1000; // Convert to ms

  // Shell altitude delay (if routing through orbit)
  const shellAltitudeDelay = shell
    ? calculatePropagationDelay(shell.altitudeKm)
    : 0;

  // Handoff penalty (satellite-to-satellite hops)
  // Assume 1 hop per 1000km of distance
  const hops = Math.ceil(distance / 1000);
  const handoffPenalty = hops * 5; // 5ms per hop

  // Congestion penalty
  const activeRoutesInShell = activeRoutes.filter(r => r.shellId === shell?.id).length;
  const congestion = satellitesPerShell > 0
    ? activeRoutesInShell / satellitesPerShell
    : 0;
  const congestionPenalty = congestion * 20; // 20ms per unit of congestion

  const totalLatency = propagationDelay + shellAltitudeDelay + handoffPenalty + congestionPenalty;

  // Route cost penalty (1 + congestion^2)
  const routeCost = 1 + Math.pow(congestion, 2);

  return {
    totalLatency,
    shellAltitudeDelay,
    handoffPenalty,
    congestionPenalty,
    routeCost,
  };
}

/**
 * Calculate congestion index for a shell
 */
export function calculateCongestionIndex(
  shell: OrbitalShell,
  activeRoutes: Route[]
): number {
  const routesInShell = activeRoutes.filter(r => r.shellId === shell.id).length;
  return shell.satellites > 0
    ? routesInShell / shell.satellites
    : 0;
}

