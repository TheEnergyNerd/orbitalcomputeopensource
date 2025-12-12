"use client";

import React, { useMemo } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import * as d3 from "d3";

interface MassEfficiencyWaterfallProps {
  scenarioMode?: string;
}

/**
 * The "Mass Efficiency" Waterfall
 * Shows why Class B (Handmer) wins by comparing infrastructure mass for 1 MW Datacenter
 */
export default function MassEfficiencyWaterfall({ scenarioMode }: MassEfficiencyWaterfallProps) {
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const data = useMemo(() => {
    // For 1 MW datacenter comparison
    const targetPowerMW = 1;
    
    // Earth: Cooling Towers, Land, Concrete, Grid Interconnect
    const earthMass = {
      cooling: 500, // tons
      land: 200,
      concrete: 300,
      grid: 100,
      total: 1100,
    };
    
    // Class A Space: Batteries, heavy structure
    const classAMass = {
      batteries: 400,
      structure: 300,
      other: 200,
      total: 900,
    };
    
    // Class B Space: Just Silicon + Solar + Thin Film Radiator
    const classBMass = {
      silicon: 50,
      solar: 100,
      radiator: 150,
      total: 300,
    };
    
    return [
      { category: "Earth", ...earthMass },
      { category: "Class A Space", ...classAMass },
      { category: "Class B Space", ...classBMass },
    ];
  }, []);

  React.useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 20, bottom: 60, left: 80 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand()
      .domain(data.map(d => d.category))
      .range([0, width])
      .padding(0.3);

    const maxMass = d3.max(data, d => d.total)!;
    const yScale = d3.scaleLinear()
      .domain([0, maxMass * 1.1])
      .range([height, 0]);

    const colors = {
      cooling: "#ef4444",
      land: "#f97316",
      concrete: "#eab308",
      grid: "#84cc16",
      batteries: "#3b82f6",
      structure: "#6366f1",
      other: "#8b5cf6",
      silicon: "#10b981",
      solar: "#14b8a6",
      radiator: "#06b6d4",
    };

    data.forEach((d, i) => {
      let yPos = height;
      
      // Stack components - safely access properties that may not exist on all types
      const components = [
        { name: "cooling", value: (d as any).cooling || 0 },
        { name: "land", value: (d as any).land || 0 },
        { name: "concrete", value: (d as any).concrete || 0 },
        { name: "grid", value: (d as any).grid || 0 },
        { name: "batteries", value: (d as any).batteries || 0 },
        { name: "structure", value: (d as any).structure || 0 },
        { name: "other", value: (d as any).other || 0 },
        { name: "silicon", value: (d as any).silicon || 0 },
        { name: "solar", value: (d as any).solar || 0 },
        { name: "radiator", value: (d as any).radiator || 0 },
      ].filter(c => c.value > 0);

      components.forEach(comp => {
        const barHeight = yScale(0) - yScale(comp.value);
        g.append("rect")
          .attr("x", xScale(d.category)!)
          .attr("y", yPos - barHeight)
          .attr("width", xScale.bandwidth())
          .attr("height", barHeight)
          .attr("fill", (colors as any)[comp.name] || "#94a3b8");
        
        yPos -= barHeight;
      });
    });

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .attr("color", "#94a3b8");

    // Y axis
    g.append("g")
      .call(d3.axisLeft(yScale).tickFormat(d => `${d}t`))
      .attr("color", "#94a3b8");

    // Labels
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height + 50)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Infrastructure Type");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -50)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .text("Mass (tons) for 1 MW Datacenter");
  }, [data]);

  return <svg ref={svgRef} className="w-full h-full" />;
}

