"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { CostCrossoverPoint } from "../../lib/orbitSim/selectors/scenarios";

interface CostCrossoverChartProps {
  data: CostCrossoverPoint[];
  currentYear?: number;
}

/**
 * Orbit vs Ground Cost Crossover Chart
 * Shows when orbit becomes cheaper than ground with annotation
 */
export default function CostCrossoverChart({ 
  data, 
  currentYear 
}: CostCrossoverChartProps) {
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
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth]);

    const maxCost = d3.max(data, d => Math.max(d.cost_orbit, d.cost_ground)) || 400;
    const yScale = d3.scaleLinear()
      .domain([0, maxCost * 1.1])
      .range([innerHeight, 0]);

    // Create line generators
    const lineOrbit = d3.line<CostCrossoverPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.cost_orbit))
      .curve(d3.curveMonotoneX);

    const lineGround = d3.line<CostCrossoverPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.cost_ground))
      .curve(d3.curveMonotoneX);

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

    // Find crossover year and create shaded region
    const crossoverYear = data[0]?.crossoverYear;
    if (crossoverYear) {
      const crossoverData = data.filter(d => d.year >= crossoverYear);
      if (crossoverData.length > 0) {
        // Create area for "Orbit Advantage" region
        const area = d3.area<CostCrossoverPoint>()
          .x(d => xScale(d.year))
          .y0(d => yScale(d.cost_orbit))
          .y1(d => yScale(d.cost_ground))
          .curve(d3.curveMonotoneX);

        g.append("path")
          .datum(crossoverData)
          .attr("fill", "rgba(0, 240, 255, 0.1)")
          .attr("d", area);

        // Add vertical line at crossover
        const xCrossover = xScale(crossoverYear);
        g.append("line")
          .attr("x1", xCrossover)
          .attr("x2", xCrossover)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .attr("stroke", "#00f0ff")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "5,5")
          .attr("opacity", 0.7);

        // Add crossover label
        g.append("text")
          .attr("x", xCrossover)
          .attr("y", -10)
          .attr("text-anchor", "middle")
          .style("fill", "#00f0ff")
          .style("font-family", "'JetBrains Mono', monospace")
          .style("font-size", "11px")
          .style("font-weight", "700")
          .text(`Crossover: ${crossoverYear}`);

        // Add "Orbit Advantage" label
        const midYear = crossoverData[Math.floor(crossoverData.length / 2)];
        if (midYear) {
          const midX = xScale(midYear.year);
          const midY = (yScale(midYear.cost_orbit) + yScale(midYear.cost_ground)) / 2;
          g.append("text")
            .attr("x", midX)
            .attr("y", midY)
            .attr("text-anchor", "middle")
            .style("fill", "#00f0ff")
            .style("font-family", "'Space Grotesk', sans-serif")
            .style("font-size", "10px")
            .style("opacity", 0.7)
            .text("Orbit Advantage");
        }
      }
    }

    // Add lines
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#00f0ff")
      .attr("stroke-width", 2)
      .attr("d", lineOrbit);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ff7070")
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "12,6")
      .attr("stroke-opacity", 0.95)
      .attr("d", lineGround);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => d.toString())
      .ticks(isMobile ? 5 : 10);
    
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `$${d}`);

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
      .text("Cost ($ / PFLOP)");

    // Add legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 120}, 20)`);

    const legendData = [
      { label: "Orbit", color: "#00f0ff", dash: false },
      { label: "Ground", color: "#ff7070", dash: true },
    ];

    legendData.forEach((item, i) => {
      const legendItem = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);
      
      if (item.dash) {
        legendItem.append("line")
          .attr("x1", 0)
          .attr("x2", 12)
          .attr("y1", 6)
          .attr("y2", 6)
          .attr("stroke", item.color)
          .attr("stroke-width", 2.5)
          .attr("stroke-dasharray", "12,6")
          .attr("stroke-opacity", 0.95);
      } else {
        legendItem.append("line")
          .attr("x1", 0)
          .attr("x2", 12)
          .attr("y1", 6)
          .attr("y2", 6)
          .attr("stroke", item.color)
          .attr("stroke-width", 2);
      }
      
      legendItem.append("text")
        .attr("x", 18)
        .attr("y", 9)
        .style("fill", "#e2e8f0")
        .style("font-family", "'JetBrains Mono', monospace")
        .style("font-size", "11px")
        .text(item.label);
    });

    // Add current year indicator
    if (currentYear) {
      const xPos = xScale(currentYear);
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

    // Add hover interaction
    const bisect = d3.bisector((d: CostCrossoverPoint) => d.year).left;
    
    const hoverLine = g.append("line")
      .attr("stroke", "#00f0ff")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0)
      .attr("y1", 0)
      .attr("y2", innerHeight);

    const hoverGroup = g.append("g").attr("opacity", 0);

    svg.on("mousemove", function(event) {
      const [mouseX] = d3.pointer(event, svgRef.current);
      const x0 = xScale.invert(mouseX - margin.left);
      const i = bisect(data, x0, 1);
      const d0 = data[i - 1];
      const d1 = data[i];
      const d = d1 && (x0 - d0.year > d1.year - x0) ? d1 : d0;
      
      if (d) {
        const xPos = xScale(d.year);
        hoverLine
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("opacity", 1);
        
        hoverGroup.selectAll("*").remove();
        
        // Add tooltip circles
        hoverGroup.append("circle")
          .attr("cx", xPos)
          .attr("cy", yScale(d.cost_orbit))
          .attr("r", 4)
          .attr("fill", "#00f0ff");
        
        hoverGroup.append("circle")
          .attr("cx", xPos)
          .attr("cy", yScale(d.cost_ground))
          .attr("r", 4)
          .attr("fill", "#ff8c00");
        
        // Update tooltip
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "block";
          const advantage = d.cost_orbit < d.cost_ground ? "Orbit" : "Ground";
          tooltipRef.current.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 4px;">${d.year}</div>
            <div style="color: #00f0ff;">Orbit: $${d.cost_orbit.toFixed(2)}</div>
            <div style="color: #ff8c00;">Ground: $${d.cost_ground.toFixed(2)}</div>
            <div style="margin-top: 4px; border-top: 1px solid #1e293b; padding-top: 4px; color: #00ff88;">
              ${advantage} Advantage
            </div>
          `;
        }
      }
    });

    svg.on("mouseleave", () => {
      hoverLine.attr("opacity", 0);
      hoverGroup.attr("opacity", 0);
      if (tooltipRef.current) {
        tooltipRef.current.style.display = "none";
      }
    });

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


