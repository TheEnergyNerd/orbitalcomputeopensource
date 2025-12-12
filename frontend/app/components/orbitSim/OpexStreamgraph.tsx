"use client";

import React, { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { buildCostStreams } from "../../lib/orbitSim/selectors/costStreams";
import { getDebugState, getDebugStateEntries, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import type { CostStreamPoint } from "../../lib/orbitSim/selectors/costStreams";

interface OpexStreamgraphProps {
  currentYear?: number;
  onYearClick?: (year: number) => void;
  scenarioMode?: string;
}

/**
 * Streamgraph for Annual OPEX
 * - Stacked area chart (streamgraph style)
 * - Stacks: launch, orbit OPEX, ground residual
 * - Overlay thin band below zero for "savings vs all-ground"
 * - Subtle animation on scenario change
 * - Hover fades non-hovered layers
 */
export default function OpexStreamgraph({ 
  currentYear,
  onYearClick,
  scenarioMode
}: OpexStreamgraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Get data from debug state, filtered by scenario
  const streamData = useMemo(() => {
    const debug = getDebugState();
    const scenarioKey = scenarioModeToKey(scenarioMode);
    // Use centralized helper to ensure we're reading from the correct scenario
    const entries = getDebugStateEntries(scenarioKey);
    
    // Debug: Verify we're getting scenario-specific data
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && entries.length > 0) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      console.log(`[OPEX Chart] ${scenarioKey} - First: ${first.year} opex=${first.annual_opex_mix}, Last: ${last.year} opex=${last.annual_opex_mix}`);
    }
    
    return buildCostStreams(entries);
  }, [scenarioMode]);

  useEffect(() => {
    if (!svgRef.current || streamData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - use container height
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    // Make width responsive on desktop - use full width like ScenariosView
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : Math.max(600, containerWidth - 32); // Use full width minus padding on desktop
    const height = containerHeight || (isMobile ? 300 : 350);
    const margin = isMobile 
      ? { top: 20, right: 50, bottom: 50, left: 60 }
      : { top: 25, right: 80, bottom: 150, left: 80 }; // CRITICAL: Increased bottom to 150px for desktop to prevent x-axis cutoff
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(streamData, d => d.year) as [number, number])
      .range([0, innerWidth]);

    // Calculate stack layers
    const stack = d3.stack<CostStreamPoint>()
      .keys(["groundResidual", "orbitOpex", "launch"])
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetWiggle); // Streamgraph offset

    const stackedData = stack(streamData);

    // Find max/min for y scale (including savings)
    const allValues = streamData.flatMap(d => [
      d.groundResidual + d.orbitOpex + d.launch,
      d.savingsVsAllGround
    ]);
    const maxValue = d3.max(allValues.map(Math.abs)) ?? 1;

    const yScale = d3.scaleLinear()
      .domain([-maxValue * 1.1, maxValue * 1.1])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `$${Math.abs(Number(d)).toFixed(0)}M`);

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

    // Zero line
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(0))
      .attr("y2", yScale(0))
      .attr("stroke", "#475569")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");

    // Area generator for stacked data
    const area = d3.area<d3.SeriesPoint<CostStreamPoint>>()
      .x((d, i) => xScale(streamData[i]?.year ?? 2025))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    // Color mapping
    const colorMap: Record<string, string> = {
      groundResidual: "#3b82f6", // blue
      orbitOpex: "#f59e0b", // orange
      launch: "#ef4444" // red
    };

    // Draw stacked areas with transitions
    const layers = g.selectAll(".layer")
      .data(stackedData, (d: any) => d.key);

    const layersEnter = layers.enter()
      .append("g")
      .attr("class", "layer")
      .style("fill", (d: any) => colorMap[d.key] || "#64748b")
      .style("opacity", 0.8);

    const pathsEnter = layersEnter.append("path")
      .attr("d", (d: any) => area(d as any))
      .style("stroke", "#1e293b")
      .style("stroke-width", 1)
      .on("mouseover", function(event, d) {
        d3.selectAll(".layer").style("opacity", 0.3);
        d3.select(this.parentElement).style("opacity", 1);
        
        if (tooltipRef.current) {
          const year = streamData[Math.floor(event.offsetX / innerWidth * streamData.length)]?.year;
          const point = streamData.find(s => s.year === year);
          if (point) {
            tooltipRef.current.style.display = "block";
            tooltipRef.current.innerHTML = `
              <div class="text-xs">
                <div class="font-semibold">Year: ${year}</div>
                <div>Launch: $${point.launch.toFixed(1)}M</div>
                <div>Orbit OPEX: $${point.orbitOpex.toFixed(1)}M</div>
                <div>Ground Residual: $${point.groundResidual.toFixed(1)}M</div>
                <div>Savings: $${Math.abs(point.savingsVsAllGround).toFixed(1)}M</div>
              </div>
            `;
          }
        }
      })
      .on("mousemove", function(event) {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
        }
      })
      .on("mouseout", function() {
        d3.selectAll(".layer").style("opacity", 0.8);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Update existing paths with transition
    const pathsUpdate = layers.merge(layersEnter as any)
      .select("path");
    
    pathsUpdate
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", (d: any) => area(d as any));

    // Ensure event handlers are on all paths (including updated ones)
    pathsUpdate
      .on("mouseover", function(event: MouseEvent, d) {
        d3.selectAll(".layer").style("opacity", 0.3);
        const parent = (this as SVGElement).parentElement;
        if (parent) d3.select(parent).style("opacity", 1);
        
        if (tooltipRef.current) {
          const year = streamData[Math.floor(event.offsetX / innerWidth * streamData.length)]?.year;
          const point = streamData.find(s => s.year === year);
          if (point) {
            tooltipRef.current.style.display = "block";
            tooltipRef.current.innerHTML = `
              <div class="text-xs">
                <div class="font-semibold">Year: ${year}</div>
                <div>Launch: $${point.launch.toFixed(1)}M</div>
                <div>Orbit OPEX: $${point.orbitOpex.toFixed(1)}M</div>
                <div>Ground Residual: $${point.groundResidual.toFixed(1)}M</div>
                <div>Savings: $${Math.abs(point.savingsVsAllGround).toFixed(1)}M</div>
              </div>
            `;
          }
        }
      })
      .on("mousemove", function(event) {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
        }
      })
      .on("mouseout", function() {
        d3.selectAll(".layer").style("opacity", 0.8);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    layers.exit().remove();

    // Draw savings band (below zero)
    const savingsArea = d3.area<CostStreamPoint>()
      .x(d => xScale(d.year))
      .y0(yScale(0))
      .y1(d => yScale(d.savingsVsAllGround))
      .curve(d3.curveMonotoneX);

    // Savings band with transition
    const savingsPath = g.select<SVGPathElement>("path.savings-band")
      .datum(streamData);
    
    savingsPath.enter()
      .append("path")
      .attr("class", "savings-band")
      .style("fill", "#10b981")
      .style("opacity", 0.3)
      .style("stroke", "#10b981")
      .style("stroke-width", 1)
      .merge(savingsPath)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", savingsArea);

    // Current year indicator with transition
    const yearLine = g.select<SVGLineElement>("line.year-indicator");
    if (currentYear) {
      const xPos = xScale(currentYear);
      yearLine.enter()
        .append("line")
        .attr("class", "year-indicator")
        .attr("stroke", "#fbbf24")
        .attr("stroke-width", 2)
        .style("opacity", 0.8)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .merge(yearLine)
        .transition()
        .duration(300)
        .ease(d3.easeQuadOut)
        .attr("x1", xPos)
        .attr("x2", xPos);
    } else {
      yearLine.remove();
    }

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 70}, 20)`);

    const legendItems = [
      { label: "Launch", color: "#ef4444" },
      { label: "Orbit OPEX", color: "#f59e0b" },
      { label: "Ground", color: "#3b82f6" },
      { label: "Savings", color: "#10b981" }
    ];

    legendItems.forEach((item, i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);
      
      legendRow.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", item.color)
        .attr("stroke", "#1e293b")
        .attr("stroke-width", 1);
      
      legendRow.append("text")
        .attr("x", 16)
        .attr("y", 9)
        .style("font-size", "10px")
        .style("fill", "#cbd5e1")
        .text(item.label);
    });

    // Axis labels
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2}, ${innerHeight + margin.bottom - 5})`)
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
      .text("Annual OPEX ($M)");

  }, [streamData, currentYear, onYearClick]);

  return (
    <div className="relative w-full">
      <svg 
        ref={svgRef}
        className="w-full h-auto"
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid meet"
      />
      <div
        ref={tooltipRef}
        className="absolute hidden bg-slate-900/95 border border-slate-700 rounded px-2 py-1 text-white z-50 pointer-events-none"
        style={{ display: "none" }}
      />
    </div>
  );
}

