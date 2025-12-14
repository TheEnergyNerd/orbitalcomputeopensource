"use client";

import React, { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { buildCarbonStreams } from "../../lib/orbitSim/selectors/carbonStreams";
import { getDebugState, getDebugStateEntries, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import type { CarbonStreamPoint } from "../../lib/orbitSim/selectors/carbonStreams";

interface CarbonRiverProps {
  currentYear?: number;
  onYearClick?: (year: number) => void;
  scenarioMode?: string;
}

/**
 * Draining River Visualization for Carbon
 * - Background "river" = all-ground emissions (wide faded red band)
 * - Narrower green band = mix emissions
 * - Translucent teal fill = avoided carbon (gap between ground and mix)
 * - Running cumulative avoided carbon counter (top right)
 * - Updates as year scrubs
 */
export default function CarbonRiver({ 
  currentYear,
  onYearClick,
  scenarioMode
}: CarbonRiverProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Get data from debug state, filtered by scenario
  const riverData = useMemo(() => {
    const debug = getDebugState();
    const scenarioKey = scenarioModeToKey(scenarioMode);
    // Use centralized helper to ensure we're reading from the correct scenario
    const entries = getDebugStateEntries(scenarioKey);
    
    // Debug: Verify we're getting scenario-specific data
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && entries.length > 0) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      console.log(`[Carbon Chart] ${scenarioKey} - First: ${first.year} carbon=${first.annual_carbon_mix}, Last: ${last.year} carbon=${last.annual_carbon_mix}`);
    }
    
    return buildCarbonStreams(entries);
  }, [scenarioMode]);

  // Update cumulative counter
  useEffect(() => {
    if (!counterRef.current || riverData.length === 0) return;

    const currentPoint = currentYear 
      ? riverData.find(d => d.year === currentYear)
      : riverData[riverData.length - 1];

    if (currentPoint && counterRef.current) {
      counterRef.current.textContent = `Avoided: ${currentPoint.cumulativeAvoided.toFixed(1)} kt CO₂`;
    }
  }, [riverData, currentYear]);

  useEffect(() => {
    if (!svgRef.current || riverData.length === 0) return;

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
      .domain(d3.extent(riverData, d => d.year) as [number, number])
      .range([0, innerWidth]);

    const maxGround = d3.max(riverData, d => d.groundAll) ?? 1;
    const yScale = d3.scaleLinear()
      .domain([0, maxGround * 1.1])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${Math.round(Number(d))}`)
      .ticks(isMobile ? 5 : 10);
    const formatYAxis = (d: d3.NumberValue) => {
      const val = Number(d);
      // Format per CHART_AUDIT_AND_CONGESTION.md: use T/B/M format
      if (val >= 1e15) return `${(val / 1e15).toFixed(0)}P tCO₂`;
      if (val >= 1e12) return `${(val / 1e12).toFixed(0)}T tCO₂`;
      if (val >= 1e9) return `${(val / 1e9).toFixed(0)}B tCO₂`;
      if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M tCO₂`;
      if (val >= 1e3) return `${(val / 1e3).toFixed(0)}k tCO₂`;
      return `${val.toFixed(0)} tCO₂`;
    };
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(formatYAxis);

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

    // Area generators
    const groundArea = d3.area<CarbonStreamPoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.groundAll))
      .curve(d3.curveMonotoneX);

    const mixArea = d3.area<CarbonStreamPoint>()
      .x(d => xScale(d.year))
      .y0(innerHeight)
      .y1(d => yScale(d.mix))
      .curve(d3.curveMonotoneX);

    // Draw ground river (wide faded red band) with transition
    const groundPath = g.select<SVGPathElement>("path.ground-river")
      .datum(riverData);
    
    groundPath.enter()
      .append("path")
      .attr("class", "ground-river")
      .style("fill", "#ef4444")
      .style("opacity", 0.2)
      .style("stroke", "#ef4444")
      .style("stroke-width", 2)
      .style("stroke-opacity", 0.4)
      .merge(groundPath)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", groundArea);

    // Draw avoided carbon (translucent teal fill - gap between ground and mix)
    const avoidedArea = d3.area<CarbonStreamPoint>()
      .x(d => xScale(d.year))
      .y0(d => yScale(d.mix))
      .y1(d => yScale(d.groundAll))
      .curve(d3.curveMonotoneX);

    const avoidedPath = g.select<SVGPathElement>("path.avoided-carbon")
      .datum(riverData);
    
    avoidedPath.enter()
      .append("path")
      .attr("class", "avoided-carbon")
      .style("fill", "#14b8a6")
      .style("opacity", 0.5)
      .style("stroke", "#14b8a6")
      .style("stroke-width", 1)
      .style("stroke-opacity", 0.7)
      .merge(avoidedPath)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", avoidedArea);

    // Draw mix band (narrower green band) with transition
    const mixPath = g.select<SVGPathElement>("path.mix-band")
      .datum(riverData);
    
    mixPath.enter()
      .append("path")
      .attr("class", "mix-band")
      .style("fill", "#10b981")
      .style("opacity", 0.6)
      .style("stroke", "#10b981")
      .style("stroke-width", 2)
      .style("cursor", "crosshair")
      .merge(mixPath)
      .transition()
      .duration(400)
      .ease(d3.easeQuadOut)
      .attr("d", mixArea);

    // Invisible overlay for hover detection
    g.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .style("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", function(event) {
        const [mouseX] = d3.pointer(event);
        const year = Math.round(xScale.invert(mouseX));
        const point = riverData.find(d => Math.abs(d.year - year) < 1);
        
        if (point && tooltipRef.current) {
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
          tooltipRef.current.innerHTML = `
            <div class="text-xs">
              <div class="font-semibold text-white mb-1">Year: ${point.year}</div>
              <div class="text-red-300">All-Ground: ${point.groundAll.toFixed(1)} kt CO₂</div>
              <div class="text-green-300">Mix: ${point.mix.toFixed(1)} kt CO₂</div>
              <div class="text-teal-300">Avoided: ${(point.groundAll - point.mix).toFixed(1)} kt CO₂</div>
              <div class="text-slate-400 mt-1">Cumulative: ${point.cumulativeAvoided.toFixed(1)} kt CO₂</div>
            </div>
          `;
        }
      })
      .on("mouseout", function() {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      })
      .on("click", function(event) {
        const [mouseX] = d3.pointer(event);
        const year = Math.round(xScale.invert(mouseX));
        if (onYearClick) {
          onYearClick(year);
        }
      });

    // Current year indicator with transition
    if (currentYear) {
      const xPos = xScale(currentYear);
      const currentPoint = riverData.find(d => d.year === currentYear);
      
      if (currentPoint) {
        // Vertical line with transition
        const yearLine = g.select<SVGLineElement>("line.year-indicator");
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

        // Point on mix line with transition
        const yearDot = g.select<SVGCircleElement>("circle.year-dot");
        yearDot.enter()
          .append("circle")
          .attr("class", "year-dot")
          .attr("r", 6)
          .attr("fill", "#fbbf24")
          .attr("stroke", "#1e293b")
          .attr("stroke-width", 2)
          .merge(yearDot)
          .transition()
          .duration(300)
          .ease(d3.easeQuadOut)
          .attr("cx", xPos)
          .attr("cy", yScale(currentPoint.mix));
      }
    } else {
      g.select("line.year-indicator").remove();
      g.select("circle.year-dot").remove();
    }

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
      .text("Annual Carbon (kt CO₂)");

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${innerWidth - 90}, 20)`);

    const legendItems = [
      { label: "All-Ground", color: "#ef4444", opacity: 0.2 },
      { label: "Mix", color: "#10b981", opacity: 0.6 },
      { label: "Avoided", color: "#14b8a6", opacity: 0.5 }
    ];

    legendItems.forEach((item, i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);
      
      legendRow.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("fill", item.color)
        .attr("opacity", item.opacity)
        .attr("stroke", item.color)
        .attr("stroke-width", 1);
      
      legendRow.append("text")
        .attr("x", 16)
        .attr("y", 9)
        .style("font-size", "10px")
        .style("fill", "#cbd5e1")
        .text(item.label);
    });

  }, [riverData, currentYear, onYearClick]);

  return (
    <div className="relative w-full">
      <svg 
        ref={svgRef}
        className="w-full h-auto"
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid meet"
      />
      <div
        ref={counterRef}
        className="absolute top-2 right-2 bg-slate-900/95 border border-slate-700 rounded px-3 py-1.5 text-xs font-semibold text-emerald-200 z-50"
      >
        Avoided: 0 kt CO₂
      </div>
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs pointer-events-none shadow-lg"
        style={{ display: "none" }}
      />
    </div>
  );
}

