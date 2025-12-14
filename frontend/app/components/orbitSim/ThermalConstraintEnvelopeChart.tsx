"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface ThermalConstraintEnvelopeChartProps {
  currentYear?: number;
  scenarioMode?: ScenarioMode;
  currentPowerKw?: number;
  currentRadiatorAreaM2?: number;
}

/**
 * Thermal Constraint Envelope Chart
 * Shows the relationship between power, radiator area, and feasibility zones
 * Y-axis: Power per Satellite (kW)
 * X-axis: Radiator Area (m²)
 * Zones: Body-mounted feasible / Deployable required / Bleeding edge / Not feasible
 */
export default function ThermalConstraintEnvelopeChart({
  currentYear = 2033,
  scenarioMode,
  currentPowerKw,
  currentRadiatorAreaM2,
}: ThermalConstraintEnvelopeChartProps) {
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

    // Thermal model constants
    const RADIATOR_EFFICIENCY_KW_PER_M2 = 0.2; // 200 W/m² = 0.2 kW/m²
    const HEAT_FRACTION = 0.85; // 85% of power becomes heat
    const MAX_BODY_MOUNTED_M2 = 20;
    const MAX_DEPLOYABLE_M2 = 100;

    // Calculate max power for given radiator area: P = (A × flux) / heat_fraction
    const calculateMaxPower = (radiatorAreaM2: number) => {
      return (radiatorAreaM2 * RADIATOR_EFFICIENCY_KW_PER_M2) / HEAT_FRACTION;
    };

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, 500]) // Up to 500 m²
      .range([0, innerWidth])
      .nice();

    const yScale = d3.scaleLinear()
      .domain([0, 100]) // Up to 100 kW
      .range([innerHeight, 0])
      .nice();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Define feasibility zones
    const zones = [
      {
        name: "Body-mounted feasible",
        color: "#10b981",
        opacity: 0.2,
        area: [0, MAX_BODY_MOUNTED_M2],
        power: [0, calculateMaxPower(MAX_BODY_MOUNTED_M2)],
      },
      {
        name: "Deployable required",
        color: "#f59e0b",
        opacity: 0.2,
        area: [MAX_BODY_MOUNTED_M2, MAX_DEPLOYABLE_M2],
        power: [calculateMaxPower(MAX_BODY_MOUNTED_M2), calculateMaxPower(MAX_DEPLOYABLE_M2)],
      },
      {
        name: "Bleeding edge",
        color: "#ef4444",
        opacity: 0.15,
        area: [MAX_DEPLOYABLE_M2, 500],
        power: [calculateMaxPower(MAX_DEPLOYABLE_M2), calculateMaxPower(500)],
      },
    ];

    // Draw feasibility zones
    zones.forEach((zone) => {
      // Create area path for zone
      const areaPath = d3.area<number>()
        .x((d) => xScale(d))
        .y0((d) => yScale(0))
        .y1((d) => {
          const maxPower = calculateMaxPower(d);
          return yScale(Math.min(maxPower, 100));
        })
        .curve(d3.curveLinear);

      // Generate points for the zone
      const points = [];
      for (let area = zone.area[0]; area <= zone.area[1]; area += 1) {
        points.push(area);
      }

      g.append("path")
        .datum(points)
        .attr("fill", zone.color)
        .attr("opacity", zone.opacity)
        .attr("d", areaPath);

      // Add zone label
      const midArea = (zone.area[0] + zone.area[1]) / 2;
      const midPower = calculateMaxPower(midArea);
      g.append("text")
        .attr("x", xScale(midArea))
        .attr("y", yScale(midPower / 2))
        .style("text-anchor", "middle")
        .style("font-size", isMobile ? "9px" : "10px")
        .style("fill", zone.color)
        .style("font-weight", 600)
        .text(zone.name);
    });

    // Draw thermal constraint line (max power for given radiator area)
    const constraintLine = [];
    for (let area = 0; area <= 500; area += 5) {
      const maxPower = calculateMaxPower(area);
      constraintLine.push({ area, power: Math.min(maxPower, 100) });
    }

    const line = d3.line<{ area: number; power: number }>()
      .x(d => xScale(d.area))
      .y(d => yScale(d.power))
      .curve(d3.curveLinear);

    g.append("path")
      .datum(constraintLine)
      .attr("fill", "none")
      .attr("stroke", "#00f0ff")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.8)
      .attr("d", line);

    // Add constraint line label
    g.append("text")
      .attr("x", xScale(250))
      .attr("y", yScale(calculateMaxPower(250)) - 10)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "9px" : "10px")
      .style("fill", "#00f0ff")
      .style("font-weight", 600)
      .text("Thermal Limit");

    // Draw zone boundaries
    // Body-mounted boundary
    g.append("line")
      .attr("x1", xScale(MAX_BODY_MOUNTED_M2))
      .attr("x2", xScale(MAX_BODY_MOUNTED_M2))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.6);

    // Deployable boundary
    g.append("line")
      .attr("x1", xScale(MAX_DEPLOYABLE_M2))
      .attr("x2", xScale(MAX_DEPLOYABLE_M2))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.6);

    // Mark current satellite position if provided
    if (currentPowerKw !== undefined && currentRadiatorAreaM2 !== undefined) {
      const x = xScale(currentRadiatorAreaM2);
      const y = yScale(currentPowerKw);
      const maxPowerForArea = calculateMaxPower(currentRadiatorAreaM2);
      const isFeasible = currentPowerKw <= maxPowerForArea;

      // Draw current position
      g.append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 6)
        .attr("fill", isFeasible ? "#3b82f6" : "#ef4444")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2);

      // Add label
      g.append("text")
        .attr("x", x + 10)
        .attr("y", y - 10)
        .style("font-size", isMobile ? "9px" : "10px")
        .style("fill", isFeasible ? "#3b82f6" : "#ef4444")
        .style("font-weight", 600)
        .text(`Current (${currentPowerKw.toFixed(1)} kW, ${currentRadiatorAreaM2.toFixed(0)} m²)`);
    }

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => `${d} m²`);
    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisGroup.selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");

    xAxisGroup.selectAll("line, path")
      .style("stroke", "#475569");

    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => `${d} kW`);
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
      .text("Radiator Area (m²)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Power per Satellite (kW)");
  }, [currentYear, scenarioMode, currentPowerKw, currentRadiatorAreaM2]);

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

