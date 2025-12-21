"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ShellUtilizationPoint } from "../../lib/orbitSim/selectors/constraints";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface ShellUtilizationChartProps {
  data: ShellUtilizationPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Shell Utilization Chart
 * Shows how full each orbital shell is over time
 */
export default function ShellUtilizationChart({
  data,
  currentYear,
  scenarioMode,
}: ShellUtilizationChartProps) {
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
      ? { top: 20, right: 50, bottom: 50, left: 50 }
      : { top: 20, right: 80, bottom: 50, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

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
      .tickFormat(d => `${Number(d).toFixed(0)}%`);
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
      .text("Utilization (%)");

    // Add threshold lines
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(80))
      .attr("y2", yScale(80))
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(80) - 5)
      .style("text-anchor", "end")
      .style("font-size", "9px")
      .style("fill", "#f59e0b")
      .text("80% Congestion Threshold");

    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(100))
      .attr("y2", yScale(100))
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(100) - 5)
      .style("text-anchor", "end")
      .style("font-size", "9px")
      .style("fill", "#ef4444")
      .text("100% Shell Capacity");

    // Stacked area chart
    const stack = d3.stack<ShellUtilizationPoint>()
      .keys(["leo340", "leo550", "leo1100", "meo"])
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    const stackedData = stack(data);

    const area = d3.area<d3.SeriesPoint<ShellUtilizationPoint>>()
      .x(d => xScale(d.data.year))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    const colors = {
      leo340: "#06b6d4", // cyan
      leo550: "#10b981", // green
      leo1100: "#eab308", // yellow
      meo: "#f97316", // orange
    };

    stackedData.forEach((series, i) => {
      const key = series.key as keyof typeof colors;
      g.append("path")
        .datum(series)
        .attr("fill", colors[key])
        .attr("fill-opacity", 0.6)
        .attr("stroke", colors[key])
        .attr("stroke-width", 1.5)
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

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 120}, 20)`);

    const legendItems = [
      { label: "LEO 340km", color: "#06b6d4" },
      { label: "LEO 550km", color: "#10b981" },
      { label: "LEO 1100km", color: "#eab308" },
      { label: "MEO", color: "#f97316" },
    ];

    legendItems.forEach((item, i) => {
      const itemGroup = legend.append("g")
        .attr("transform", `translate(0, ${i * 18})`);

      itemGroup.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", item.color)
        .attr("fill-opacity", 0.6)
        .attr("stroke", item.color);

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

        const total = closest.leo340 + closest.leo550 + closest.leo1100 + closest.meo;

        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`)
          .html(`
            <div style="background: rgba(15, 23, 42, 0.95); padding: 8px; border-radius: 4px; border: 1px solid rgba(148, 163, 184, 0.2);">
              <div style="font-weight: 600; color: #e2e8f0; margin-bottom: 4px;">Year ${closest.year}</div>
              <div style="color: #06b6d4; font-size: 11px;">LEO 340km: ${closest.leo340.toFixed(1)}%</div>
              <div style="color: #10b981; font-size: 11px;">LEO 550km: ${closest.leo550.toFixed(1)}%</div>
              <div style="color: #eab308; font-size: 11px;">LEO 1100km: ${closest.leo1100.toFixed(1)}%</div>
              <div style="color: #f97316; font-size: 11px;">MEO: ${closest.meo.toFixed(1)}%</div>
              <div style="color: #94a3b8; font-size: 10px; margin-top: 4px; border-top: 1px solid rgba(148, 163, 184, 0.2); padding-top: 4px;">Total: ${total.toFixed(1)}%</div>
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






