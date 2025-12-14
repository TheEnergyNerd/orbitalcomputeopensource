"use client";

import React, { useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import { getComputeDensityCurve } from "../../lib/orbitSim/mooresLawPlateau";
import * as d3 from "d3";

interface MooresLawOfMassProps {
  scenarioMode?: string;
}

/**
 * The "Moore's Law of Mass" (TFLOPS per kg)
 * Plot the compute density of the entire launched payload over time
 */
export default function MooresLawOfMass({ scenarioMode }: MooresLawOfMassProps) {
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const data = useMemo(() => {
    const entries = getDebugStateEntries(selectedScenarioKey).sort((a, b) => a.year - b.year);
    
    return entries.map(entry => {
      const totalMassKg = entry.bus_total_mass_kg ?? 1500;
      const computeTflops = (entry.compute_raw_flops ?? 0) / 1e12; // Convert to TFLOPS
      const tflopsPerKg = totalMassKg > 0 ? computeTflops / totalMassKg : 0;
      
      return {
        year: entry.year,
        tflopsPerKg,
        computeTflops,
        massKg: totalMassKg,
      };
    }).filter(d => d.tflopsPerKg > 0);
  }, [selectedScenarioKey]);

  // Get theoretical plateau curve
  const plateauCurve = useMemo(() => {
    if (data.length === 0) return [];
    const minYear = Math.min(...data.map(d => d.year));
    const maxYear = Math.max(...data.map(d => d.year));
    return getComputeDensityCurve(minYear, Math.max(maxYear, 2050));
  }, [data]);

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

    // Y-Axis: Compute Density in TFLOPS/kg (Linear Scale)
    // Range: 0 to 2.0 TFLOPS/kg, Increment: 0.2 TFLOPS/kg
    const maxTflopsPerKg = d3.max(data, d => d.tflopsPerKg) ?? 2.0;
    const yScale = d3.scaleLinear()
      .domain([0, Math.max(2.0, maxTflopsPerKg * 1.1)])
      .nice()
      .range([height, 0]);

    // Theoretical plateau curve (S-curve)
    const plateauLine = d3.line<typeof plateauCurve[0]>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.tflopsPerKg))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(plateauCurve)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", 0.7)
      .attr("d", plateauLine);

    // Actual data line
    const line = d3.line<typeof data[0]>()
      .x(d => xScale(d.year))
      .y(d => yScale(d.tflopsPerKg))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", line);

    // Points
    g.selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", d => xScale(d.year))
      .attr("cy", d => yScale(d.tflopsPerKg))
      .attr("r", 3)
      .attr("fill", "#3b82f6");

    // Plateau annotations
    const annotations = [
      { year: 2025, value: 10, label: "Current: 3nm", color: "#94a3b8" },
      { year: 2035, value: 260, label: "Inflection point", color: "#f59e0b" },
      { year: 2045, value: 490, label: "Physics plateau", color: "#ef4444" },
    ];

    annotations.forEach(annotation => {
      if (annotation.year >= (data[0]?.year ?? 2025) && annotation.year <= (data[data.length - 1]?.year ?? 2040)) {
        const plateauValue = plateauCurve.find(d => d.year === annotation.year)?.tflopsPerKg ?? annotation.value;
        g.append("line")
          .attr("x1", xScale(annotation.year))
          .attr("x2", xScale(annotation.year))
          .attr("y1", 0)
          .attr("y2", height)
          .attr("stroke", annotation.color)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3,3")
          .attr("opacity", 0.5);

        g.append("text")
          .attr("x", xScale(annotation.year))
          .attr("y", yScale(plateauValue))
          .attr("dx", 5)
          .attr("dy", -5)
          .attr("fill", annotation.color)
          .attr("font-size", "10px")
          .text(annotation.label);
      }
    });

    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${width - 150}, 20)`);

    legend.append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2);
    legend.append("text")
      .attr("x", 25)
      .attr("y", 0)
      .attr("dy", "0.35em")
      .attr("fill", "#94a3b8")
      .attr("font-size", "10px")
      .text("Actual");

    legend.append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 15)
      .attr("y2", 15)
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,5");
    legend.append("text")
      .attr("x", 25)
      .attr("y", 15)
      .attr("dy", "0.35em")
      .attr("fill", "#94a3b8")
      .attr("font-size", "10px")
      .text("Theoretical (S-curve)");

    // Axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(yScale)
      .ticks(10)
      .tickFormat(d => `${Number(d).toFixed(1)}`); // Just numbers, unit is in axis label

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
      .text("System-Level Compute Density (TFLOPS per Launch kg)");
  }, [data]);

  return <svg ref={svgRef} className="w-full h-full" />;
}

