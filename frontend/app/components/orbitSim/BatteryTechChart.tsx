"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { BatteryTechPoint } from "../../lib/orbitSim/selectors/physics";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface BatteryTechChartProps {
  data: BatteryTechPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Battery Tech Curve Chart
 * Shows Wh/kg and $/kWh progression over time
 */
export default function BatteryTechChart({
  data,
  currentYear,
  scenarioMode,
}: BatteryTechChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    
    const width = containerWidth;
    const height = containerHeight;
    
    svg.attr("width", width).attr("height", height);
    
    const margin = isMobile 
      ? { top: 20, right: 50, bottom: 50, left: 60 }
      : { top: 20, right: 80, bottom: 50, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth]);

    const maxDensity = d3.max(data, d => d.densityWhPerKg) ?? 1;
    const maxCost = d3.max(data, d => d.costUsdPerKwh) ?? 1;

    // Dual Y-axis: left for density, right for cost
    const yLeftScale = d3.scaleLinear()
      .domain([0, maxDensity * 1.1])
      .range([innerHeight, 0])
      .nice();

    const yRightScale = d3.scaleLinear()
      .domain([0, maxCost * 1.1])
      .range([innerHeight, 0])
      .nice();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add x-axis
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${Math.round(Number(d))}`);
    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);
    
    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "7px" : "9px")
      .style("fill", "#94a3b8");
    
    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    // Add left y-axis (density)
    const yLeftAxis = d3.axisLeft(yLeftScale)
      .tickFormat(d => `${Number(d).toFixed(0)} Wh/kg`);
    const yLeftAxisGroup = g.append("g")
      .call(yLeftAxis);
    
    yLeftAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#3b82f6");
    
    yLeftAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    // Add right y-axis (cost)
    const yRightAxis = d3.axisRight(yRightScale)
      .tickFormat(d => `$${Number(d).toFixed(0)}`);
    const yRightAxisGroup = g.append("g")
      .attr("transform", `translate(${innerWidth}, 0)`)
      .call(yRightAxis);
    
    yRightAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#10b981");
    
    yRightAxisGroup.selectAll("line, path")
      .style("stroke", "#10b981")
      .style("opacity", 0.3);

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
      .style("fill", "#3b82f6")
      .text("Density (Wh/kg)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", innerWidth + (margin.right - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#10b981")
      .text("Cost ($/kWh)");

    // Line for density
    const densityLine = d3.line<BatteryTechPoint>()
      .x(d => xScale(d.year))
      .y(d => yLeftScale(d.densityWhPerKg))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2.5)
      .attr("d", densityLine);

    // Line for cost
    const costLine = d3.line<BatteryTechPoint>()
      .x(d => xScale(d.year))
      .y(d => yRightScale(d.costUsdPerKwh))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2.5)
      .attr("d", costLine);

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

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 120}, 20)`);

    const legendItems = [
      { label: "Density (Wh/kg)", color: "#3b82f6" },
      { label: "Cost ($/kWh)", color: "#10b981" },
    ];

    legendItems.forEach((item, i) => {
      const itemGroup = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);

      itemGroup.append("line")
        .attr("x1", 0)
        .attr("x2", 12)
        .attr("y1", 6)
        .attr("y2", 6)
        .attr("stroke", item.color)
        .attr("stroke-width", 2.5);

      itemGroup.append("text")
        .attr("x", 16)
        .attr("y", 9)
        .style("font-size", "10px")
        .style("fill", "#94a3b8")
        .text(item.label);
    });

    // Tooltip
    if (tooltipRef.current) {
      const tooltip = d3.select(tooltipRef.current);
      
      const handleMouseMove = (event: MouseEvent) => {
        const [x] = d3.pointer(event, svgRef.current);
        const year = xScale.invert(x - margin.left);
        const closest = data.reduce((prev, curr) => 
          Math.abs(curr.year - year) < Math.abs(prev.year - year) ? curr : prev
        );

        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`)
          .html(`
            <div style="background: rgba(15, 23, 42, 0.95); padding: 8px; border-radius: 4px; border: 1px solid rgba(148, 163, 184, 0.2);">
              <div style="font-weight: 600; color: #e2e8f0; margin-bottom: 4px;">Year ${closest.year}</div>
              <div style="color: #3b82f6; font-size: 11px;">Density: ${closest.densityWhPerKg.toFixed(0)} Wh/kg</div>
              <div style="color: #10b981; font-size: 11px;">Cost: $${closest.costUsdPerKwh.toFixed(0)}/kWh</div>
            </div>
          `);
      };

      const handleMouseLeave = () => {
        tooltip.style("display", "none");
      };

      g.append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .on("mousemove", handleMouseMove)
        .on("mouseleave", handleMouseLeave);
    }
  }, [data, currentYear, scenarioMode]);

  return (
    <>
      <svg ref={svgRef} style={{ display: "block" }} />
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          display: "none",
          pointerEvents: "none",
          zIndex: 1000,
        }}
      />
    </>
  );
}

