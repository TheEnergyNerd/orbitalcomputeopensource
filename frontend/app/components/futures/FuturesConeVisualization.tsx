"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ForecastResult, ForecastPoint } from '@/app/lib/futures/types';
import { useSimulationStore } from '@/app/store/simulationStore';

interface FuturesConeVisualizationProps {
  forecast: ForecastResult;
  type: 'orbit' | 'ground';
  width?: number;
  height?: number;
  onHover?: (point: ForecastPoint | null) => void;
  animated?: boolean;
}

export default function FuturesConeVisualization({
  forecast,
  type,
  width = 800,
  height = 500,
  onHover,
  animated = true,
}: FuturesConeVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
  }>>([]);
  
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const points = forecast.points;
  const futuresSentiment = useSimulationStore((s) => s.futuresSentiment);
  const orbitSentiment = futuresSentiment?.orbitSentiment ?? 0;
  const volatilityLevel = futuresSentiment?.volatilityLevel ?? 0.5;
  
  // Color scheme
  const colors = type === 'orbit' ? {
    centerline: '#00ff88', // neon green
    innerCone: '#10b981', // emerald
    outerCone: '#14b8a6', // teal
    glow: 'rgba(0, 255, 136, 0.3)',
  } : {
    centerline: '#ff4444', // red
    innerCone: '#f97316', // orange
    outerCone: '#991b1b', // maroon
    glow: 'rgba(255, 68, 68, 0.3)',
  };
  
  // Calculate scales
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const minYear = Math.min(...points.map(p => p.year));
  const maxYear = Math.max(...points.map(p => p.year));
  const maxCost = Math.max(...points.map(p => 
    type === 'orbit' ? p.p97_5Orbit : p.p97_5Ground
  ));
  
  const xScale = (year: number) => 
    padding.left + ((year - minYear) / (maxYear - minYear)) * chartWidth;
  const yScale = (cost: number) => 
    padding.top + chartHeight - (cost / maxCost) * chartHeight;
  
  // Generate path strings for cones
  const generateConePath = useCallback((points: ForecastPoint[], upper: boolean, sigma: 1 | 2) => {
    const pathPoints = points.map(p => {
      const x = xScale(p.year);
      const cost = type === 'orbit' 
        ? (upper ? (sigma === 1 ? p.p84Orbit : p.p97_5Orbit) : (sigma === 1 ? p.p16Orbit : p.p2_5Orbit))
        : (upper ? (sigma === 1 ? p.p84Ground : p.p97_5Ground) : (sigma === 1 ? p.p16Ground : p.p2_5Ground));
      const y = yScale(cost);
      return `${x},${y}`;
    });
    
    if (upper) {
      // Upper band: go forward then reverse along lower
      const lowerPoints = points.map(p => {
        const x = xScale(p.year);
        const cost = type === 'orbit'
          ? (sigma === 1 ? p.p16Orbit : p.p2_5Orbit)
          : (sigma === 1 ? p.p16Ground : p.p2_5Ground);
        const y = yScale(cost);
        return `${x},${y}`;
      }).reverse();
      return `M ${pathPoints[0]} L ${pathPoints.join(' L ')} L ${lowerPoints.join(' L ')} Z`;
    }
    return `M ${pathPoints[0]} L ${pathPoints.join(' L ')}`;
  }, [xScale, yScale, type]);
  
  // Initialize particles
  useEffect(() => {
    if (!animated) return;
    
    const volatilitySum = points.reduce((sum, p) => 
      sum + (type === 'orbit' ? p.volatilityOrbit : p.volatilityGround), 0
    );
    const particleCount = Math.min(300, Math.floor(volatilitySum * 50));
    particlesRef.current = Array.from({ length: particleCount }, () => {
      const randomPoint = points[Math.floor(Math.random() * points.length)];
      const x = xScale(randomPoint.year);
      const meanCost = type === 'orbit' ? randomPoint.meanOrbitCost : randomPoint.meanGroundCost;
      const upperCost = type === 'orbit' ? randomPoint.p97_5Orbit : randomPoint.p97_5Ground;
      const lowerCost = type === 'orbit' ? randomPoint.p2_5Orbit : randomPoint.p2_5Ground;
      const baseY = yScale(meanCost);
      
      return {
        x: x + (Math.random() - 0.5) * 20,
        y: baseY + (Math.random() - 0.5) * (yScale(upperCost) - yScale(lowerCost)),
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5, // Will be adjusted by sentiment in animation
        life: Math.random(),
      };
    });
  }, [points, animated, xScale, yScale, type]);
  
  // Animation loop
  useEffect(() => {
    if (!animated || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Draw fog noise texture in cone area - density based on volatility
      const fogDensity = Math.floor(50 * (0.5 + volatilityLevel));
      ctx.globalAlpha = 0.15 * (0.5 + volatilityLevel);
      ctx.fillStyle = colors.innerCone;
      for (let i = 0; i < fogDensity; i++) {
        const randomPoint = points[Math.floor(Math.random() * points.length)];
        const x = xScale(randomPoint.year) + (Math.random() - 0.5) * 30;
        const meanCost = type === 'orbit' ? randomPoint.meanOrbitCost : randomPoint.meanGroundCost;
        const upperCost = type === 'orbit' ? randomPoint.p97_5Orbit : randomPoint.p97_5Ground;
        const lowerCost = type === 'orbit' ? randomPoint.p2_5Orbit : randomPoint.p2_5Ground;
        const y = yScale(meanCost) + (Math.random() - 0.5) * (yScale(upperCost) - yScale(lowerCost));
        const size = 2 + Math.random() * 3;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Update and draw particles with sentiment-based movement
      ctx.globalAlpha = 0.6 * (0.3 + volatilityLevel * 0.7);
      particlesRef.current.forEach((particle, idx) => {
        // Apply sentiment-based vertical bias
        // Positive sentiment (bullish) = upward movement, negative (bearish) = downward
        const sentimentBias = type === 'orbit' ? orbitSentiment * 0.02 : -orbitSentiment * 0.02;
        const volatilityJitter = (Math.random() - 0.5) * volatilityLevel * 0.02;
        
        // Update position with sentiment and volatility
        particle.vx += volatilityJitter;
        particle.vy += sentimentBias + volatilityJitter;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life += 0.01;
        
        // Wrap around
        if (particle.x < padding.left) {
          particle.x = padding.left + chartWidth;
          const randomPoint = points[Math.floor(Math.random() * points.length)];
          const mean = type === 'orbit' ? randomPoint.meanOrbitCost : randomPoint.meanGroundCost;
          const upper = type === 'orbit' ? randomPoint.p97_5Orbit : randomPoint.p97_5Ground;
          const lower = type === 'orbit' ? randomPoint.p2_5Orbit : randomPoint.p2_5Ground;
          particle.y = yScale(mean) + (Math.random() - 0.5) * (yScale(upper) - yScale(lower));
        } else if (particle.x > padding.left + chartWidth) {
          particle.x = padding.left;
          const randomPoint = points[Math.floor(Math.random() * points.length)];
          const mean = type === 'orbit' ? randomPoint.meanOrbitCost : randomPoint.meanGroundCost;
          const upper = type === 'orbit' ? randomPoint.p97_5Orbit : randomPoint.p97_5Ground;
          const lower = type === 'orbit' ? randomPoint.p2_5Orbit : randomPoint.p2_5Ground;
          particle.y = yScale(mean) + (Math.random() - 0.5) * (yScale(upper) - yScale(lower));
        }
        
        // Keep within cone bounds
        const year = minYear + ((particle.x - padding.left) / chartWidth) * (maxYear - minYear);
        const nearestPoint = points.reduce((prev, curr) => 
          Math.abs(curr.year - year) < Math.abs(prev.year - year) ? curr : prev
        );
        
        const upperCost = type === 'orbit' ? nearestPoint.p97_5Orbit : nearestPoint.p97_5Ground;
        const lowerCost = type === 'orbit' ? nearestPoint.p2_5Orbit : nearestPoint.p2_5Ground;
        const upperBound = yScale(upperCost);
        const lowerBound = yScale(lowerCost);
        if (particle.y < lowerBound) particle.y = lowerBound;
        if (particle.y > upperBound) particle.y = upperBound;
        
        // Draw particle with volatility-based opacity
        const baseAlpha = 0.3 + Math.sin(particle.life) * 0.3;
        const volatilityAlpha = baseAlpha * (0.3 + volatilityLevel * 0.7);
        ctx.globalAlpha = volatilityAlpha;
        ctx.fillStyle = colors.centerline;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animated, points, width, height, colors, xScale, yScale, minYear, maxYear, chartWidth, padding, type, orbitSentiment, volatilityLevel]);
  
  // Handle hover
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const year = minYear + ((x - padding.left) / chartWidth) * (maxYear - minYear);
    
    const nearestPoint = points.reduce((prev, curr) => 
      Math.abs(curr.year - year) < Math.abs(prev.year - year) ? curr : prev
    );
    
    if (Math.abs(nearestPoint.year - year) < (maxYear - minYear) / points.length) {
      setHoveredYear(nearestPoint.year);
      onHover?.(nearestPoint);
    } else {
      setHoveredYear(null);
      onHover?.(null);
    }
  }, [points, minYear, maxYear, chartWidth, padding, onHover]);
  
  const handleMouseLeave = useCallback(() => {
    setHoveredYear(null);
    onHover?.(null);
  }, [onHover]);
  
  return (
    <div className="relative" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="absolute inset-0"
      >
        <defs>
          {/* Glow filter for centerline */}
          <filter id={`glow-${type}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Grid lines */}
        <g className="text-gray-600">
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = padding.top + chartHeight - t * chartHeight;
            return (
              <line
                key={t}
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.2}
              />
            );
          })}
        </g>
        
        {/* Layer 2: Outer Cone (95% confidence) */}
        <path
          d={generateConePath(points, true, 2)}
          fill={colors.outerCone}
          opacity={0.2}
          className="transition-all duration-600"
        />
        
        {/* Layer 1: Inner Cone (68% confidence) */}
        <path
          d={generateConePath(points, true, 1)}
          fill={colors.innerCone}
          opacity={0.35}
          className="transition-all duration-600"
        />
        
        {/* Layer 0: Centerline (mean forecast) */}
        <path
          d={`M ${points.map(p => {
            const meanCost = type === 'orbit' ? p.meanOrbitCost : p.meanGroundCost;
            return `${xScale(p.year)},${yScale(meanCost)}`;
          }).join(' L ')}`}
          fill="none"
          stroke={colors.centerline}
          strokeWidth={2.5}
          filter={`url(#glow-${type})`}
          className="transition-all duration-600"
        />
        
        {/* Hover indicator line */}
        {hoveredYear !== null && (() => {
          const point = points.find(p => p.year === hoveredYear);
          if (!point) return null;
          const x = xScale(point.year);
          const upperCost = type === 'orbit' ? point.p97_5Orbit : point.p97_5Ground;
          const lowerCost = type === 'orbit' ? point.p2_5Orbit : point.p2_5Ground;
          return (
            <>
              <line
                x1={x}
                y1={yScale(upperCost)}
                x2={x}
                y2={yScale(lowerCost)}
                stroke={colors.centerline}
                strokeWidth={2}
                opacity={0.6}
                strokeDasharray="4 4"
              />
            </>
          );
        })()}
        
        {/* Axis labels */}
        <g className="text-xs fill-gray-400">
          {points.filter((_, i) => i % Math.ceil(points.length / 5) === 0).map(p => (
            <text
              key={p.year}
              x={xScale(p.year)}
              y={height - padding.bottom + 20}
              textAnchor="middle"
            >
              {p.year}
            </text>
          ))}
          
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = padding.top + chartHeight - t * chartHeight;
            const value = maxCost * (1 - t);
            return (
              <text
                key={t}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
              >
                ${value.toFixed(0)}
              </text>
            );
          })}
        </g>
      </svg>
      
      {/* Canvas for particles and fog */}
      {animated && (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
        />
      )}
      
      {/* Tooltip */}
      {hoveredYear !== null && (() => {
        const point = points.find(p => p.year === hoveredYear);
        if (!point) return null;
        const x = xScale(point.year);
        const meanCost = type === 'orbit' ? point.meanOrbitCost : point.meanGroundCost;
        const lowerCost = type === 'orbit' ? point.p2_5Orbit : point.p2_5Ground;
        const upperCost = type === 'orbit' ? point.p97_5Orbit : point.p97_5Ground;
        const volatility = type === 'orbit' ? point.volatilityOrbit : point.volatilityGround;
        return (
          <div
            className="absolute bg-gray-900/95 border border-gray-700 rounded-lg p-3 text-xs pointer-events-none z-10"
            style={{
              left: `${Math.min(width - 200, Math.max(0, x - 100))}px`,
              top: `${padding.top + 10}px`,
            }}
          >
            <div className="font-semibold text-white mb-2">Year {point.year}</div>
            <div className="space-y-1 text-gray-300">
              <div>Expected: <span className="text-white">${meanCost.toFixed(2)}</span></div>
              <div>Range: <span className="text-white">${lowerCost.toFixed(2)} - ${upperCost.toFixed(2)}</span></div>
              <div>Volatility: <span className="text-white">{(volatility * 100).toFixed(1)}%</span></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

