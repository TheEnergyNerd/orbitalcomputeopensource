"use client";

import React, { useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import type { YearStep } from "../../lib/orbitSim/simulationConfig";
import * as d3 from "d3";

interface CrossoverChartProps {
  timeline: YearStep[];
  scenarioMode?: string;
}

/**
 * The "Crossover" Chart (Cost)
 * Shows Ground staying flat (or rising) and Orbit crashing through it like a meteor.
 * The intersection point (2028-2030) is marked with "ECONOMIC SINGULARITY" annotation.
 */
export default function CrossoverChart({ timeline, scenarioMode }: CrossoverChartProps) {
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const data = useMemo(() => {
    const entries = getDebugStateEntries(selectedScenarioKey);
    const entryMap = new Map(entries.map(e => [e.year, e]));

    return timeline.map(step => {
      const debugEntry = entryMap.get(step.year);
      return {
        year: step.year,
        ground: debugEntry?.physics_cost_per_pflop_year_ground ?? 340,
        orbit: debugEntry?.physics_cost_per_pflop_year_orbit ?? Infinity,
      };
    }).filter(d => isFinite(d.orbit));
  }, [timeline, selectedScenarioKey]);

  React.useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, width]);

    const yScale = d3.scaleLog()
      .domain([1, d3.max(data, d => Math.max(d.ground, d.orbit))! * 1.1])
      .range([height, 0]);

    // Find crossover point
    const crossover = data.find((d, i) => {
      if (i === 0) return false;
      const prev = data[i - 1];
      return prev.orbit > prev.ground && d.orbit <= d.ground;
    });

    // Ground line (red, flat/wobbly)
    const groundLine = d3.line<typeof data[0]>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.ground))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .attr("d", groundLine);

    // Orbit line (blue, steep exponential decay)
    const orbitLine = d3.line<typeof data[0]>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.orbit))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", orbitLine);

    // Crossover annotation
    if (crossover) {
      const x = xScale(crossover.year);
      const y = yScale(crossover.ground);

      g.append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 6)
        .attr("fill", "#fbbf24")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

      g.append("text")
        .attr("x", x)
        .attr("y", y - 15)
        .attr("text-anchor", "middle")
        .attr("fill", "#fbbf24")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text("ECONOMIC SINGULARITY");
    }

    // Axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(yScale).tickFormat(d => `$${d}`);

    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis)
      .attr("color", "#94a3b8");

    g.append("g")
      .call(yAxis)
      .attr("color", "#94a3b8");

    // Labels
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height + 35)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Year");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -40)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Cost per PFLOP ($)");

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${width - 100}, 20)`);

    legend.append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2);

    legend.append("text")
      .attr("x", 25)
      .attr("y", 0)
      .attr("dy", "0.35em")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Ground");

    legend.append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 20)
      .attr("y2", 20)
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2);

    legend.append("text")
      .attr("x", 25)
      .attr("y", 20)
      .attr("dy", "0.35em")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Orbit");
  }, [data]);

  return <svg ref={svgRef} className="w-full h-full" />;
}

