"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { PowerPerSatPoint } from "../../lib/orbitSim/selectors/physics";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface PowerPerSatChartProps {
  data: PowerPerSatPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Power per Satellite (kW) Chart
 * Shows power scaling from 100kW to 1MW per satellite
 */
export default function PowerPerSatChart({
  data,
  currentYear,
  scenarioMode,
}: PowerPerSatChartProps) {
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

    const maxPower = d3.max(data, d => d.powerKw) ?? 1;
    const yScale = d3.scaleLinear()
      .domain([0, Math.max(maxPower * 1.1, 1000)])
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

    // Add y-axis
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => {
        const val = Number(d);
        if (val >= 1000) return `${(val / 1000).toFixed(1)} MW`;
        return `${val.toFixed(0)} kW`;
      });
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
      .text("Power per Satellite (kW)");

    // Add 1MW target line
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(1000))
      .attr("y2", yScale(1000))
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(1000) - 5)
      .style("text-anchor", "end")
      .style("font-size", "9px")
      .style("fill", "#10b981")
      .text("1 MW Target");

    // Line chart
    const line = d3.line<PowerPerSatPoint>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.powerKw))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2.5)
      .attr("d", line);

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
              <div style="color: #3b82f6; font-size: 11px;">Power per Sat: ${closest.powerKw.toFixed(1)} kW</div>
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

