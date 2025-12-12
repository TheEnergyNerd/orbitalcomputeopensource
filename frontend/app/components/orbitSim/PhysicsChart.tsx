"use client";

import { useRef, useEffect, useMemo, useState } from "react";

export interface ChartDataPoint {
  year: number;
  [key: string]: number;
}

interface PhysicsChartProps {
  title: string;
  data: ChartDataPoint[];
  dataKeys: Array<{ key: string; label: string; color: string; type?: "line" | "area" | "bar" }>;
  width?: number;
  height?: number;
  yAxisLabel?: string;
  yAxisFormatter?: (v: number) => string;
  stacked?: boolean;
}

export default function PhysicsChart({
  title,
  data,
  dataKeys,
  width = 600,
  height = 260,
  yAxisLabel,
  yAxisFormatter = (v) => v.toFixed(1),
  stacked = false,
}: PhysicsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: width, height: height });

  // Calculate responsive dimensions based on container
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Use container width minus padding (p-3 sm:p-4 = ~24-32px total)
      const availableWidth = containerWidth - 32;
      const availableHeight = containerHeight - 60; // Account for title and padding only
      
      // Maintain aspect ratio but respect container bounds
      // Add extra space for labels (we'll account for this in padding)
      const aspectRatio = width / height;
      let chartWidth = Math.min(availableWidth - 80, width); // Reserve 80px for labels
      let chartHeight = chartWidth / aspectRatio;
      
      // If height is too tall, constrain by height instead
      if (chartHeight > availableHeight - 60) { // Reserve 60px for labels
        chartHeight = availableHeight - 60;
        chartWidth = chartHeight * aspectRatio;
      }
      
      // Minimum sizes - ensure charts are large enough
      chartWidth = Math.max(chartWidth, 300);
      chartHeight = Math.max(chartHeight, 200);
      
      setDimensions({ width: chartWidth, height: chartHeight });
    };

    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);
    
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Enable high DPI rendering
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = dimensions.width;
    const displayHeight = dimensions.height;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Padding: enough space for labels outside the plot area
    const padding = { top: 15, right: 20, bottom: 30, left: 55 };
    const plotWidth = displayWidth - padding.left - padding.right;
    const plotHeight = displayHeight - padding.top - padding.bottom;

    // Find min/max values across all data keys
    const allValues: number[] = [];
    data.forEach(d => {
      dataKeys.forEach(({ key }) => {
        const val = d[key];
        if (typeof val === 'number' && isFinite(val)) {
          allValues.push(val);
        }
      });
    });

    if (allValues.length === 0) return;

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const domainPadding = (max - min) * 0.05 || 1;
    const range = (max - min) + (domainPadding * 2) || 1;
    const yMin = min - domainPadding;
    const yMax = max + domainPadding;
    const yRange = yMax - yMin || 1;

    // Draw subtle grid lines
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (plotHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
    }

    // Draw axes with better styling
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.stroke();

    // Draw Y-axis labels with better styling - positioned to the left of the plot
    ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 5; i++) {
      const value = yMax - (yRange / 5) * i;
      const y = padding.top + (plotHeight / 5) * i;
      const labelText = yAxisFormatter(value);
      // Position labels clearly to the left of the plot area
      ctx.fillText(labelText, padding.left - 12, y);
    }

    // Draw X-axis labels (years) - positioned below the plot area
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const firstYear = data[0]?.year ?? 0;
    const lastYear = data[data.length - 1]?.year ?? 0;
    const yearStep = Math.max(1, Math.ceil(data.length / 6));
    data.forEach((d, idx) => {
      if (idx % yearStep === 0 || idx === data.length - 1) {
        const x = padding.left + (plotWidth / (data.length - 1 || 1)) * idx;
        // Position labels clearly below the plot area
        ctx.fillText(String(d.year), x, padding.top + plotHeight + 12);
      }
    });

    // Draw data series with better styling
    if (stacked && dataKeys.some(k => k.type === "area")) {
      // Stacked area chart - build cumulative values first
      const cumulativeValues: number[][] = [];
      dataKeys.forEach((_, seriesIdx) => {
        cumulativeValues[seriesIdx] = [];
        data.forEach((d, dataIdx) => {
          let sum = 0;
          for (let i = 0; i <= seriesIdx; i++) {
            const k = dataKeys[i].key;
            sum += d[k] ?? 0;
          }
          cumulativeValues[seriesIdx][dataIdx] = sum;
        });
      });

      // Draw each area on top of previous
      dataKeys.forEach(({ key, label, color, type }, seriesIdx) => {
        if (type === "area") {
          const baseValues = seriesIdx > 0 ? cumulativeValues[seriesIdx - 1] : new Array(data.length).fill(0);
          const topValues = cumulativeValues[seriesIdx];
          
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          
          // Draw top line
          data.forEach((d, idx) => {
            const x = padding.left + (plotWidth / (data.length - 1 || 1)) * idx;
            const value = topValues[idx];
            const normalized = (value - yMin) / yRange;
            const y = padding.top + plotHeight - (normalized * plotHeight);
            
            if (idx === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          
          // Draw bottom line (backwards)
          for (let idx = data.length - 1; idx >= 0; idx--) {
            const x = padding.left + (plotWidth / (data.length - 1 || 1)) * idx;
            const baseValue = baseValues[idx];
            const normalized = (baseValue - yMin) / yRange;
            const y = padding.top + plotHeight - (normalized * plotHeight);
            ctx.lineTo(x, y);
          }
          
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      });
    } else {
      // Non-stacked charts
      dataKeys.forEach(({ key, label, color, type = "line" }) => {
        if (type === "bar") {
        // Bar chart with better styling
        ctx.fillStyle = color;
        const barWidth = (plotWidth / data.length) * 0.6;
        const barSpacing = (plotWidth / data.length) * 0.4;
        data.forEach((d, idx) => {
          const x = padding.left + (plotWidth / data.length) * idx + barSpacing / 2;
          const value = d[key] ?? 0;
          const normalized = (value - yMin) / yRange;
          const barHeight = normalized * plotHeight;
          ctx.fillRect(x, padding.top + plotHeight - barHeight, barWidth, barHeight);
        });
      } else {
        // Line chart with smooth rendering
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        data.forEach((d, idx) => {
          const x = padding.left + (plotWidth / (data.length - 1 || 1)) * idx;
          const value = d[key] ?? 0;
          const normalized = (value - yMin) / yRange;
          const y = padding.top + plotHeight - (normalized * plotHeight);
          
          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
      });
    }

    // Draw legend - position it outside the plot area (to the right) or inside top-right if needed
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    
    const legendItemHeight = 18;
    const totalLegendHeight = dataKeys.length * legendItemHeight;
    const legendWidth = 140; // Estimated width for legend
    
    // Try to position legend to the right of the plot
    const legendX = padding.left + plotWidth + 15;
    const legendStartY = padding.top + 5;
    
    // Check if legend fits on the right side
    const fitsOnRight = legendX + legendWidth <= displayWidth - 10;
    
    // If it doesn't fit, position it inside the plot area (top-right corner)
    const finalLegendX = fitsOnRight ? legendX : padding.left + plotWidth - legendWidth - 5;
    const finalLegendY = fitsOnRight ? legendStartY : padding.top + 5;
    
    // Draw a semi-transparent background for inside legend
    if (!fitsOnRight) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)"; // slate-950 with opacity
      ctx.fillRect(finalLegendX - 5, finalLegendY - 5, legendWidth + 10, totalLegendHeight + 10);
    }
    
    dataKeys.forEach(({ label, color }, idx) => {
      const x = finalLegendX;
      const y = finalLegendY + idx * legendItemHeight;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 5, 14, 2);
      ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
      ctx.fillText(label, x + 18, y);
    });
  }, [data, dataKeys, dimensions, yAxisFormatter, stacked]);

  return (
    <div 
      ref={containerRef}
      className="rounded-2xl border border-slate-800 bg-slate-950/85 p-3 sm:p-4 w-full"
    >
      <div className="text-xs font-semibold text-slate-100 mb-2">{title}</div>
      <div className="w-full flex justify-center">
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="max-w-full h-auto"
          style={{ imageRendering: 'crisp-edges' }}
        />
      </div>
    </div>
  );
}

