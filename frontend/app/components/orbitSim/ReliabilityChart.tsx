"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ReliabilityPoint } from "../../lib/orbitSim/selectors/constraints";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface ReliabilityChartProps {
  data: ReliabilityPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Reliability Chart
 * Shows survival_fraction vs year
 */
export default function ReliabilityChart({
  data,
  currentYear,
  scenarioMode,
}: ReliabilityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Match Futures Scenarios chart sizing
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 600;
    const isMobile = containerWidth < 640;
    
    // Use full container dimensions like Futures charts
    const width = containerWidth;
    const height = containerHeight;
    
    // Set SVG dimensions explicitly to fill container
    svg.attr("width", width).attr("height", height);
    
    // Match Futures charts margins
    const margin = isMobile 
      ? { top: 20, right: 30, bottom: 40, left: 50 }
      : { top: 20, right: 30, bottom: 40, left: 50 }; // Same margins as Futures charts
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth])
      .nice();

    // Tighten Y-axis for Fleet Survival: 96%-100% range with 1% increments
    const minSurvival = d3.min(data, d => d.survivalFraction) ?? 0.96;
    const maxSurvival = d3.max(data, d => d.survivalFraction) ?? 1.0;
    // Clamp to 96%-100% range to show detail
    const yMin = Math.max(0.96, Math.min(minSurvival, 0.96));
    const yMax = Math.min(1.0, Math.max(maxSurvival, 1.0));
    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    // Y-axis with 1% increments (0.01 steps) for 96%-100% range
    const yAxis = d3.axisLeft(yScale)
      .ticks(5) // Show ~5 ticks for 96%-100% range
      .tickFormat(d => {
        const val = Number(d);
        return `${Math.round(val * 100)}%`;
      });

    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);
    
    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "7px" : "9px")
      .style("fill", "#94a3b8");
    
    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    const yAxisGroup = g.append("g")
      .call(yAxis);
    
    yAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");
    
    yAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

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
      .text("Survival Fraction");

    // Create line generator
    const line = d3.line<ReliabilityPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.survivalFraction))
      .curve(d3.curveMonotoneX);

    // Draw line
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    // Add area under line
    const area = d3.area<ReliabilityPoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.survivalFraction))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "#10b981")
      .attr("fill-opacity", 0.2)
      .attr("d", area);

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
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${event.clientX + 10}px`;
          tooltipRef.current.style.top = `${event.clientY - 10}px`;
          tooltipRef.current.innerHTML = `
            <div><strong>${point.year}</strong></div>
            <div>Survival: ${(point.survivalFraction * 100).toFixed(1)}%</div>
          `;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

  }, [data, currentYear]);

  // Calculate responsive dimensions for viewBox
  const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 64, 600) : 600;
  const isMobile = containerWidth < 640;
  const chartWidth = containerWidth;
  const chartHeight = isMobile ? 250 : 300;

  return (
    <div className="relative w-full h-full">
      <svg 
        ref={svgRef} 
        className="w-full h-full"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
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

