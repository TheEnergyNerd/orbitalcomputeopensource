"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ThermalPoint } from "../../lib/orbitSim/selectors/physics";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface ThermalChartProps {
  data: ThermalPoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Thermal Chart
 * Shows temperatures and heat ceiling over time
 */
export default function ThermalChart({ 
  data, 
  currentYear, 
  scenarioMode 
}: ThermalChartProps) {
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
      ? { top: 20, right: 50, bottom: 50, left: 60 }
      : { top: 25, right: 80, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px for desktop to prevent x-axis cutoff
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const minTemp = d3.min(data, d => Math.min(d.coreC, d.radiatorC)) ?? 0;
    const maxTemp = d3.max(data, d => Math.max(d.coreC, d.radiatorC)) ?? 100;
    const minHeat = d3.min(data, d => d.heatCeiling) ?? 0;
    const maxHeat = d3.max(data, d => d.heatCeiling) ?? 100;

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, innerWidth])
      .nice();

    // Use dual y-axis: left for temp, right for heat
    // CRITICAL FIX: Ensure domains fit everything with proper padding
    // Temperature should start from a reasonable minimum (not 0 if all temps are > 0)
    const tempRange = maxTemp - minTemp;
    const tempDomainMin = minTemp > 0 ? Math.max(-100, minTemp - tempRange * 0.1) : Math.max(-100, minTemp - 10);
    const tempDomainMax = maxTemp > 0 ? maxTemp + tempRange * 0.1 : Math.max(100, maxTemp + 10);
    
    const heatRange = maxHeat - minHeat;
    const heatDomainMin = minHeat > 0 ? Math.max(0, minHeat - heatRange * 0.1) : 0;
    const heatDomainMax = maxHeat > 0 ? maxHeat + heatRange * 0.1 : Math.max(100, maxHeat + 10);

    const yTempScale = d3.scaleLinear()
      .domain([tempDomainMin, tempDomainMax])
      .nice()
      .range([innerHeight, 0]);

    const yHeatScale = d3.scaleLinear()
      .domain([heatDomainMin, heatDomainMax])
      .nice()
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add x-axis
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);
    
    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "7px" : "9px")
      .style("fill", "#94a3b8");
    
    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    // Add left y-axis (temperature)
    const yTempAxis = d3.axisLeft(yTempScale)
      .tickFormat(d => `${Number(d).toFixed(0)}°C`);
    const yTempAxisGroup = g.append("g")
      .call(yTempAxis);
    
    yTempAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");
    
    yTempAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    // Add right y-axis (heat)
    const yHeatAxis = d3.axisRight(yHeatScale)
      .tickFormat(d => `${Number(d).toFixed(0)} kW`);
    const yHeatAxisGroup = g.append("g")
      .attr("transform", `translate(${innerWidth}, 0)`)
      .call(yHeatAxis);
    
    yHeatAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");
    
    yHeatAxisGroup.selectAll("line, path")
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
      .text("Temperature (°C)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", innerWidth + (margin.right - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Heat Ceiling (kW)");

    // Create line generators
    const coreLine = d3.line<ThermalPoint>()
      .x(d => xScale(d.year))
      .y(d => yTempScale(d.coreC))
      .curve(d3.curveMonotoneX);

    const radiatorLine = d3.line<ThermalPoint>()
      .x(d => xScale(d.year))
      .y(d => yTempScale(d.radiatorC))
      .curve(d3.curveMonotoneX);

    const heatLine = d3.line<ThermalPoint>()
      .x(d => xScale(d.year))
      .y(d => yHeatScale(d.heatCeiling))
      .curve(d3.curveMonotoneX);

    // Draw lines
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ef4444") // red for core
      .attr("stroke-width", 2)
      .attr("d", coreLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6") // blue for radiator
      .attr("stroke-width", 2)
      .attr("d", radiatorLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981") // green for heat ceiling
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("d", heatLine);

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
            <div style="color: #ef4444">Core: ${point.coreC.toFixed(1)}°C</div>
            <div style="color: #3b82f6">Radiator: ${point.radiatorC.toFixed(1)}°C</div>
            <div style="color: #10b981">Heat Ceiling: ${point.heatCeiling.toFixed(1)} kW</div>
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
      { label: "Core Temp", color: "#ef4444" },
      { label: "Radiator Temp", color: "#3b82f6" },
      { label: "Heat Ceiling", color: "#10b981" },
    ];

    legendData.forEach((item, i) => {
      const y = i * 20;
      legend.append("line")
        .attr("x1", 0)
        .attr("x2", 12)
        .attr("y1", y + 6)
        .attr("y2", y + 6)
        .attr("stroke", item.color)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", i === 2 ? "5,5" : "");

      legend.append("text")
        .attr("x", 16)
        .attr("y", y + 10)
        .style("font-size", isMobile ? "9px" : "11px")
        .style("fill", "#94a3b8")
        .text(item.label);
    });

  }, [data, currentYear]);

  if (data.length === 0) {
    return <div className="text-slate-400 text-sm">No thermal data available</div>;
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
