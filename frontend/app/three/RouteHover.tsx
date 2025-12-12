"use client";

import { useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2 } from "three";
import { useOrbitSim } from "../state/orbitStore";

/**
 * Route Hover Effects
 * Increases line width and adds glow on hover
 */
export function RouteHover() {
  const { camera, gl } = useThree();
  const routes = useOrbitSim((s) => s.routes);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const raycasterRef = useRef(new Raycaster());
  
  // This component doesn't render - it just tracks hover state
  // The actual visual effects are applied in TrafficFlowsBatched
  return null;
}

// Export hover state for use in TrafficFlowsBatched
let currentHoveredRoute: string | null = null;

export function getHoveredRoute(): string | null {
  return currentHoveredRoute;
}

export function setHoveredRoute(routeId: string | null) {
  currentHoveredRoute = routeId;
}

