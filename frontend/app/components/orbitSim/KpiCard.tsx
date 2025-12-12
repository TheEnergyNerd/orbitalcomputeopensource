"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import type { ForecastBands } from "../../lib/orbitSim/forecast";
import { calculateCostCrossover } from "../../lib/orbitSim/costCrossover";
import { calculateCarbonCrossover } from "../../lib/orbitSim/carbonModel";
import { ChartTooltip } from "./ChartTooltip";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [crossoverGlow, setCrossoverGlow] = useState(0); // 0-1 glow intensity
  const [crossoverPulse, setCrossoverPulse] = useState(0); // 0-1 pulse intensity (for dot)
  const [hasPulsed, setHasPulsed] = useState(false); // Track if we've already pulsed
  // Responsive chart dimensions - use container dimensions properly
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window === 'undefined') return { width: 200, height: 100, isMobile: false };
    const isMobile = window.innerWidth < 640;
    return { 
      width: isMobile ? 120 : 200,
      height: isMobile ? 90 : 100,
      isMobile 
    };
  });
  
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const isMobile = window.innerWidth < 640;
      
      setDimensions({
        width: Math.max(100, containerWidth - 16), // Account for padding
        height: Math.max(80, containerHeight - 60), // Account for title and labels
        isMobile
      });
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      resizeObserver.disconnect();
    };
  }, []);
  
  const chartWidth = dimensions.width;
  const chartHeight = dimensions.height;
  const isMobile = dimensions.isMobile;
  
  // Calculate crossover year for cost/carbon charts
  const crossoverYear = useMemo(() => {
    if (title === "Cost / Compute" || title === "Annual OPEX") {
      // CRITICAL FIX: mixKey is orbital/mix costs, groundKey is ground costs
      const orbitalCosts = timeline.map(s => ({ year: s.year, cost: s[mixKey] as number }));
      const groundCosts = timeline.map(s => ({ year: s.year, cost: s[groundKey] as number }));
      const result = calculateCostCrossover(orbitalCosts, groundCosts);
      return result.crossover_year;
    } else if (title === "Carbon") {
      // CRITICAL FIX: mixKey is orbital/mix carbon, groundKey is ground carbon
      const orbitalCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s[mixKey] as number) * 1000 }));
      const groundCarbon = timeline.map(s => ({ year: s.year, carbon_kg: (s[groundKey] as number) * 1000 }));
      const result = calculateCarbonCrossover(groundCarbon, orbitalCarbon);
      return result.crossover_year;
    }
    return null;
  }, [timeline, title, groundKey, mixKey]);
  
  // Check if current year is at or past crossover
  // Also check if mix is currently cheaper than ground (for cases where crossover detection fails)
  const currentYear = timeline.length > 0 ? timeline[timeline.length - 1].year : null;
  const lastStep = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const mixValue = lastStep ? (lastStep[mixKey] as number) : null;
  const groundValue = lastStep ? (lastStep[groundKey] as number) : null;
  const isCurrentlyCheaper = mixValue !== null && groundValue !== null && mixValue < groundValue;
  const isCrossoverActive = (crossoverYear !== null && currentYear !== null && currentYear >= crossoverYear) || isCurrentlyCheaper;
  
  // Debug logging for chart values
  useEffect(() => {
    if (lastStep && currentYear) {
      console.log(`[KpiCard:${title}] Year ${currentYear}:`, {
        groundKey,
        groundValue,
        mixKey,
        mixValue,
        isCurrentlyCheaper,
        crossoverYear,
        timelineLength: timeline.length,
      });
    }
  }, [title, currentYear, groundValue, mixValue, groundKey, mixKey, lastStep, timeline.length, isCurrentlyCheaper, crossoverYear]);
  
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

  // Pulse dot at crossover point (2-3 times then stop)
  useEffect(() => {
    if (crossoverYear && !hasPulsed && title === "Cost / Compute") {
      // Start pulse animation
      const maxPulses = 3;
      const pulseDuration = 600; // ms per pulse
      const startTime = Date.now();
      let animationFrameId: number;
      
      const pulse = () => {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed % pulseDuration) / pulseDuration;
        // Sin wave for smooth pulse: 0 -> 1 -> 0
        const intensity = Math.sin(progress * Math.PI);
        setCrossoverPulse(intensity);
        
        if (elapsed < pulseDuration * maxPulses) {
          animationFrameId = requestAnimationFrame(pulse);
        } else {
          // Stop pulsing after maxPulses
          setCrossoverPulse(0);
          setHasPulsed(true);
        }
      };
      
      animationFrameId = requestAnimationFrame(pulse);
      
      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    }
  }, [crossoverYear, hasPulsed, title]);

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

    // Enable high DPI rendering to fix fuzzy charts
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = chartWidth;
    const displayHeight = chartHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const chartPadding = { 
      top: 12, 
      right: 20, 
      bottom: isMobile ? 28 : 35, // More space for axis labels
      left: 40 // More space for Y-axis labels
    };
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
    const yMax = max + domainPadding;

    // Draw gridlines (horizontal)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = chartPadding.top + (plotHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(chartPadding.left, y);
      ctx.lineTo(chartPadding.left + plotWidth, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    // X-axis
    ctx.beginPath();
    ctx.moveTo(chartPadding.left, chartPadding.top + plotHeight);
    ctx.lineTo(chartPadding.left + plotWidth, chartPadding.top + plotHeight);
    ctx.stroke();
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(chartPadding.left, chartPadding.top);
    ctx.lineTo(chartPadding.left, chartPadding.top + plotHeight);
    ctx.stroke();

    // Y-axis tick marks (lines) - show tick marks but not text labels
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridLines; i++) {
      const y = chartPadding.top + (plotHeight / gridLines) * i;
      // Draw tick mark on Y-axis
      ctx.beginPath();
      ctx.moveTo(chartPadding.left, y);
      ctx.lineTo(chartPadding.left - 5, y); // 5px tick mark
      ctx.stroke();
    }

    // Draw X-axis labels (year)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const yearStep = Math.max(1, Math.floor(chartData.length / 5)); // Show ~5 year labels
    chartData.forEach((d, idx) => {
      if (idx % yearStep === 0 || idx === chartData.length - 1) {
        const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * idx;
        ctx.fillText(String(d.year), x, chartPadding.top + plotHeight + 4);
      }
    });

    // Draw shaded savings area (between ground and mix lines) - only if mix is better
    if (showBothCurves && mixValue !== null && groundValue !== null && mixValue < groundValue) {
      ctx.fillStyle = "rgba(16, 185, 129, 0.2)"; // Green tint for savings
      ctx.beginPath();
      chartData.forEach((d, idx) => {
        const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * idx;
        const normalizedGround = (d.groundValue - yMin) / range;
        const normalizedMix = (d.mixValue - yMin) / range;
        const yGround = chartPadding.top + plotHeight - (normalizedGround * plotHeight);
        const yMix = chartPadding.top + plotHeight - (normalizedMix * plotHeight);
        if (idx === 0) {
          ctx.moveTo(x, yGround);
        } else {
          ctx.lineTo(x, yGround);
        }
      });
      // Draw bottom of area (mix line, reversed)
      for (let idx = chartData.length - 1; idx >= 0; idx--) {
        const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * idx;
        const normalizedMix = (chartData[idx].mixValue - yMin) / range;
        const yMix = chartPadding.top + plotHeight - (normalizedMix * plotHeight);
        ctx.lineTo(x, yMix);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Draw ground line (red) - dashed, thinner, less prominent
    ctx.strokeStyle = groundColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line
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
    ctx.setLineDash([]); // Reset dash

    // Draw mix line (green) - solid, thicker, emphasized as the "winner"
    // First draw filled area under mix line (subtle green tint)
    ctx.fillStyle = "rgba(16, 185, 129, 0.1)";
    ctx.beginPath();
    chartData.forEach((d, idx) => {
      const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * idx;
      const normalized = (d.mixValue - yMin) / range;
      const y = chartPadding.top + plotHeight - (normalized * plotHeight);
      if (idx === 0) {
        ctx.moveTo(x, chartPadding.top + plotHeight);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    // Close path to bottom
    const lastX = chartPadding.left + plotWidth;
    ctx.lineTo(lastX, chartPadding.top + plotHeight);
    ctx.lineTo(chartPadding.left, chartPadding.top + plotHeight);
    ctx.closePath();
    ctx.fill();
    
    // Draw mix line on top (solid, thicker)
    ctx.strokeStyle = mixColor;
    ctx.lineWidth = 3; // Thicker line for emphasis
    ctx.setLineDash([]); // Solid line
    
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

    // Draw crossover annotation line (vertical line at crossover year)
    if (crossoverYear && title === "Cost / Compute") {
      const crossoverIndex = chartData.findIndex(d => d.year === crossoverYear);
      if (crossoverIndex >= 0) {
        const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * crossoverIndex;
        ctx.strokeStyle = "#fbbf24"; // Yellow
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, chartPadding.top);
        ctx.lineTo(x, chartPadding.top + plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Crossover label
        ctx.fillStyle = "#fbbf24";
        ctx.font = "8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(`Crossover ${crossoverYear}`, x, chartPadding.top - 2);
      }
    }

    // Draw pulsing dot at crossover point (for Cost / Compute chart)
    if (crossoverYear && title === "Cost / Compute" && crossoverPulse > 0.1) {
      const crossoverPoint = chartData.find(d => d.year === crossoverYear);
      if (crossoverPoint) {
        const crossoverIndex = chartData.findIndex(d => d.year === crossoverYear);
        const x = chartPadding.left + (plotWidth / (chartData.length - 1)) * crossoverIndex;
        const normalized = (crossoverPoint.mixValue - yMin) / range;
        const y = chartPadding.top + plotHeight - (normalized * plotHeight);
        
        // Draw pulsing dot
        const baseRadius = 6;
        const pulseRadius = baseRadius + (crossoverPulse * 4); // Pulse from 6 to 10
        const pulseOpacity = 0.3 + (crossoverPulse * 0.7); // Pulse opacity
        
        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16, 185, 129, ${pulseOpacity})`; // emerald with pulse opacity
        ctx.fill();
        
        // Inner dot
        ctx.beginPath();
        ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = mixColor;
        ctx.fill();
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

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
  }, [timeline, groundKey, mixKey, groundColor, mixColor, chartData, forecastBands, forecastKey, isCrossoverActive, crossoverGlow, crossoverYear, crossoverPulse, title]);

  if (!timeline || timeline.length === 0) return null;

  // Use lastStep, mixValue, and groundValue from above (already defined)
  // Convert null values to 0 for display
  const groundValueDisplay = groundValue ?? 0;
  const mixValueDisplay = mixValue ?? 0;
  const savings = savingsKey && lastStep ? (lastStep[savingsKey] as number) : null;

  // Chart tooltip helper
  const getValueAtPosition = (x: number, y: number) => {
    if (!canvasRef.current || !chartData || chartData.length === 0) return null;
    const chartPadding = { top: 8, right: 16, bottom: 24, left: 10 };
    const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
    const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
    
    const index = Math.round(((x - chartPadding.left) / plotWidth) * (chartData.length - 1));
    if (index >= 0 && index < chartData.length) {
      return {
        year: chartData[index].year,
        value: chartData[index].mixValue
      };
    }
    return null;
  };

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
      ref={containerRef}
      className={`p-3 bg-gray-900/50 rounded transition-all duration-300 ${
        isCrossoverActive ? 'ring-2 ring-green-500 ring-opacity-70' : ''
      }`}
      style={glowStyle}
      suppressHydrationWarning
    >
      <div className="text-xs font-semibold text-gray-300 mb-2">{title}</div>
      <div className="relative w-full" style={{ height: `${chartHeight}px` }}>
        <canvas ref={canvasRef} width={chartWidth} height={chartHeight} className="w-full h-full cursor-crosshair" />
        <ChartTooltip 
          canvasRef={canvasRef} 
          data={chartData.map(d => ({ year: d.year, value: d.mixValue }))} 
          getValueAtPosition={getValueAtPosition} 
        />
      </div>
      <div className="flex justify-between items-center mb-1 text-[10px]">
        <span 
          className={groundColorClass}
          style={{
            fontWeight: carbonColorTransition ? 'normal' : 'semibold',
            opacity: carbonColorTransition ? 0.6 : 1.0,
          }}
          suppressHydrationWarning
        >
          Ground: {unitsFormatter(groundValueDisplay)}
        </span>
        <span 
          className={mixColorClass}
          style={{
            fontWeight: carbonColorTransition ? 'bold' : 'normal',
            textShadow: carbonColorTransition && crossoverGlow > 0.3
              ? `0 0 ${5 * crossoverGlow}px rgba(16, 185, 129, ${crossoverGlow})`
              : 'none',
          }}
          suppressHydrationWarning
        >
          Mix: {unitsFormatter(mixValueDisplay)}
        </span>
      </div>
      {savings !== null && savings !== undefined && (
        <div className="text-[10px] text-emerald-400" suppressHydrationWarning>
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
