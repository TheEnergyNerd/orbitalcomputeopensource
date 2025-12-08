"use client";

import React, { useEffect, useRef } from 'react';
import type { RouterPolicy, JobTypeId } from '../lib/ai/routerTypes';
import { JOB_TYPES } from '../lib/ai/routerTypes';
import * as d3 from 'd3';
import * as d3Geo from 'd3-geo';

interface AiTrafficLayerProps {
  policy: RouterPolicy;
  samples: number;
  mode: "idle" | "simulate";
  projection: d3.GeoProjection | null;
  containerRef: React.RefObject<HTMLDivElement>;
}

// Major cities as origins
const ORIGINS = [
  { name: "New York", lat: 40.7128, lon: -74.0060 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Frankfurt", lat: 50.1109, lon: 8.6821 },
  { name: "São Paulo", lat: -23.5505, lon: -46.6333 },
  { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
];

// Ground destinations (data centers)
const GROUND_DESTINATIONS = [
  { name: "US East", lat: 39.0438, lon: -77.4874 },
  { name: "US West", lat: 37.5665, lon: -122.3259 },
  { name: "EU West", lat: 53.3498, lon: -6.2603 },
  { name: "EU Central", lat: 50.1109, lon: 8.6821 },
  { name: "Asia Pacific", lat: 1.3521, lon: 103.8198 },
];

export default function AiTrafficLayer({
  policy,
  samples,
  mode,
  projection,
  containerRef,
}: AiTrafficLayerProps) {
  const particlesRef = useRef<Array<{
    id: string;
    origin: { lat: number; lon: number };
    dest: { lat: number; lon: number };
    isOrbit: boolean;
    progress: number;
    element: SVGLineElement | null;
  }>>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!projection || !containerRef.current || mode !== "simulate") {
      return;
    }

    // Create or get SVG layer
    const container = containerRef.current;
    let svg = d3.select(container).select<SVGSVGElement>('svg.ai-traffic-layer');
    if (svg.empty()) {
      svg = d3.select(container)
        .append('svg')
        .attr('class', 'ai-traffic-layer')
        .style('position', 'absolute')
        .style('top', 0)
        .style('left', 0)
        .style('width', '100%')
        .style('height', '100%')
        .style('pointer-events', 'none')
        .style('z-index', '2');
    }

    const svgNode = svg.node()!;

    // Generate particles
    particlesRef.current = Array.from({ length: samples }, (_, i) => {
      const origin = ORIGINS[Math.floor(Math.random() * ORIGINS.length)];
      
      // Pick job type (weighted by typical demand)
      const jobTypeWeights = {
        realtime: 0.3,
        interactive: 0.4,
        batch: 0.2,
        cold: 0.1,
      };
      const rand = Math.random();
      let jobTypeId: JobTypeId = "interactive";
      let cum = 0;
      for (const [type, weight] of Object.entries(jobTypeWeights)) {
        cum += weight;
        if (rand <= cum) {
          jobTypeId = type as JobTypeId;
          break;
        }
      }

      // Use policy to pick destination
      const policyRow = policy.jobs[jobTypeId];
      const rand2 = Math.random();
      let cum2 = 0;
      let isOrbit = false;
      let dest = GROUND_DESTINATIONS[Math.floor(Math.random() * GROUND_DESTINATIONS.length)];
      
      for (const [destId, prob] of Object.entries(policyRow)) {
        cum2 += prob;
        if (rand2 <= cum2) {
          if (destId === "orbit") {
            isOrbit = true;
            // For orbit, use a point above the origin (simplified)
            dest = { lat: origin.lat, lon: origin.lon };
          }
          break;
        }
      }

      return {
        id: `particle-${i}`,
        origin,
        dest,
        isOrbit,
        progress: Math.random(), // Start at random progress
        element: null,
      };
    });

    // Create SVG lines for particles
    particlesRef.current.forEach(particle => {
      const line = svg.append('line')
        .attr('stroke', particle.isOrbit ? '#00d4ff' : '#10b981')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.4)
        .attr('marker-end', 'url(#arrowhead)')
        .node() as SVGLineElement;
      particle.element = line;
    });

    // Add arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('refX', 5.5)
      .attr('refY', 1.5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 6 1.5, 0 3')
      .attr('fill', '#00d4ff');

    // Animation loop
    const animate = () => {
      if (mode !== "simulate") {
        return;
      }

      particlesRef.current.forEach(particle => {
        if (!particle.element) return;

        particle.progress += 0.01; // Speed
        if (particle.progress > 1) {
          particle.progress = 0;
          // Resample origin/dest
          const origin = ORIGINS[Math.floor(Math.random() * ORIGINS.length)];
          particle.origin = origin;
          if (particle.isOrbit) {
            particle.dest = { lat: origin.lat, lon: origin.lon };
          } else {
            particle.dest = GROUND_DESTINATIONS[Math.floor(Math.random() * GROUND_DESTINATIONS.length)];
          }
        }

        const [x1, y1] = projection([particle.origin.lon, particle.origin.lat]) || [0, 0];
        let [x2, y2] = projection([particle.dest.lon, particle.dest.lat]) || [0, 0];

        if (particle.isOrbit) {
          // Arc for orbit: curve upward
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 - 50; // Curve upward
          const t = particle.progress;
          const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * midX + t * t * x2;
          const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * midY + t * t * y2;
          x2 = x;
          y2 = y;
        } else {
          // Straight line for ground
          x2 = x1 + (x2 - x1) * particle.progress;
          y2 = y1 + (y2 - y1) * particle.progress;
        }

        d3.select(particle.element)
          .attr('x1', x1)
          .attr('y1', y1)
          .attr('x2', x2)
          .attr('y2', y2);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      svg.remove();
    };
  }, [policy, samples, mode, projection, containerRef]);

  return null; // This component renders to SVG directly
}


