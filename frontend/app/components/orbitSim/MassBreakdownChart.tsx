"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { MassBreakdownPoint } from "../../lib/orbitSim/selectors/physics";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface MassBreakdownChartProps {
  data: MassBreakdownPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Mass Breakdown Chart
 * Stacked area chart showing satellite mass components over time
 */
export default function MassBreakdownChart({ 
  data, 
  currentYear, 
  scenarioMode 
}: MassBreakdownChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - use container height to match parent
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    // Make width responsive on desktop - use more of the available space
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : Math.max(600, containerWidth - 32); // Use full width minus padding on desktop
    const height = containerHeight || (isMobile ? 300 : 350);
    
    // Set SVG dimensions to match container
    svg.attr("width", width).attr("height", height);
    const margin = isMobile 
      ? { top: 20, right: 30, bottom: 60, left: 50 } // Increased bottom margin for mobile
      : { top: 25, right: 80, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px for desktop to prevent x-axis cutoff
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth]);

    const totalMasses = data.map(d => d.solar + d.radiator + d.silicon + d.shielding + d.structure).filter(v => isFinite(v) && v > 0);
    // CRITICAL FIX: Y-axis domain should be based on actual data, not hardcoded
    // If data exceeds 13 kg, the colors won't show. Use dynamic max with reasonable padding
    const maxTotalMass = totalMasses.length > 0 ? d3.max(totalMasses)! : 13;
    const yDomainMin = 0;
    const yDomainMax = Math.max(13, maxTotalMass * 1.1); // At least 13 kg, or 10% above max if higher
    const yScale = d3.scaleLinear()
      .domain([yDomainMin, yDomainMax])
      .nice()
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => {
        const val = Number(d);
        if (val >= 1000) {
          return `${(val / 1000).toFixed(1)}k kg`;
        } else {
          return `${val.toFixed(0)} kg`;
        }
      });

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", isMobile ? "7px" : "9px")
      .style("fill", "#94a3b8");

    g.append("g")
      .call(yAxis)
      .selectAll("text")
      .style("font-size", isMobile ? "8px" : "10px")
      .style("fill", "#94a3b8");

    // Axis labels
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2},${innerHeight + margin.bottom - 5})`)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Year");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Mass (kg)");

    // Stack the data
    const stack = d3.stack<MassBreakdownPoint>()
      .keys(["solar", "radiator", "silicon", "shielding", "structure"])
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    const stackedData = stack(data);

    // Color scale
    const colors = {
      solar: "#fbbf24",      // yellow
      radiator: "#3b82f6",   // blue
      silicon: "#8b5cf6",    // purple
      shielding: "#ef4444",  // red
      structure: "#6b7280",  // gray
    };

    // Create area generator
    const area = d3.area<d3.SeriesPoint<MassBreakdownPoint>>()
      .x(d => xScale(d.data.year))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    // Draw stacked areas
    stackedData.forEach((series, i) => {
      const key = series.key as keyof typeof colors;
      g.append("path")
        .datum(series)
        .attr("fill", colors[key])
        .attr("fill-opacity", 0.7)
        .attr("d", area);
    });

    // Add current year indicator
    if (currentYear) {
      const x = xScale(currentYear);
      g.append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4")
        .attr("opacity", 0.5);
    }

    // Add hover interaction - overlay must be on top to catch events
    const overlay = g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .style("pointer-events", "all")
      .on("mousemove", function(event) {
        const [mouseX] = d3.pointer(event);
        const year = Math.round(xScale.invert(mouseX));
        const point = data.find(d => Math.abs(d.year - year) < 2) || data[data.length - 1];
        
        if (tooltipRef.current && point) {
          const total = point.solar + point.radiator + point.silicon + point.shielding + point.structure;
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${event.clientX + 10}px`;
          tooltipRef.current.style.top = `${event.clientY - 10}px`;
          tooltipRef.current.innerHTML = `
            <div><strong>${point.year}</strong></div>
            <div style="color: #fbbf24">Solar: ${(point.solar / 1000).toFixed(1)}k kg</div>
            <div style="color: #3b82f6">Radiator: ${(point.radiator / 1000).toFixed(1)}k kg</div>
            <div style="color: #8b5cf6">Silicon: ${(point.silicon / 1000).toFixed(1)}k kg</div>
            <div style="color: #ef4444">Shielding: ${(point.shielding / 1000).toFixed(1)}k kg</div>
            <div style="color: #6b7280">Structure: ${(point.structure / 1000).toFixed(1)}k kg</div>
            <div style="border-top: 1px solid #94a3b8; margin-top: 4px; padding-top: 4px">Total: ${(total / 1000).toFixed(1)}k kg</div>
          `;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add legend (responsive position)
    const legendX = isMobile ? innerWidth - 100 : innerWidth - 120;
    const legend = g.append("g")
      .attr("transform", `translate(${legendX}, 20)`);

    const legendData = [
      { label: "Solar", color: "#fbbf24" },
      { label: "Radiator", color: "#3b82f6" },
      { label: "Silicon", color: "#8b5cf6" },
      { label: "Shielding", color: "#ef4444" },
      { label: "Structure", color: "#6b7280" },
    ];

    legendData.forEach((item, i) => {
      const y = i * 18;
      legend.append("rect")
        .attr("x", 0)
        .attr("y", y)
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", item.color)
        .attr("fill-opacity", 0.7);

      legend.append("text")
        .attr("x", 16)
        .attr("y", y + 10)
        .style("font-size", isMobile ? "9px" : "11px")
        .style("fill", "#94a3b8")
        .text(item.label);
    });

  }, [data, currentYear, scenarioMode]);

  if (data.length === 0) {
    return <div className="text-slate-400 text-sm">No mass breakdown data available</div>;
  }

  return (
    <div className="relative w-full h-full">
      <svg 
        ref={svgRef} 
        className="w-full h-full" 
        preserveAspectRatio="xMidYMid meet"
      />
      <div
        ref={tooltipRef}
        className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white pointer-events-none z-50"
        style={{ display: "none" }}
      />
    </div>
  );
}
