"use client";

import React, { useRef, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { buildAdoptionSeries } from "../../lib/orbitSim/selectors/adoption";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";
import type { AdoptionPoint } from "../../lib/orbitSim/selectors/adoption";

interface AdoptionShareChartProps {
  scenarioMode?: ScenarioMode;
  currentYear?: number;
}

/**
 * Adoption Share Chart
 * Line chart showing % of compute from orbit vs ground over time
 */
export default function AdoptionShareChart({ 
  scenarioMode = "BASELINE",
  currentYear 
}: AdoptionShareChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Memoize data with scenarioMode dependency to ensure re-computation on scenario change
  const data = useMemo(() => buildAdoptionSeries(scenarioMode), [scenarioMode]);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - use container height
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    // Make width responsive on desktop - use more of the available space
    // CRITICAL FIX: Use full container width minus padding, not 90% which causes cutoff
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : Math.max(600, containerWidth - 32); // Use full width minus padding on desktop
    const height = containerHeight || (isMobile ? 300 : 500); // Match container height (500px on desktop)
    const margin = isMobile 
      ? { top: 20, right: 40, bottom: 50, left: 60 }
      : { top: 25, right: 50, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px for desktop to prevent x-axis cutoff
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `${Math.round(Number(d) * 100)}%`);

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
    // CRITICAL FIX: Reduce padding between x-axis and label on desktop (was 145px, now 25px)
    const xAxisLabelOffset = isMobile ? margin.bottom - 5 : 25; // 25px on desktop, 5px on mobile
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2},${innerHeight + xAxisLabelOffset})`)
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
      .text("Share");

    // Create line generators
    const orbitLine = d3.line<AdoptionPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.orbitShare))
      .curve(d3.curveMonotoneX);

    const groundLine = d3.line<AdoptionPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.groundShare))
      .curve(d3.curveMonotoneX);

    // Add area under orbit line
    const orbitArea = d3.area<AdoptionPoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.orbitShare))
      .curve(d3.curveMonotoneX);

    // Add area under ground line
    const groundArea = d3.area<AdoptionPoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.groundShare))
      .curve(d3.curveMonotoneX);

    // Draw areas
    g.append("path")
      .datum(data)
      .attr("fill", "#ef4444")
      .attr("fill-opacity", 0.3)
      .attr("d", groundArea);

    g.append("path")
      .datum(data)
      .attr("fill", "#00d4aa")
      .attr("fill-opacity", 0.3)
      .attr("d", orbitArea);

    // Draw lines
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .attr("d", groundLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#00d4aa")
      .attr("stroke-width", 2)
      .attr("d", orbitLine);

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

    // Add hover interaction
    const overlay = g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
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
            <div>Orbit: ${(point.orbitShare * 100).toFixed(1)}%</div>
            <div>Ground: ${(point.groundShare * 100).toFixed(1)}%</div>
          `;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 120}, 20)`);

    legend.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", "#00d4aa");

    legend.append("text")
      .attr("x", 16)
      .attr("y", 10)
      .style("font-size", "11px")
      .style("fill", "#94a3b8")
      .text("Orbit");

    legend.append("rect")
      .attr("x", 0)
      .attr("y", 18)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", "#ef4444");

    legend.append("text")
      .attr("x", 16)
      .attr("y", 28)
      .style("font-size", "11px")
      .style("fill", "#94a3b8")
      .text("Ground");

  }, [data, currentYear]);

  // Calculate responsive dimensions for viewBox
  const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 64, 1200) : 600;
  const isMobile = containerWidth < 640;
  const chartWidth = containerWidth;
  const chartHeight = isMobile ? 300 : 500; // Match container height

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

