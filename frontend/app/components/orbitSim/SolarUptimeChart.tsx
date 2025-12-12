"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { SolarUptimePoint } from "../../lib/orbitSim/selectors/physics";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface SolarUptimeChartProps {
  data: SolarUptimePoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Solar Uptime Chart
 * Shows space solar uptime vs ground solar+storage uptime
 */
export default function SolarUptimeChart({ 
  data, 
  currentYear, 
  scenarioMode 
}: SolarUptimeChartProps) {
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
      ? { top: 20, right: 40, bottom: 50, left: 60 }
      : { top: 25, right: 80, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px for desktop to prevent x-axis cutoff
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth])
      .nice();

    // For percentages, use actual data range with padding
    const allValues = data.flatMap(d => [d.orbitUptime, d.groundSolarPlusStorageUptime]);
    const minUptime = d3.min(allValues) ?? 0;
    const maxUptime = d3.max(allValues) ?? 100;
    // Add padding but keep within reasonable bounds
    const yDomainMin = Math.max(0, minUptime > 0 ? minUptime * 0.95 : 0);
    const yDomainMax = Math.min(100, maxUptime < 100 ? maxUptime * 1.05 : 100);
    
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
      .tickFormat(d => `${Number(d).toFixed(0)}%`);

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
      .text("Uptime (%)");

    // Create line generators
    const orbitLine = d3.line<SolarUptimePoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.orbitUptime))
      .curve(d3.curveMonotoneX);

    const groundLine = d3.line<SolarUptimePoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.groundSolarPlusStorageUptime))
      .curve(d3.curveMonotoneX);

    // Draw lines
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#00d4aa") // teal for orbit
      .attr("stroke-width", 2.5)
      .attr("d", orbitLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ef4444") // red for ground
      .attr("stroke-width", 2)
      .attr("d", groundLine);

    // Add areas under lines
    const orbitArea = d3.area<SolarUptimePoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.orbitUptime))
      .curve(d3.curveMonotoneX);

    const groundArea = d3.area<SolarUptimePoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.groundSolarPlusStorageUptime))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "#00d4aa")
      .attr("fill-opacity", 0.2)
      .attr("d", orbitArea);

    g.append("path")
      .datum(data)
      .attr("fill", "#ef4444")
      .attr("fill-opacity", 0.2)
      .attr("d", groundArea);

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
            <div style="color: #00d4aa">Orbit: ${point.orbitUptime.toFixed(1)}%</div>
            <div style="color: #ef4444">Ground+Storage: ${point.groundSolarPlusStorageUptime.toFixed(1)}%</div>
            <div>Advantage: ${(point.orbitUptime - point.groundSolarPlusStorageUptime).toFixed(1)}%</div>
          `;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add legend (responsive position)
    const legendX = isMobile ? innerWidth - 120 : innerWidth - 140;
    const legend = g.append("g")
      .attr("transform", `translate(${legendX}, 20)`);

    const legendData = [
      { label: "Orbit Solar", color: "#00d4aa" },
      { label: "Ground+Storage", color: "#ef4444" },
    ];

    legendData.forEach((item, i) => {
      const y = i * 20;
      legend.append("line")
        .attr("x1", 0)
        .attr("x2", 12)
        .attr("y1", y + 6)
        .attr("y2", y + 6)
        .attr("stroke", item.color)
        .attr("stroke-width", 2);

      legend.append("text")
        .attr("x", 16)
        .attr("y", y + 10)
        .style("font-size", isMobile ? "9px" : "11px")
        .style("fill", "#94a3b8")
        .text(item.label);
    });

  }, [data, currentYear]);

  if (data.length === 0) {
    return <div className="text-slate-400 text-sm">No solar uptime data available</div>;
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
