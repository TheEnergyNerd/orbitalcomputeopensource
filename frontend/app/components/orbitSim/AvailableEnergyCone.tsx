"use client";

import React, { useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import * as d3 from "d3";

interface AvailableEnergyConeProps {
  scenarioMode?: string;
}

/**
 * The "Available Energy" Cone (Log Scale)
 * Bottom Line: Earth Grid capacity (growing 2% per year)
 * Top Area: Orbital Solar capacity (growing at Starship launch cadence)
 */
export default function AvailableEnergyCone({ scenarioMode }: AvailableEnergyConeProps) {
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const data = useMemo(() => {
    const entries = getDebugStateEntries(selectedScenarioKey).sort((a, b) => a.year - b.year);
    
    // Earth Grid capacity (growing 2% per year from 2025 base)
    const baseGridGW = 4000; // US grid ~4 TW = 4000 GW
    const gridGrowth = 0.02;
    
    // Orbital Solar capacity from power_total_kw
    return entries.map(entry => {
      const yearsFrom2025 = entry.year - 2025;
      const earthGridGW = baseGridGW * Math.pow(1 + gridGrowth, yearsFrom2025);
      const orbitalSolarGW = (entry.power_total_kw ?? 0) / 1_000_000; // Convert kW to GW
      
      return {
        year: entry.year,
        earthGridGW,
        orbitalSolarGW,
      };
    });
  }, [selectedScenarioKey]);

  React.useEffect(() => {
    if (!svgRef.current || data.length === 0) {
      if (svgRef.current) {
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();
        svg.append("text")
          .attr("x", "50%")
          .attr("y", "50%")
          .attr("text-anchor", "middle")
          .attr("fill", "#94a3b8")
          .text("No data available");
      }
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 80 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year) as [number, number])
      .range([0, width]);

    // Y-Axis: Power Capacity in GW (Log Scale)
    // Range: 0.01 GW to 10,000 GW (10 Terawatts)
    const maxGW = Math.max(
      d3.max(data, d => d.earthGridGW) ?? 1200,
      d3.max(data, d => d.orbitalSolarGW) ?? 0.01
    );
    const yScale = d3.scaleLog()
      .domain([0.01, Math.min(10000, Math.max(1200, maxGW * 1.5))])
      .range([height, 0]);

    // Earth Grid line (bottom)
    const gridLine = d3.line<typeof data[0]>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.earthGridGW))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .attr("d", gridLine);

    // Orbital Solar area (top)
    const area = d3.area<typeof data[0]>()
      .x(d => xScale(d.year))
      .y0(d => yScale(d.earthGridGW))
      .y1(d => yScale(d.orbitalSolarGW))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "#3b82f6")
      .attr("fill-opacity", 0.3)
      .attr("d", area);

    const orbitalLine = d3.line<typeof data[0]>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.orbitalSolarGW))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", orbitalLine);

    // Axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(yScale).tickFormat(d => `${d} GW`);

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
      .attr("y", -50)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Available Power Capacity (Gigawatts)");

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${width - 120}, 20)`);

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
      .text("Earth Grid");

    legend.append("rect")
      .attr("x", 0)
      .attr("y", 15)
      .attr("width", 20)
      .attr("height", 10)
      .attr("fill", "#3b82f6")
      .attr("fill-opacity", 0.3);

    legend.append("text")
      .attr("x", 25)
      .attr("y", 20)
      .attr("dy", "0.35em")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Orbital Solar");
  }, [data]);

  return <svg ref={svgRef} className="w-full h-full" />;
}

