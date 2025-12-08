/**
 * Failure Shockwave
 * Physics-driven expanding shockwave from failure epicenter
 */

"use client";

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as d3Geo from 'd3-geo';
import type { FailureEvent } from '../../../lib/sim/orbit/failure';
import { calculateShockRadius, calculateWaveSpeed } from '../../../lib/sim/orbit/failure';

interface FailureShockwaveProps {
  failure: FailureEvent;
  projection: d3.GeoProjection;
  globeRadius: number;
  onComplete?: () => void;
}

export default function FailureShockwave({
  failure,
  projection,
  globeRadius,
  onComplete,
}: FailureShockwaveProps) {
  const waveRef = useRef<SVGCircleElement | null>(null);
  const [waveRadius, setWaveRadius] = useState(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!waveRef.current) return;

    const startTime = failure.timestamp;
    const maxRadius = calculateShockRadius(failure.severity);
    const waveSpeed = calculateWaveSpeed(550); // Assume 550km altitude
    const duration = (maxRadius / waveSpeed) * 1000; // Convert to ms

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      
      // Expand wave radius
      const currentRadius = progress * maxRadius;
      setWaveRadius(currentRadius);

      // Update visual
      const circle = d3.select(waveRef.current);
      if (circle.node()) {
        const [x, y] = projection([failure.epicenter.lon, failure.epicenter.lat]) || [0, 0];
        circle
          .attr('cx', x)
          .attr('cy', y)
          .attr('r', currentRadius * (globeRadius / 90)) // Scale to globe
          .attr('opacity', 1 - progress * 0.7) // Fade as it expands
          .attr('stroke-width', Math.max(2, 5 - progress * 3));
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [failure, projection, globeRadius, onComplete]);

  // Color based on severity
  const severityColor = failure.severity >= 0.75 ? '#ff0000' :
                        failure.severity >= 0.5 ? '#ff6600' :
                        failure.severity >= 0.25 ? '#ffaa00' : '#ffff00';

  return (
    <circle
      ref={waveRef}
      className="failure-shockwave"
      fill="none"
      stroke={severityColor}
      strokeWidth={5}
      opacity={0.8}
      style={{
        filter: 'blur(3px)',
        pointerEvents: 'none',
      }}
    />
  );
}

