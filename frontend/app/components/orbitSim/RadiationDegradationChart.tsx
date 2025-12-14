"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface RadiationDegradationChartProps {
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Radiation Degradation Over Time Chart
 * Shows how compute performance degrades due to radiation exposure
 * Y-axis: Effective Compute (% of nominal)
 * X-axis: Years in orbit
 * Lines: LEO, MEO, GEO (different degradation rates)
 */
export default function RadiationDegradationChart({
  currentYear = 2033,
  scenarioMode,
}: RadiationDegradationChartProps) {
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

    // Radiation model parameters
    const ECC_OVERHEAD = 0.15; // 15% compute spent on ECC
    const LEO_DEGRADATION_PER_YEAR = 0.05; // 5% per year
    const MEO_DEGRADATION_PER_YEAR = 0.08; // 8% per year (worse radiation)
    const GEO_DEGRADATION_PER_YEAR = 0.06; // 6% per year

    // Calculate effective compute over time
    const calculateEffectiveCompute = (yearsInOrbit: number, degradationPerYear: number) => {
      const eccAdjusted = 1 - ECC_OVERHEAD; // 85% after ECC
      const degradationFactor = Math.max(0, 1 - degradationPerYear * yearsInOrbit);
      return eccAdjusted * degradationFactor * 100; // Convert to percentage
    };

    // Generate data for 0-10 years
    const maxYears = 10;
    const leoData = Array.from({ length: maxYears + 1 }, (_, i) => ({
      years: i,
      effectiveCompute: calculateEffectiveCompute(i, LEO_DEGRADATION_PER_YEAR),
    }));

    const meoData = Array.from({ length: maxYears + 1 }, (_, i) => ({
      years: i,
      effectiveCompute: calculateEffectiveCompute(i, MEO_DEGRADATION_PER_YEAR),
    }));

    const geoData = Array.from({ length: maxYears + 1 }, (_, i) => ({
      years: i,
      effectiveCompute: calculateEffectiveCompute(i, GEO_DEGRADATION_PER_YEAR),
    }));

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, maxYears])
      .range([0, innerWidth])
      .nice();

    const yScale = d3.scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0])
      .nice();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Line generator
    const line = d3.line<{ years: number; effectiveCompute: number }>()
      .x(d => xScale(d.years))
      .y(d => yScale(d.effectiveCompute))
      .curve(d3.curveMonotoneX);

    // Draw lines
    const lines = [
      { data: leoData, color: "#3b82f6", label: "LEO", dashArray: "" },
      { data: meoData, color: "#ef4444", label: "MEO", dashArray: "4,4" },
      { data: geoData, color: "#10b981", label: "GEO", dashArray: "2,2" },
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
      const lastPoint = lineConfig.data[lineConfig.data.length - 1];
      g.append("text")
        .attr("x", xScale(lastPoint.years) + 10)
        .attr("y", yScale(lastPoint.effectiveCompute))
        .style("font-size", isMobile ? "9px" : "11px")
        .style("fill", lineConfig.color)
        .style("font-weight", 600)
        .text(`${lineConfig.label}: ${lastPoint.effectiveCompute.toFixed(0)}% @ ${lastPoint.years}yr`);
    });

    // Add 5-year and 7-year markers (typical satellite lifespans)
    [5, 7].forEach((year) => {
      g.append("line")
        .attr("x1", xScale(year))
        .attr("x2", xScale(year))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#64748b")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2")
        .attr("opacity", 0.5);

      g.append("text")
        .attr("x", xScale(year))
        .attr("y", innerHeight + 15)
        .style("text-anchor", "middle")
        .style("font-size", isMobile ? "8px" : "9px")
        .style("fill", "#64748b")
        .text(`${year}yr`);
    });

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
      .tickFormat(d => `${d}%`);
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
      .text("Years in Orbit");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Effective Compute (% of nominal)");

    // Add note about ECC overhead
    g.append("text")
      .attr("x", innerWidth - 10)
      .attr("y", 20)
      .style("text-anchor", "end")
      .style("font-size", isMobile ? "8px" : "9px")
      .style("fill", "#64748b")
      .style("font-style", "italic")
      .text("Includes 15% ECC overhead");
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

