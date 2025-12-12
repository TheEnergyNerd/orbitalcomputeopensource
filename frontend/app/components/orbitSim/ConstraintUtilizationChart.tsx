"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { UtilizationPoint } from "../../lib/orbitSim/selectors/constraints";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface ConstraintUtilizationChartProps {
  data: UtilizationPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
  showHeadroom?: boolean;
}

/**
 * Constraint Utilization Chart
 * Shows utilization_heat, utilization_backhaul, utilization_autonomy over time
 */
export default function ConstraintUtilizationChart({
  data,
  currentYear,
  scenarioMode,
  showHeadroom = false,
}: ConstraintUtilizationChartProps) {
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
      .text(showHeadroom ? "Headroom" : "Utilization");

    // Create line generators
    const heatLine = d3.line<UtilizationPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.heat))
      .curve(d3.curveMonotoneX);

    const backhaulLine = d3.line<UtilizationPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.backhaul))
      .curve(d3.curveMonotoneX);

    const autonomyLine = d3.line<UtilizationPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.autonomy))
      .curve(d3.curveMonotoneX);

    // Draw lines
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ef4444") // red for heat
      .attr("stroke-width", 2)
      .attr("d", heatLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6") // blue for backhaul
      .attr("stroke-width", 2)
      .attr("d", backhaulLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981") // green for autonomy
      .attr("stroke-width", 2)
      .attr("d", autonomyLine);

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
            <div style="color: #ef4444">Heat: ${(point.heat * 100).toFixed(1)}%</div>
            <div style="color: #3b82f6">Backhaul: ${(point.backhaul * 100).toFixed(1)}%</div>
            <div style="color: #10b981">Autonomy: ${(point.autonomy * 100).toFixed(1)}%</div>
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

    const legendData = [
      { label: "Heat", color: "#ef4444" },
      { label: "Backhaul", color: "#3b82f6" },
      { label: "Autonomy", color: "#10b981" },
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

  }, [data, currentYear, showHeadroom]);

  // Calculate responsive dimensions for viewBox
  const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 64, 600) : 600;
  const isMobile = containerWidth < 640;
  const chartWidth = containerWidth;
  const chartHeight = isMobile ? 280 : 350;

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

