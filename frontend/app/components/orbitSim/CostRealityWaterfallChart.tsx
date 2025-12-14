"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface CostRealityWaterfallChartProps {
  currentYear?: number;
  scenarioMode?: ScenarioMode;
  optimisticCostPerPflop?: number;
  realisticCostPerPflop?: number;
}

/**
 * Cost Reality Waterfall Chart
 * Shows how realistic constraints add costs
 * Waterfall: Starting from optimistic $/PFLOP, adding costs for:
 * - Radiation shielding
 * - Thermal system
 * - Higher replacement rate
 * - ECC overhead
 * - Redundancy
 * = Realistic $/PFLOP
 */
export default function CostRealityWaterfallChart({
  currentYear = 2033,
  scenarioMode,
  optimisticCostPerPflop,
  realisticCostPerPflop,
}: CostRealityWaterfallChartProps) {
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
      ? { top: 20, right: 50, bottom: 80, left: 80 }
      : { top: 30, right: 80, bottom: 100, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Cost breakdown (example values if not provided)
    const baseOptimistic = optimisticCostPerPflop || 100; // $/PFLOP
    const radiationShielding = baseOptimistic * 0.15; // 15% adder
    const thermalSystem = baseOptimistic * 0.10; // 10% adder
    const replacementRate = baseOptimistic * 0.20; // 20% adder (faster replacement)
    const eccOverhead = baseOptimistic * 0.15; // 15% adder (ECC compute overhead)
    const redundancy = baseOptimistic * 0.10; // 10% adder (redundancy)
    const totalRealistic = baseOptimistic + radiationShielding + thermalSystem + 
                          replacementRate + eccOverhead + redundancy;

    // Waterfall data
    const waterfallData = [
      { label: "Optimistic\n$/PFLOP", value: baseOptimistic, cumulative: baseOptimistic, type: "start" },
      { label: "+ Radiation\nShielding", value: radiationShielding, cumulative: baseOptimistic + radiationShielding, type: "increase" },
      { label: "+ Thermal\nSystem", value: thermalSystem, cumulative: baseOptimistic + radiationShielding + thermalSystem, type: "increase" },
      { label: "+ Higher\nReplacement", value: replacementRate, cumulative: baseOptimistic + radiationShielding + thermalSystem + replacementRate, type: "increase" },
      { label: "+ ECC\nOverhead", value: eccOverhead, cumulative: baseOptimistic + radiationShielding + thermalSystem + replacementRate + eccOverhead, type: "increase" },
      { label: "+ Redundancy", value: redundancy, cumulative: totalRealistic, type: "increase" },
      { label: "Realistic\n$/PFLOP", value: totalRealistic, cumulative: totalRealistic, type: "end" },
    ];

    // Scales
    const xScale = d3.scaleBand()
      .domain(waterfallData.map(d => d.label))
      .range([0, innerWidth])
      .padding(0.2);

    const maxValue = Math.max(...waterfallData.map(d => d.cumulative));
    const yScale = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([innerHeight, 0])
      .nice();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Color scheme
    const getColor = (type: string, index: number) => {
      if (type === "start") return "#10b981"; // Green for optimistic
      if (type === "end") return "#ef4444"; // Red for realistic
      // Different colors for each cost adder
      const colors = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];
      return colors[index % colors.length];
    };

    // Draw waterfall bars
    waterfallData.forEach((d, i) => {
      const x = xScale(d.label)!;
      const barWidth = xScale.bandwidth();

      if (d.type === "start") {
        // Starting bar (optimistic)
        g.append("rect")
          .attr("x", x)
          .attr("y", yScale(d.value))
          .attr("width", barWidth)
          .attr("height", innerHeight - yScale(d.value))
          .attr("fill", getColor(d.type, i))
          .attr("opacity", 0.8);
      } else if (d.type === "increase") {
        // Increase bar (cost adder)
        const prevCumulative = i > 0 ? waterfallData[i - 1].cumulative : 0;
        const barHeight = yScale(prevCumulative) - yScale(d.cumulative);
        g.append("rect")
          .attr("x", x)
          .attr("y", yScale(d.cumulative))
          .attr("width", barWidth)
          .attr("height", barHeight)
          .attr("fill", getColor(d.type, i - 1))
          .attr("opacity", 0.8);

        // Connector line
        if (i > 0) {
          const prevX = xScale(waterfallData[i - 1].label)! + xScale.bandwidth();
          g.append("line")
            .attr("x1", prevX)
            .attr("x2", x)
            .attr("y1", yScale(prevCumulative))
            .attr("y2", yScale(prevCumulative))
            .attr("stroke", getColor(d.type, i - 1))
            .attr("stroke-width", 2)
            .attr("opacity", 0.6);
        }
      } else if (d.type === "end") {
        // Ending bar (realistic total)
        g.append("rect")
          .attr("x", x)
          .attr("y", yScale(d.value))
          .attr("width", barWidth)
          .attr("height", innerHeight - yScale(d.value))
          .attr("fill", getColor(d.type, i))
          .attr("opacity", 0.8);
      }

      // Add value label
      const labelY = d.type === "start" || d.type === "end" 
        ? yScale(d.value) - 5 
        : yScale(d.cumulative) - 5;
      g.append("text")
        .attr("x", x + barWidth / 2)
        .attr("y", labelY)
        .style("text-anchor", "middle")
        .style("font-size", isMobile ? "8px" : "10px")
        .style("fill", "#e2e8f0")
        .style("font-weight", 600)
        .text(`$${d.value.toFixed(0)}`);
    });

    // Add axes
    const xAxis = d3.axisBottom(xScale);
    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "8px" : "9px")
      .style("fill", "#94a3b8")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("dx", "-0.5em")
      .attr("dy", "0.5em");

    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `$${d}`);
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
      .text("Cost Components");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Cost per PFLOP ($)");
  }, [currentYear, scenarioMode, optimisticCostPerPflop, realisticCostPerPflop]);

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

