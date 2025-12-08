/**
 * Congestion Heat Layer
 * Real utilization-driven heat visualization (not fake glow)
 */

"use client";

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as d3Geo from 'd3-geo';
import type { GlobalCongestionFrame } from '../../../lib/sim/orbit/congestion';

interface CongestionHeatLayerProps {
  congestionFrame: GlobalCongestionFrame | null;
  projection: d3.GeoProjection;
  globeRadius: number;
}

/**
 * Map utilization to color
 * 0.0-0.4 = cyan (low)
 * 0.4-0.7 = yellow (medium)
 * 0.7-1.0 = red (high)
 */
function utilizationToColor(utilization: number): string {
  if (utilization < 0.4) {
    // Cyan gradient
    const t = utilization / 0.4;
    const r = Math.floor(0 + t * 0);
    const g = Math.floor(255 - t * 100);
    const b = Math.floor(255 - t * 50);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (utilization < 0.7) {
    // Yellow gradient
    const t = (utilization - 0.4) / 0.3;
    const r = Math.floor(0 + t * 255);
    const g = Math.floor(255 - t * 0);
    const b = Math.floor(155 - t * 155);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red gradient
    const t = (utilization - 0.7) / 0.3;
    const r = 255;
    const g = Math.floor(255 - t * 255);
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Calculate alpha based on utilization and contention
 */
function calculateAlpha(utilization: number, contentionFactor: number): number {
  // Base alpha from utilization
  const baseAlpha = utilization * 0.6;
  // Add pulsing based on contention
  const pulsePhase = (Date.now() / 1000) * (1 + contentionFactor * 2);
  const pulse = Math.sin(pulsePhase) * 0.2 + 0.2;
  return Math.min(0.8, baseAlpha + pulse);
}

export default function CongestionHeatLayer({
  congestionFrame,
  projection,
  globeRadius,
}: CongestionHeatLayerProps) {
  const layerRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    if (!layerRef.current || !congestionFrame || !projection) return;

    const layer = d3.select(layerRef.current);
    layer.selectAll('*').remove();

    // Create heat bands for each shell
    for (const [shellId, shellState] of Object.entries(congestionFrame.shells)) {
      if (shellState.utilization < 0.1) continue; // Skip low utilization

      // Create a radial band at orbital altitude
      const altitude = 550; // km (typical LEO)
      const radius = globeRadius + (altitude / 6371) * globeRadius;

      // Create a circle at orbital altitude
      const circle = d3.geoCircle()
        .center([0, 0]) // Will be positioned by projection
        .radius(90); // Full circle

      const path = d3.geoPath().projection(projection);

      // Create heat band
      const color = utilizationToColor(shellState.utilization);
      const alpha = calculateAlpha(shellState.utilization, shellState.contentionFactor);
      const thickness = shellState.packetRate / 100; // Thickness proportional to packet rate

      layer
        .append('path')
        .datum(circle)
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', Math.max(1, Math.min(10, thickness)))
        .attr('stroke-opacity', alpha)
        .attr('class', `congestion-heat-${shellId}`)
        .style('filter', 'blur(2px)'); // Heat bleed effect
    }
  }, [congestionFrame, projection, globeRadius]);

  return <g ref={layerRef} className="congestion-heat-layer" />;
}

