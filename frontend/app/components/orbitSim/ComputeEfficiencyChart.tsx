"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ComputeEfficiencyPoint } from "../../lib/orbitSim/selectors/scenarios";

interface ComputeEfficiencyChartProps {
  data: ComputeEfficiencyPoint[];
  currentYear?: number;
}

/**
 * Compute Efficiency Trajectory Bar Chart
 * Shows PFLOPS/kW improvement over time with Moore's Law reference
 */
export default function ComputeEfficiencyChart({ 
  data, 
  currentYear 
}: ComputeEfficiencyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : Math.max(600, containerWidth - 32);
    const height = containerHeight || (isMobile ? 300 : 600);
    const margin = isMobile 
      ? { top: 20, right: 30, bottom: 100, left: 50 }
      : { top: 25, right: 80, bottom: 25, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.year.toString()))
      .range([0, innerWidth])
      .padding(0.2);

    const maxValue = d3.max(data, d => Math.max(d.pflopsPerKw, d.mooreLawLimit, d.h100Baseline)) || 100;
    const yScale = d3.scaleLinear()
      .domain([0, maxValue * 1.2])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add grid lines
    const yTicks = yScale.ticks(5);
    g.selectAll(".grid-line")
      .data(yTicks)
      .enter()
      .append("line")
      .attr("class", "grid-line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", d => yScale(d))
      .attr("y2", d => yScale(d))
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 1);

    // Add H100 baseline reference line
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(3))
      .attr("y2", yScale(3))
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2")
      .attr("opacity", 0.5);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(3) - 5)
      .attr("text-anchor", "end")
      .style("fill", "#94a3b8")
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "10px")
      .text("H100 baseline (3 PFLOPS/kW)");

    // Add Moore's Law limit line
    const mooreLine = d3.line<ComputeEfficiencyPoint>()
      .x(d => (xScale(d.year.toString()) || 0) + xScale.bandwidth() / 2)
      .y(d => yScale(d.mooreLawLimit))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ff8c00")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("d", mooreLine);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(data[data.length - 1]?.mooreLawLimit || 0) - 5)
      .attr("text-anchor", "end")
      .style("fill", "#ff8c00")
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "10px")
      .text("Moore's Law limit");

    // Add bars
    const bars = g.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(d.year.toString()) || 0)
      .attr("width", xScale.bandwidth())
      .attr("y", d => yScale(Math.max(0, d.pflopsPerKw)))
      .attr("height", d => innerHeight - yScale(Math.max(0, d.pflopsPerKw)))
      .attr("fill", d => {
        // Color bars: cyan if under Moore's Law limit, orange if above
        return d.pflopsPerKw > d.mooreLawLimit * 1.5 
          ? "rgba(255, 140, 0, 0.7)" 
          : "rgba(0, 240, 255, 0.7)";
      })
      .attr("stroke", d => {
        return d.pflopsPerKw > d.mooreLawLimit * 1.5 
          ? "#ff8c00" 
          : "#00f0ff";
      })
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("mouseenter", function(event, d) {
        d3.select(this).attr("opacity", 0.8);
        
        // Update tooltip
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "block";
          const isAboveMoore = d.pflopsPerKw > d.mooreLawLimit * 1.5;
          tooltipRef.current.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 4px;">${d.year}</div>
            <div style="color: #00f0ff;">Actual: ${d.pflopsPerKw.toFixed(2)} PFLOPS/kW</div>
            <div style="color: #ff8c00;">Moore's Law: ${d.mooreLawLimit.toFixed(2)} PFLOPS/kW</div>
            <div style="color: #94a3b8;">H100 Baseline: ${d.h100Baseline} PFLOPS/kW</div>
            <div style="margin-top: 4px; border-top: 1px solid #1e293b; padding-top: 4px; color: ${isAboveMoore ? '#ff8c00' : '#00ff88'};">
              ${isAboveMoore ? 'Above Moore\'s Law' : 'Within Moore\'s Law'}
            </div>
          `;
        }
      })
      .on("mouseleave", function() {
        d3.select(this).attr("opacity", 1);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => d);
    
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => d.toString());

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("class", "axis")
      .call(xAxis)
      .selectAll("text")
      .style("fill", "#94a3b8")
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", isMobile ? "10px" : "11px");

    g.append("g")
      .attr("class", "axis")
      .call(yAxis)
      .selectAll("text")
      .style("fill", "#94a3b8")
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", isMobile ? "10px" : "11px");

    // Add axis labels
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2}, ${innerHeight + (isMobile ? 70 : 40)})`)
      .style("text-anchor", "middle")
      .style("fill", "#94a3b8")
      .style("font-family", "'Space Grotesk', sans-serif")
      .style("font-size", isMobile ? "11px" : "12px")
      .text("Year");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -50)
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("fill", "#94a3b8")
      .style("font-family", "'Space Grotesk', sans-serif")
      .style("font-size", isMobile ? "11px" : "12px")
      .text("PFLOPS / kW");

    // Add current year indicator
    if (currentYear) {
      const yearStr = currentYear.toString();
      const xPos = (xScale(yearStr) || 0) + xScale.bandwidth() / 2;
      if (xPos >= 0 && xPos <= innerWidth) {
        g.append("line")
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .attr("stroke", "#00f0ff")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "4,4")
          .attr("opacity", 0.7);
      }
    }

  }, [data, currentYear]);

  return (
    <div className="relative w-full h-full" style={{ pointerEvents: 'all' }}>
      <svg ref={svgRef} className="w-full h-full" style={{ pointerEvents: 'all' }} />
      <div
        ref={tooltipRef}
        className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs pointer-events-none z-50"
        style={{
          display: "none",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      />
    </div>
  );
}


