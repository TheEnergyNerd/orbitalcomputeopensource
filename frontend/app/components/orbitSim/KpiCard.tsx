"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import type { ForecastBands } from "../../lib/orbitSim/forecast";
import { calculateCostCrossover } from "../../lib/orbitSim/costCrossover";
import { calculateCarbonCrossover } from "../../lib/orbitSim/carbonModel";

interface KpiCardProps {
  title: string;
  timeline: YearStep[];
  groundKey: "costPerComputeGround" | "latencyGroundMs" | "opexGround" | "carbonGround" | "opexGroundBaseline" | "carbonGroundBaseline";
  mixKey: "costPerComputeMix" | "latencyMixMs" | "opexMix" | "carbonMix";
  unitsFormatter: (v: number) => string;
  isLowerBetter?: boolean;
  showBothCurves?: boolean; // For OPEX and Carbon: show both ground and mix curves
  savingsKey?: "opexSavings" | "carbonSavings"; // For displaying savings text
  groundColor?: string;
  mixColor?: string;
  forecastBands?: ForecastBands;
  forecastKey?: "costPerCompute" | "latency" | "carbon";
}

/**
 * Generic KPI card component to display metric curves over time
 */
export default function KpiCard({
  title,
  timeline,
  groundKey,
  mixKey,
  unitsFormatter,
  isLowerBetter = true,
  showBothCurves = false,
  savingsKey,
  groundColor = "#EF4444",
  mixColor = "#10B981",
  forecastBands,
  forecastKey,
}: KpiCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crossoverGlow, setCrossoverGlow] = useState(0); // 0-1 glow intensity
  // Responsive chart dimensions - increased height on mobile to prevent cutoff
  const chartWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? 140 : 180;
  const chartHeight = typeof window !== 'undefined' && window.innerWidth < 640 ? 90 : 80; // Increased from 60 to 90 on mobile
  
  // Calculate crossover year for cost/carbon charts
  const crossoverYear = useMemo(() => {
    if (title === "Cost / Compute" || title === "Annual OPEX") {
      const orbitalCosts = timeline.map(s => ({ year: s.year, cost: s[groundKey] as number }));
      const groundCosts = timeline.map(s => ({ year: s.year, cost: s[mixKey] as number }));
      const result = calculateCostCrossover(orbitalCosts, groundCosts);
      return result.crossover_year;
    } else if (title === "Carbon") {
      const orbitalCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s[mixKey] as number) * 1000 }));
      const groundCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s[groundKey] as number) * 1000 }));
      const result = calculateCarbonCrossover(groundCarbon, orbitalCarbon);
      return result.crossover_year;
    }
    return null;
  }, [timeline, title, groundKey, mixKey]);
  
  // Check if current year is at or past crossover
  const currentYear = timeline.length > 0 ? timeline[timeline.length - 1].year : null;
  const isCrossoverActive = crossoverYear !== null && currentYear !== null && currentYear >= crossoverYear;
  
  // Animate glow when crossover happens - enhanced pulsing effect
  useEffect(() => {
    if (isCrossoverActive) {
      // Start with strong glow, then pulse
      setCrossoverGlow(1.0);
      const interval = setInterval(() => {
        setCrossoverGlow(prev => {
          // Pulse between 0.6 and 1.0
          const time = Date.now() / 1000;
          return 0.6 + Math.sin(time * 2) * 0.4;
        });
      }, 50);
      return () => clearInterval(interval);
    } else {
      // Fade out when crossover is not active
      const fadeInterval = setInterval(() => {
        setCrossoverGlow(prev => Math.max(0, prev - 0.1));
      }, 50);
      return () => clearInterval(fadeInterval);
    }
  }, [isCrossoverActive]);

  // Compute chart data - always show both curves for OPEX and Carbon
  const chartData = useMemo(() => {
    return timeline.map(step => ({
      year: step.year,
      groundValue: step[groundKey] as number,
      mixValue: step[mixKey] as number,
    }));
  }, [timeline, groundKey, mixKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !timeline || timeline.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, chartWidth, chartHeight);

    const chartPadding = { top: 8, right: 16, bottom: 24, left: 10 }; // Increased padding to prevent cutoff on mobile
    const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
    const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

    // Always draw two lines for ground vs mix
    // Use stable domain with padding (not auto-rescaled every render)
    const allValues = chartData.flatMap(d => [d.groundValue, d.mixValue]);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const domainPadding = (max - min) * 0.05 || 1;
    const range = (max - min) + (domainPadding * 2) || 1;
    const yMin = min - domainPadding;

    // Draw ground line (red)
    ctx.strokeStyle = groundColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    chartData.forEach((d, idx) => {
      const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * idx;
      const normalized = (d.groundValue - yMin) / range;
      const y = chartPadding.top + plotHeight - (normalized * plotHeight);
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw mix line (green) - enhanced with glow when crossover active
    ctx.strokeStyle = mixColor;
    ctx.lineWidth = 2;
    
    // Add glow effect to mix line when crossover is active
    if (isCrossoverActive && crossoverGlow > 0.1) {
      ctx.shadowBlur = 15 * crossoverGlow;
      ctx.shadowColor = mixColor;
    } else {
      ctx.shadowBlur = 0;
    }
    
    ctx.beginPath();
    chartData.forEach((d, idx) => {
      const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * idx;
      const normalized = (d.mixValue - yMin) / range;
      const y = chartPadding.top + plotHeight - (normalized * plotHeight);
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow

    // Draw forecast bands if available
    if (forecastBands && forecastKey) {
      const bands = forecastBands[forecastKey];
      if (bands && bands.length > 0) {
        // Draw p10-p90 band
        ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
        ctx.beginPath();
        bands.forEach((point, idx) => {
          const x = chartPadding.left + (plotWidth / (bands.length - 1)) * idx;
          const normalizedP90 = (point.p90 - yMin) / range;
          const yP90 = chartPadding.top + plotHeight - (normalizedP90 * plotHeight);
          if (idx === 0) {
            ctx.moveTo(x, yP90);
          } else {
            ctx.lineTo(x, yP90);
          }
        });
        // Draw bottom of band (p10)
        for (let idx = bands.length - 1; idx >= 0; idx--) {
          const x = chartPadding.left + (plotWidth / (bands.length - 1)) * idx;
          const normalizedP10 = (bands[idx].p10 - yMin) / range;
          const yP10 = chartPadding.top + plotHeight - (normalizedP10 * plotHeight);
          ctx.lineTo(x, yP10);
        }
        ctx.closePath();
        ctx.fill();

        // Draw p50 median line
        ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        bands.forEach((point, idx) => {
          const x = chartPadding.left + (plotWidth / (bands.length - 1)) * idx;
          const normalizedP50 = (point.p50 - yMin) / range;
          const yP50 = chartPadding.top + plotHeight - (normalizedP50 * plotHeight);
          if (idx === 0) {
            ctx.moveTo(x, yP50);
          } else {
            ctx.lineTo(x, yP50);
          }
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [timeline, groundKey, mixKey, groundColor, mixColor, chartData, forecastBands, forecastKey, isCrossoverActive, crossoverGlow]);

  if (!timeline || timeline.length === 0) return null;

  const lastStep = timeline[timeline.length - 1];
  const groundValue = lastStep[groundKey] as number;
  const mixValue = lastStep[mixKey] as number;
  const savings = savingsKey ? (lastStep[savingsKey] as number) : null;

  // Determine color scheme: red-dominant before crossover, green-dominant after
  // Carbon flips from red-dominant to green-dominant once crossover happens
  const isGreenDominant = isCrossoverActive;
  const groundColorClass = isGreenDominant ? "text-red-300" : "text-red-400";
  const mixColorClass = isGreenDominant ? "text-green-400" : "text-green-300";
  
  // For Carbon chart specifically: ensure green becomes dominant after crossover
  const carbonColorTransition = title === "Carbon" && isCrossoverActive;
  
  // Enhanced glow effect - visual feedback when crossover happens
  const glowStyle = isCrossoverActive && crossoverGlow > 0.1
    ? {
        boxShadow: `0 0 ${30 * crossoverGlow}px rgba(16, 185, 129, ${0.7 * crossoverGlow}), 0 0 ${60 * crossoverGlow}px rgba(16, 185, 129, ${0.3 * crossoverGlow})`,
        border: `2px solid rgba(16, 185, 129, ${0.5 * crossoverGlow})`,
      }
    : {};

  return (
    <div 
      className={`p-3 bg-gray-900/50 rounded transition-all duration-300 ${
        isCrossoverActive ? 'ring-2 ring-green-500 ring-opacity-70' : ''
      }`}
      style={glowStyle}
    >
      <div className="text-xs font-semibold text-gray-300 mb-2">{title}</div>
      <canvas ref={canvasRef} width={chartWidth} height={chartHeight} className="w-full h-24 mb-2" />
      <div className="flex justify-between items-center mb-1 text-[10px]">
        <span 
          className={groundColorClass}
          style={{
            fontWeight: carbonColorTransition ? 'normal' : 'semibold',
            opacity: carbonColorTransition ? 0.6 : 1.0,
          }}
        >
          Ground: {unitsFormatter(groundValue)}
        </span>
        <span 
          className={mixColorClass}
          style={{
            fontWeight: carbonColorTransition ? 'bold' : 'normal',
            textShadow: carbonColorTransition && crossoverGlow > 0.3
              ? `0 0 ${5 * crossoverGlow}px rgba(16, 185, 129, ${crossoverGlow})`
              : 'none',
          }}
        >
          Mix: {unitsFormatter(mixValue)}
        </span>
      </div>
      {savings !== null && savings !== undefined && (
        <div className="text-[10px] text-emerald-400">
          Savings vs all-ground: {unitsFormatter(savings)}
        </div>
      )}
      {forecastBands && forecastKey && (
        <div className="text-[10px] text-cyan-400 mt-1 flex items-center gap-1">
          <span>📊</span>
          <span>AI forecast band (10–90th percentile)</span>
        </div>
      )}
    </div>
  );
}
