"use client";

import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { RadiatorComputePoint } from "../../lib/orbitSim/selectors/physics";
import type { ScenarioMode } from "../../lib/orbitSim/simulationConfig";

interface RadiatorComputeChartProps {
  data: RadiatorComputePoint[];
  currentYear?: number;
  scenarioMode?: ScenarioMode;
}

/**
 * Radiator vs Compute Chart
 * Scatter plot showing radiator area vs compute capacity
 */
export default function RadiatorComputeChart({ 
  data, 
  currentYear, 
  scenarioMode 
}: RadiatorComputeChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - use container height to match parent
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    // Make width responsive on desktop - use more of the available space
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : Math.min(containerWidth - 32, Math.max(600, containerWidth * 0.9)); // Use 90% of width on desktop
    const height = containerHeight || (isMobile ? 300 : 350);
    
    // Set SVG dimensions to match container
    svg.attr("width", width).attr("height", height);
    const margin = isMobile 
      ? { top: 20, right: 30, bottom: 60, left: 50 } // Increased bottom for mobile
      : { top: 25, right: 80, bottom: 80, left: 80 }; // Reduced bottom margin since we're using cleaner labels
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set up scales - LOG/LOG scale as specified
    // X-Axis: Compute Capacity in ExaFLOPS (Log Scale)
    // computePFlops is in PFLOPs (1e15), convert to ExaFLOPS (1e18) by dividing by 1e3
    const computeValues = data.map(d => d.computePFlops / 1e3).filter(v => v > 0);
    const minComputeExaflops = computeValues.length > 0 ? d3.min(computeValues)! : 0.001;
    const maxComputeExaflops = computeValues.length > 0 ? d3.max(computeValues)! : 100;

    // Use actual data range with padding, but ensure reasonable bounds
    const xDomainMin = Math.max(0.001, minComputeExaflops * 0.1);
    const xDomainMax = Math.min(100, maxComputeExaflops * 10);

    const xScale = d3.scaleLog()
      .domain([xDomainMin, xDomainMax])
      .range([0, innerWidth]);

    // Y-Axis: Radiator Surface Area in m² (Log Scale)
    // Start at 7 m² as requested
    const radiatorValues = data.map(d => d.radiatorAreaM2).filter(v => v > 0);
    const minRadiator = radiatorValues.length > 0 ? d3.min(radiatorValues)! : 7;
    const maxRadiator = radiatorValues.length > 0 ? d3.max(radiatorValues)! : 100000000;

    // Use actual data range with padding, but ensure minimum starts at 7 m²
    const yDomainMin = Math.max(7, minRadiator * 0.1);
    const yDomainMax = Math.min(1000000000, maxRadiator * 10);

    const yScale = d3.scaleLog()
      .domain([yDomainMin, yDomainMax])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add axes with proper log scale formatting
    // Only show powers of 10 for clean labels
    const xAxis = d3.axisBottom(xScale)
      .ticks(6) // Limit to 6 ticks
      .tickFormat(d => {
        const val = Number(d);
        if (val === 0) return "0";
        
        // Only show powers of 10 (clean log scale labels)
        const log = Math.log10(val);
        if (Math.abs(log - Math.round(log)) < 0.001) {
          // It's a power of 10
          if (val >= 1) {
            return `${val} EF`; // ExaFLOPS
          } else if (val >= 0.001) {
            return `${(val * 1000).toFixed(0)} PF`; // PetaFLOPS
          } else {
            return val.toExponential(0);
          }
        }
        return ''; // Don't show non-power-of-10 ticks
      });
    // Reduce tick density - only show major ticks
    // FIX: All Y-axis values in km²
    const yAxis = d3.axisLeft(yScale)
      .ticks(5) // Only 5 ticks for clarity
      .tickFormat(d => {
        const val = Number(d);
        // Convert all to km² - 1 km² = 1,000,000 m²
        const km2 = val / 1e6;
        if (km2 >= 1) {
          return `${km2.toFixed(1)}`;
        } else if (km2 >= 0.1) {
          return `${km2.toFixed(2)}`;
        } else {
          return `${km2.toFixed(3)}`;
        }
      });

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");

    g.append("g")
      .call(yAxis)
      .selectAll("text")
      .style("font-size", isMobile ? "9px" : "11px")
      .style("fill", "#94a3b8");

    // Axis labels
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2},${innerHeight + margin.bottom - 5})`)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Global Orbital Compute Capacity (ExaFLOPS - Log Scale)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Total Radiative Surface Area (km²)");

    // REALITY CHECK: Add feasibility zones (green/yellow/red)
    // Body-mounted feasible: 0-20 m²
    const maxBodyMountedM2 = 20;
    const bodyMountedZone = g.append("rect")
      .attr("x", 0)
      .attr("y", yScale(maxBodyMountedM2 * 1e6)) // Convert to m² for scale
      .attr("width", innerWidth)
      .attr("height", innerHeight - yScale(maxBodyMountedM2 * 1e6))
      .attr("fill", "#10b981")
      .attr("opacity", 0.1);

    // Deployable required: 20-100 m²
    const maxDeployableM2 = 100;
    const deployableZone = g.append("rect")
      .attr("x", 0)
      .attr("y", yScale(maxDeployableM2 * 1e6))
      .attr("width", innerWidth)
      .attr("height", yScale(maxBodyMountedM2 * 1e6) - yScale(maxDeployableM2 * 1e6))
      .attr("fill", "#f59e0b")
      .attr("opacity", 0.1);

    // Bleeding edge: 100+ m²
    const bleedingEdgeZone = g.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerWidth)
      .attr("height", yScale(maxDeployableM2 * 1e6))
      .attr("fill", "#ef4444")
      .attr("opacity", 0.1);

    // Add zone labels
    g.append("text")
      .attr("x", innerWidth - 10)
      .attr("y", yScale(maxBodyMountedM2 * 1e6) - 5)
      .style("text-anchor", "end")
      .style("font-size", isMobile ? "8px" : "9px")
      .style("fill", "#10b981")
      .style("font-weight", 600)
      .text("Body-mounted feasible");

    g.append("text")
      .attr("x", innerWidth - 10)
      .attr("y", yScale(maxDeployableM2 * 1e6) - 5)
      .style("text-anchor", "end")
      .style("font-size", isMobile ? "8px" : "9px")
      .style("fill", "#f59e0b")
      .style("font-weight", 600)
      .text("Deployable required");

    g.append("text")
      .attr("x", innerWidth - 10)
      .attr("y", 15)
      .style("text-anchor", "end")
      .style("font-size", isMobile ? "8px" : "9px")
      .style("fill", "#ef4444")
      .style("font-weight", 600)
      .text("Bleeding edge");

    // Draw points - Convert PFLOPs to ExaFLOPS for positioning
    g.selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", d => xScale(d.computePFlops / 1e3)) // Convert PFLOPs to ExaFLOPS
      .attr("cy", d => yScale(d.radiatorAreaM2))
      .attr("r", 4)
      .attr("fill", "#3b82f6")
      .attr("fill-opacity", 0.6)
      .attr("stroke", "#60a5fa")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .style("pointer-events", "all")
      .on("mouseover", function(event, d) {
        d3.select(this).attr("r", 6).attr("fill-opacity", 1);
        if (tooltipRef.current) {
          // Convert PFLOPs to ExaFLOPS
          const exaflops = d.computePFlops / 1e3;
          // Convert m² to km² for display - FIX: 1 km² = 1,000,000 m²
          const radiatorKm2 = d.radiatorAreaM2 / 1e6;
          // Calculate ratio: m² per PFLOP (not per ExaFLOPS to avoid huge numbers)
          const ratio = d.radiatorAreaM2 / d.computePFlops;
          
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${event.clientX + 10}px`;
          tooltipRef.current.style.top = `${event.clientY - 10}px`;
          tooltipRef.current.innerHTML = `
            <div><strong>${d.year}</strong></div>
            <div>Compute: ${exaflops.toFixed(2)} ExaFLOPS</div>
            <div>Radiator: ${radiatorKm2.toFixed(3)} km² (${d.radiatorAreaM2.toFixed(0)} m²)</div>
            <div>Ratio: ${ratio.toFixed(1)} m²/PFLOP</div>
          `;
        }
      })
      .on("mouseout", function() {
        d3.select(this).attr("r", 4).attr("fill-opacity", 0.6);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add hover overlay for better interaction - overlay must be on top to catch events
    const overlay = g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .style("pointer-events", "all")
      .on("mousemove", function(event) {
        const [mouseX, mouseY] = d3.pointer(event);
        
        // Find closest point (use ExaFLOPS conversion for xScale)
        const closestPoint = data.reduce((closest, d) => {
          const dist = Math.sqrt(
            Math.pow(xScale(d.computePFlops / 1e3) - mouseX, 2) + 
            Math.pow(yScale(d.radiatorAreaM2) - mouseY, 2)
          );
          const closestDist = Math.sqrt(
            Math.pow(xScale(closest.computePFlops / 1e3) - mouseX, 2) + 
            Math.pow(yScale(closest.radiatorAreaM2) - mouseY, 2)
          );
          return dist < closestDist ? d : closest;
        }, data[0]);
        
        if (tooltipRef.current && closestPoint) {
          // Convert PFLOPs to ExaFLOPS
          const exaflops = closestPoint.computePFlops / 1e3;
          // Convert m² to km² for display - FIX: 1 km² = 1,000,000 m²
          const radiatorKm2 = closestPoint.radiatorAreaM2 / 1e6;
          // Calculate ratio: m² per PFLOP
          const ratio = closestPoint.radiatorAreaM2 / closestPoint.computePFlops;
          
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${event.clientX + 10}px`;
          tooltipRef.current.style.top = `${event.clientY - 10}px`;
          tooltipRef.current.innerHTML = `
            <div><strong>${closestPoint.year}</strong></div>
            <div>Compute: ${exaflops.toFixed(2)} ExaFLOPS</div>
            <div>Radiator: ${radiatorKm2.toFixed(3)} km² (${closestPoint.radiatorAreaM2.toFixed(0)} m²)</div>
            <div>Ratio: ${ratio.toFixed(1)} m²/PFLOP</div>
          `;
        }
      })
      .on("mouseout", () => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Highlight current year (use ExaFLOPS conversion for xScale)
    if (currentYear) {
      const currentPoint = data.find(d => d.year === currentYear);
      if (currentPoint) {
        g.append("circle")
          .attr("cx", xScale(currentPoint.computePFlops / 1e3))
          .attr("cy", yScale(currentPoint.radiatorAreaM2))
          .attr("r", 8)
          .attr("fill", "none")
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 2)
          .attr("opacity", 0.8);
      }
    }

  }, [data, currentYear]);

  if (data.length === 0) {
    return <div className="text-slate-400 text-sm">No radiator data available</div>;
  }

  return (
    <div className="relative w-full h-full">
      <svg 
        ref={svgRef} 
        className="w-full h-full" 
        preserveAspectRatio="xMidYMid meet"
      />
      <div
        ref={tooltipRef}
        className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white pointer-events-none z-50"
        style={{ display: "none" }}
      />
    </div>
  );
}
