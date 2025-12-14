"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";
import { getDebugStateEntries, scenarioModeToKey } from "../../lib/orbitSim/debugState";

interface LaunchConstraintTimelineChartProps {
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Launch Constraint Timeline Chart
 * Shows deployment rate limited by launch capacity
 * Y-axis: Satellites deployed (cumulative)
 * X-axis: Year
 * Lines: Desired deployment (unconstrained) vs Launch-constrained vs Starship era
 */
export default function LaunchConstraintTimelineChart({
  currentYear = 2033,
  scenarioMode,
}: LaunchConstraintTimelineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 400;
    const isMobile = containerWidth < 640;

    const width = containerWidth;
    const height = containerHeight;

    svg.attr("width", width).attr("height", height);

    const margin = isMobile
      ? { top: 20, right: 50, bottom: 60, left: 60 }
      : { top: 30, right: 80, bottom: 80, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Get debug state entries
    const scenarioKey = scenarioModeToKey(scenarioMode);
    const entries = getDebugStateEntries(scenarioKey)
      .sort((a, b) => a.year - b.year);

    if (entries.length === 0) return;

    // Launch capacity constraints
    const LAUNCHES_PER_YEAR_2025 = 100;     // Current SpaceX-like capacity
    const LAUNCHES_PER_YEAR_2030 = 200;     // Starship era
    const LAUNCHES_PER_YEAR_2040 = 500;     // Multiple Starship pads, competition
    const SATS_PER_LAUNCH = 50;             // Depends on sat size

    const getLaunchCapacity = (year: number) => {
      if (year <= 2025) return LAUNCHES_PER_YEAR_2025 * SATS_PER_LAUNCH;
      if (year <= 2030) {
        // Linear interpolation between 2025 and 2030
        const t = (year - 2025) / (2030 - 2025);
        return (LAUNCHES_PER_YEAR_2025 + (LAUNCHES_PER_YEAR_2030 - LAUNCHES_PER_YEAR_2025) * t) * SATS_PER_LAUNCH;
      }
      if (year <= 2040) {
        // Linear interpolation between 2030 and 2040
        const t = (year - 2030) / (2040 - 2030);
        return (LAUNCHES_PER_YEAR_2030 + (LAUNCHES_PER_YEAR_2040 - LAUNCHES_PER_YEAR_2030) * t) * SATS_PER_LAUNCH;
      }
      return LAUNCHES_PER_YEAR_2040 * SATS_PER_LAUNCH;
    };

    // Build data series
    let cumulativeDesired = 0;
    let cumulativeConstrained = 0;
    let cumulativeStarship = 0;

    const desiredData: Array<{ year: number; cumulative: number }> = [];
    const constrainedData: Array<{ year: number; cumulative: number }> = [];
    const starshipData: Array<{ year: number; cumulative: number }> = [];

    entries.forEach(entry => {
      const year = entry.year;
      const desiredDeployment = entry.satellitesTotal || 0; // Desired deployment (unconstrained)
      const launchCapacity = getLaunchCapacity(year);
      
      cumulativeDesired += desiredDeployment;
      
      // Launch-constrained: limited by launch capacity
      const constrainedDeployment = Math.min(desiredDeployment, launchCapacity);
      cumulativeConstrained += constrainedDeployment;
      
      // Starship era: accelerated after 2028
      const starshipCapacity = year >= 2028 ? launchCapacity * 1.5 : launchCapacity; // 50% boost after Starship
      const starshipDeployment = Math.min(desiredDeployment, starshipCapacity);
      cumulativeStarship += starshipDeployment;

      desiredData.push({ year, cumulative: cumulativeDesired });
      constrainedData.push({ year, cumulative: cumulativeConstrained });
      starshipData.push({ year, cumulative: cumulativeStarship });
    });

    // Scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(entries, d => d.year) as [number, number])
      .range([0, innerWidth])
      .nice();

    const maxCumulative = Math.max(
      ...desiredData.map(d => d.cumulative),
      ...constrainedData.map(d => d.cumulative),
      ...starshipData.map(d => d.cumulative)
    );
    const yScale = d3.scaleLinear()
      .domain([0, maxCumulative * 1.1])
      .range([innerHeight, 0])
      .nice();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Line generator
    const line = d3.line<{ year: number; cumulative: number }>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.cumulative))
      .curve(d3.curveMonotoneX);

    // Draw lines
    const lines = [
      { data: desiredData, color: "#3b82f6", label: "Desired deployment", dashArray: "4,4" },
      { data: constrainedData, color: "#ef4444", label: "Launch-constrained", dashArray: "" },
      { data: starshipData, color: "#10b981", label: "Starship era", dashArray: "2,2" },
    ];

    lines.forEach((lineConfig) => {
      g.append("path")
        .datum(lineConfig.data)
        .attr("fill", "none")
        .attr("stroke", lineConfig.color)
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", lineConfig.dashArray)
        .attr("d", line);

      // Add label at end of line
      if (lineConfig.data.length > 0) {
        const lastPoint = lineConfig.data[lineConfig.data.length - 1];
        g.append("text")
          .attr("x", xScale(lastPoint.year) + 10)
          .attr("y", yScale(lastPoint.cumulative))
          .style("font-size", isMobile ? "9px" : "11px")
          .style("fill", lineConfig.color)
          .style("font-weight", 600)
          .text(`${lineConfig.label}: ${(lastPoint.cumulative / 1000).toFixed(1)}k`);
      }
    });

    // Add 2028 marker (Starship era start)
    g.append("line")
      .attr("x1", xScale(2028))
      .attr("x2", xScale(2028))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", xScale(2028))
      .attr("y", innerHeight + 15)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "8px" : "9px")
      .style("fill", "#f59e0b")
      .text("Starship era");

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d}`);
    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");

    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => {
        const val = Number(d);
        if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
        return `${val}`;
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
      .attr("transform", `translate(${innerWidth / 2},${innerHeight + margin.bottom - 10})`)
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
      .text("Cumulative Satellites Deployed");
  }, [currentYear, scenarioMode]);

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

