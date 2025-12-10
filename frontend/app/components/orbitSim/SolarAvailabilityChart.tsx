"use client";

import React, { useMemo, useRef, useEffect, useState } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import { useOrbitSim } from "../../state/orbitStore";

interface SolarAvailabilityChartProps {
  timeline: YearStep[];
}

/**
 * Solar Availability Dominance Chart
 * Shows % full-power uptime for Ground Solar, Solar+Storage, and Space-Based Solar
 * SBS stabilizes above 92% after SSO inference sats appear (~2030)
 */
export default function SolarAvailabilityChart({ timeline }: SolarAvailabilityChartProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const [hasTriggeredPulse, setHasTriggeredPulse] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const pulseRef = useRef<HTMLDivElement>(null);
  const satellites = useOrbitSim((s) => s.satellites);

  // Calculate solar availability data - must be called before early returns
  const solarData = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    
    const firstYear = timeline[0].year;
    const lastYear = timeline[timeline.length - 1].year;
    const yearRange = lastYear - firstYear;
    if (yearRange <= 0 || !isFinite(yearRange)) {
      return [];
    }
    return timeline.map((step) => {
      const year = step.year;
      
      // Ground Solar: 18-28% (oscillates with seasons/weather)
      const groundSolarBase = 23; // Average
      const seasonalVariation = Math.sin((year - firstYear) * 0.5) * 5; // ±5% seasonal
      // Deterministic "weather" noise based on year
      const weatherSeed = year * 1000;
      const weatherNoise = (((weatherSeed * 9301 + 49297) % 233280) / 233280 - 0.5) * 4; // ±2% weather
      const groundSolar = Math.max(18, Math.min(28, groundSolarBase + seasonalVariation + weatherNoise));
      
      // Grid-Tied Solar + Storage: 35-55% (smoother but still variable)
      const storageBase = 45;
      const storageVariation = Math.sin((year - firstYear) * 0.3) * 10; // ±10% variation
      const storageSolar = Math.max(35, Math.min(55, storageBase + storageVariation));
      
      // Space-Based Solar / SSO Pods: 92-99% (nearly flat after SSO sats appear)
      // Check if Class B SSO satellites exist for this year
      // Use a deterministic approach based on year and timeline data
      const hasSSOSats = year >= 2030; // Class B sats come online at 2030
      
      // Calculate SBS uptime: starts at 0, ramps up to 92-99% after 2030
      let sbsUptime = 0;
      if (hasSSOSats) {
        // Ramp up over first year, then stabilize
        const yearsSince2030 = year - 2030;
        if (yearsSince2030 <= 1) {
          // Ramp up from 0 to 92% over first year
          sbsUptime = 92 * (yearsSince2030 / 1);
        } else {
          // Stable at 92-99%
          // Use deterministic value based on year for consistency
          const seed = year * 1000;
          const random = ((seed * 9301 + 49297) % 233280) / 233280;
          sbsUptime = 92 + (random * 7); // 92-99%
        }
      }
      
      return {
        year,
        groundSolar,
        storageSolar,
        sbsUptime,
        hasSSOSats,
      };
    });
  }, [timeline, satellites]);

  // NOW we can do conditional returns after all hooks are called
  if (!timeline || timeline.length === 0) return null;

  const firstYear = timeline[0].year;
  const lastYear = timeline[timeline.length - 1].year;
  const yearRange = lastYear - firstYear;
  if (yearRange <= 0 || !isFinite(yearRange)) {
    return null;
  }

  if (solarData.length === 0) return null;

  // Check for regime entry (first time SBS > 92%)
  useEffect(() => {
    const currentData = solarData[solarData.length - 1];
    if (currentData && currentData.sbsUptime >= 92 && !hasTriggeredPulse && currentData.hasSSOSats) {
      setHasTriggeredPulse(true);
      setPulseActive(true);
      
      // Trigger pulse animation
      if (pulseRef.current) {
        pulseRef.current.style.animation = 'none';
        setTimeout(() => {
          if (pulseRef.current) {
            pulseRef.current.style.animation = 'solarPulse 1s ease-out';
          }
        }, 10);
      }
      
      // Hide pulse after animation
      setTimeout(() => {
        setPulseActive(false);
      }, 1000);
    }
  }, [solarData, hasTriggeredPulse]);

  // Responsive dimensions
  const width = typeof window !== 'undefined' 
    ? Math.min(500, window.innerWidth - 64) 
    : 500;
  const height = typeof window !== 'undefined'
    ? Math.min(360, (window.innerHeight - 200) * 0.6)
    : 360;
  const padding = { top: 20, right: 24, bottom: 35, left: 50 };

  const getX = (year: number) => {
    if (!isFinite(year) || !isFinite(firstYear) || !isFinite(yearRange) || yearRange === 0) {
      return padding.left;
    }
    return padding.left + ((year - firstYear) / yearRange) * (width - padding.left - padding.right);
  };

  const getY = (value: number) => {
    // Y axis goes from 0% to 100%
    const maxValue = 100;
    if (!isFinite(value)) {
      return height - padding.bottom;
    }
    return height - padding.bottom - ((value / maxValue) * (height - padding.top - padding.bottom));
  };

  // Generate paths
  const groundPath = solarData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.groundSolar);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  const storagePath = solarData
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.storageSolar);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  const sbsPath = solarData
    .filter(d => d.sbsUptime > 0)
    .map((d, i) => {
      const x = getX(d.year);
      const y = getY(d.sbsUptime);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  // Generate area fills (for visual emphasis)
  const groundArea = `${groundPath} L ${getX(lastYear)} ${height - padding.bottom} L ${getX(firstYear)} ${height - padding.bottom} Z`;
  const storageArea = `${storagePath} L ${getX(lastYear)} ${height - padding.bottom} L ${getX(firstYear)} ${height - padding.bottom} Z`;
  const sbsArea = solarData.filter(d => d.sbsUptime > 0).length > 0
    ? `${sbsPath} L ${getX(solarData.filter(d => d.sbsUptime > 0)[solarData.filter(d => d.sbsUptime > 0).length - 1].year)} ${height - padding.bottom} L ${getX(solarData.filter(d => d.sbsUptime > 0)[0].year)} ${height - padding.bottom} Z`
    : "";

  return (
    <div className="relative w-full h-full">
      {/* Pulse overlay */}
      {pulseActive && (
        <div
          ref={pulseRef}
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%)',
            zIndex: 10,
          }}
        />
      )}
      
      {/* Regime label */}
      {hasTriggeredPulse && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-semibold text-yellow-300 pointer-events-none z-20"
          style={{
            animation: 'fadeIn 0.5s ease-in',
          }}
        >
          Permanent Daylight Regime Achieved
        </div>
      )}

      <svg
        width={width}
        height={height}
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Gradients for area fills */}
          <linearGradient id="groundGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="storageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="sbsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
          </linearGradient>
          
          {/* Animation keyframes */}
          <style>
            {`
              @keyframes solarPulse {
                0% { opacity: 0; transform: scale(0.8); }
                50% { opacity: 1; transform: scale(1.1); }
                100% { opacity: 0; transform: scale(1.2); }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}
          </style>
        </defs>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((value) => {
          const y = getY(value);
          return (
            <line
              key={value}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#334155"
              strokeWidth={0.5}
              strokeDasharray="2,2"
            />
          );
        })}

        {/* Year ticks */}
        {Array.from({ length: Math.ceil(yearRange / 5) + 1 }, (_, i) => {
          const year = firstYear + i * 5;
          if (year > lastYear) return null;
          const x = getX(year);
          return (
            <g key={year}>
              <line
                x1={x}
                y1={height - padding.bottom}
                x2={x}
                y2={height - padding.bottom + 4}
                stroke="#64748B"
                strokeWidth={1}
              />
              <text
                x={x}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="10"
              >
                {year}
              </text>
            </g>
          );
        })}

        {/* Area fills */}
        <path d={groundArea} fill="url(#groundGradient)" />
        <path d={storageArea} fill="url(#storageGradient)" />
        {sbsArea && <path d={sbsArea} fill="url(#sbsGradient)" />}

        {/* Lines */}
        <path
          d={groundPath}
          fill="none"
          stroke="#EF4444"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={storagePath}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sbsPath && (
          <path
            d={sbsPath}
            fill="none"
            stroke="#10B981"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Y-axis label */}
        <text
          x={padding.left - 30}
          y={height / 2}
          textAnchor="middle"
          fill="#94A3B8"
          fontSize="11"
          transform={`rotate(-90 ${padding.left - 30} ${height / 2})`}
        >
          % Full-Power Uptime
        </text>

        {/* Legend */}
        <g transform={`translate(${width - padding.right - 120}, ${padding.top + 10})`}>
          <rect x={0} y={0} width={110} height={60} fill="#0F172A" fillOpacity="0.8" rx={4} />
          <line x1={5} y1={12} x2={15} y2={12} stroke="#EF4444" strokeWidth={2} />
          <text x={18} y={15} fill="#E2E8F0" fontSize="10">Ground Solar</text>
          <line x1={5} y1={28} x2={15} y2={28} stroke="#F59E0B" strokeWidth={2} />
          <text x={18} y={31} fill="#E2E8F0" fontSize="10">Solar + Storage</text>
          <line x1={5} y1={44} x2={15} y2={44} stroke="#10B981" strokeWidth={3} />
          <text x={18} y={47} fill="#E2E8F0" fontSize="10">Space-Based Solar</text>
        </g>
      </svg>
    </div>
  );
}

