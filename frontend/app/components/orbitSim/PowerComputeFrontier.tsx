"use client";

import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { buildPowerComputeFrontier } from "../../lib/orbitSim/selectors/frontier";
import { getDebugStateEntries } from "../../lib/orbitSim/debugState";
import type { FrontierPoint } from "../../lib/orbitSim/selectors/frontier";
import SubtleParticleField from "./SubtleParticleField";
import { useSimulationStore } from "../../store/simulationStore";

interface PowerComputeFrontierProps {
  currentYear?: number;
  onYearClick?: (year: number) => void;
  scenarioMode?: string;
}

/**
 * Animated Power → Compute Frontier (D3)
 * - Dashed Pareto frontier line through best compute for each power bin
 * - Points colored by constraint class (teal=power-limited, cyan=network-limited, grey=ground-limited)
 * - Animated with year slider/play-pause
 * - Hover shows year, power, PFLOPs, binding constraint
 * - Click highlights corresponding year across all charts
 */
export default function PowerComputeFrontier({ 
  currentYear,
  onYearClick,
  scenarioMode // Legacy prop, will be ignored in favor of selectedScenarioKey
}: PowerComputeFrontierProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 600, height: 400 });
  
  // Use selectedScenarioKey from store (single source of truth)
  const selectedScenarioKey = useSimulationStore((s) => s.selectedScenarioKey) || "BASELINE"; // CRITICAL FIX: Fallback to BASELINE if undefined

  // Get data from debug state, filtered by selected scenario
  const frontierData = useMemo(() => {
    // Use selectedScenarioKey from store (single source of truth)
    const entries = getDebugStateEntries(selectedScenarioKey);
    
    // Debug: Verify we're getting scenario-specific data
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && entries.length > 0) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      console.log(`[Frontier Chart] ${selectedScenarioKey} - First: ${first.year} power=${first.power_total_kw}kW compute=${first.compute_exportable_flops}, Last: ${last.year} power=${last.power_total_kw}kW compute=${last.compute_exportable_flops}`);
    }
    
    return buildPowerComputeFrontier(entries);
  }, [selectedScenarioKey]);

  // Get orbit share for particle animation (from latest entry)
  const orbitShare = useMemo(() => {
    const entries = getDebugStateEntries(selectedScenarioKey);
    if (entries.length === 0) return 0;
    const latest = entries[entries.length - 1];
    return latest.orbit_compute_share || 0;
  }, [selectedScenarioKey]);

  // Update container size for particles
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    
    // Debug: Log if no data
    if (frontierData.length === 0) {
      console.warn(`[PowerComputeFrontier] No data for scenario ${selectedScenarioKey}`);
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - use container height
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 600;
    const containerHeight = container?.clientHeight || 350;
    const isMobile = containerWidth < 640;
    // FIX for desktop: use full container dimensions
    const width = isMobile 
      ? Math.min(containerWidth - 32, 600)
      : containerWidth - 32; // Use full container width on desktop
    const height = isMobile
      ? containerHeight || 300
      : containerHeight || 400; // Use full container height on desktop
    const margin = isMobile 
      ? { top: 20, right: 30, bottom: 60, left: 50 }
      : { top: 25, right: 80, bottom: 100, left: 80 }; // Reduced bottom margin for desktop
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Set SVG dimensions explicitly - CRITICAL for rendering
    svg.attr("width", width).attr("height", height);

    // Set up scales - ensure we have valid data
    const allPower = frontierData.map(d => d.powerMw).filter(v => isFinite(v) && v > 0);
    const allCompute = frontierData.map(d => d.computePFlops).filter(v => isFinite(v) && v > 0);
    
    // Create main group FIRST (always create it, even if no data)
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // If no valid data, show empty chart with axes and grid
    if (allPower.length === 0 || allCompute.length === 0) {
      console.warn(`[PowerComputeFrontier] No valid data points. Total entries: ${frontierData.length}, Valid power: ${allPower.length}, Valid compute: ${allCompute.length}`);
      
      const xScale = d3.scaleLinear()
        .domain([0, 1])
        .range([0, innerWidth]);
      const yScale = d3.scaleLinear()
        .domain([0, 1])
        .range([innerHeight, 0]);
      
      // Draw grid
      g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ""));
      
      g.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ""));
      
      // Draw axes
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale));
      g.append("g")
        .call(d3.axisLeft(yScale));
      
      // Add axis labels
      g.append("text")
        .attr("transform", `translate(${innerWidth / 2}, ${innerHeight + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .style("font-size", isMobile ? "10px" : "12px")
        .style("fill", "#94a3b8")
        .text("Power (MW)");
      
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (innerHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", isMobile ? "10px" : "12px")
        .style("fill", "#94a3b8")
        .text("Compute (PFLOPs)");
      
      return; // Exit early if no data
    }
    
    // CRITICAL FIX: Filter out invalid values before calculating min/max
    const validPower = allPower.filter(p => p > 0 && isFinite(p));
    const validCompute = allCompute.filter(c => c > 0 && isFinite(c));
    
    const minPower = validPower.length > 0 ? d3.min(validPower)! : 0;
    const maxPower = validPower.length > 0 ? d3.max(validPower)! : 1;
    const minCompute = validCompute.length > 0 ? d3.min(validCompute)! : 0;
    const maxCompute = validCompute.length > 0 ? d3.max(validCompute)! : 0.001; // Default to small value if all zeros

    // CRITICAL FIX: Ensure domain is valid and non-zero
    const computeDomainMin = minCompute > 0 ? minCompute * 0.9 : 0;
    const computeDomainMax = maxCompute > 0 ? maxCompute * 1.1 : 0.001; // Small default if all zeros

    const xScale = d3.scaleLinear()
      .domain([Math.max(0, minPower * 0.95), maxPower * 1.05 || 1])
      .nice()
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([computeDomainMin, computeDomainMax])
      .nice()
      .range([innerHeight, 0]);

    // Main group already created above

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => {
        const val = Number(d);
        if (val < 0.1) {
          return `${(val * 1000).toFixed(0)} kW`;
        } else if (val < 1) {
          return `${val.toFixed(2)} MW`;
        } else {
          return `${val.toFixed(1)} MW`;
        }
      });
    const yAxis = d3.axisLeft(yScale)
      .ticks(8) // Force more ticks for better visibility
      .tickFormat(d => {
        const val = Number(d);
        // Keep all values in PFLOPS, don't switch to ExaFLOPS
        if (val === 0 || !isFinite(val)) {
          return "0";
        } else if (val >= 1000) {
          // >= 1000 PFLOPS = show as "k" (e.g., "2k" for 2000)
          return `${(val / 1000).toFixed(1)}k`;
        } else if (val >= 1) {
          return `${val.toFixed(0)}`;
        } else if (val >= 0.1) {
          return `${val.toFixed(1)}`;
        } else {
          return `${val.toFixed(2)}`;
        }
      });

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", isMobile ? "8px" : "10px")
      .style("fill", "#94a3b8");

    g.append("g")
      .call(yAxis)
      .selectAll("text")
      .style("font-size", isMobile ? "8px" : "10px")
      .style("fill", "#94a3b8");

    // Axis labels
    g.append("text")
      .attr("transform", `translate(${innerWidth / 2}, ${innerHeight + margin.bottom - 5})`)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("Power (MW)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -(margin.left - 15))
      .attr("x", -innerHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", isMobile ? "10px" : "12px")
      .style("fill", "#94a3b8")
      .text("PFLOPS");

    // Draw grid FIRST (so it's behind everything)
    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-dasharray", "2,2");

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ""))
      .selectAll("line")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-dasharray", "2,2");

    // Build Pareto frontier
    // Group by power bins and find max compute in each bin
    const powerBins = new Map<number, FrontierPoint[]>();
    const binSize = maxPower / 20; // 20 bins

    frontierData.forEach(point => {
      const bin = Math.floor(point.powerMw / binSize);
      if (!powerBins.has(bin)) {
        powerBins.set(bin, []);
      }
      powerBins.get(bin)!.push(point);
    });

    const paretoPoints: Array<{ powerMw: number; computePFlops: number }> = [];
    powerBins.forEach((points, bin) => {
      const maxPoint = points.reduce((max, p) => 
        p.computePFlops > max.computePFlops ? p : max
      );
      paretoPoints.push({
        powerMw: maxPoint.powerMw,
        computePFlops: maxPoint.computePFlops
      });
    });

    // Sort by power for line drawing
    paretoPoints.sort((a, b) => a.powerMw - b.powerMw);

    // Draw Pareto frontier line (only if we have points)
    if (paretoPoints.length > 0) {
      const line = d3.line<{ powerMw: number; computePFlops: number }>()
        .x(d => xScale(d.powerMw))
        .y(d => yScale(d.computePFlops))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(paretoPoints)
        .attr("fill", "none")
        .attr("stroke", "#10b981")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .attr("d", line);
    }

    // Color mapping for constraint classes
    const colorMap: Record<string, string> = {
      "power-limited": "#14b8a6", // teal
      "network-limited": "#06b6d4", // cyan
      "ground-limited": "#64748b" // grey
    };

    // Filter data to show up to current year
    const visibleData = currentYear 
      ? frontierData.filter(d => d.year <= currentYear)
      : frontierData;

    // Draw points (only if we have valid data)
    if (visibleData.length > 0) {
      const points = g.selectAll(".frontier-point")
        .data(visibleData)
        .enter()
        .append("circle")
      .attr("class", "frontier-point")
      .attr("cx", d => xScale(d.powerMw))
      .attr("cy", d => yScale(d.computePFlops))
      .attr("r", 4)
      .attr("fill", d => colorMap[d.frontierClass] || "#64748b")
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .style("pointer-events", "all") // CRITICAL FIX: Ensure pointer events are enabled
      .style("opacity", d => d.year === currentYear ? 1 : 0.6)
      .on("mouseover", function(event, d) {
        d3.select(this).attr("r", 6).style("opacity", 1);
        
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "block";
          tooltipRef.current.innerHTML = `
            <div class="text-xs">
              <div class="font-semibold">Year: ${d.year}</div>
              <div>Power: ${d.powerMw.toFixed(2)} MW</div>
              <div>Compute: ${d.computePFlops.toFixed(2)} PFLOPs</div>
              <div>Constraint: ${d.frontierClass.replace("-", " ")}</div>
            </div>
          `;
        }
      })
      .on("mousemove", function(event) {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
        }
      })
      .on("mouseout", function(event, d: FrontierPoint) {
        d3.select(this).attr("r", 4).style("opacity", d.year === currentYear ? 1 : 0.6);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      })
      .on("click", function(event, d) {
        if (onYearClick) {
          onYearClick(d.year);
        }
      });

      // Highlight current year point
      if (currentYear) {
        const currentPoint = visibleData.find(d => d.year === currentYear);
        if (currentPoint) {
          g.append("circle")
            .attr("cx", xScale(currentPoint.powerMw))
            .attr("cy", yScale(currentPoint.computePFlops))
            .attr("r", 8)
            .attr("fill", "none")
            .attr("stroke", "#fbbf24")
            .attr("stroke-width", 2)
            .style("opacity", 0.8);
        }
      }
    }

    // Legend (responsive position)
    const legendX = isMobile ? innerWidth - 60 : innerWidth - 70;
    const legend = g.append("g")
      .attr("transform", `translate(${legendX}, 20)`);

    const legendItems = [
      { label: "Power-limited", color: "#14b8a6" },
      { label: "Network-limited", color: "#06b6d4" },
      { label: "Ground-limited", color: "#64748b" }
    ];

    legendItems.forEach((item, i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);
      
      legendRow.append("circle")
        .attr("r", 4)
        .attr("fill", item.color)
        .attr("stroke", "#1e293b")
        .attr("stroke-width", 1);
      
      legendRow.append("text")
        .attr("x", 10)
        .attr("y", 4)
      .style("font-size", isMobile ? "9px" : "10px")
      .style("fill", "#cbd5e1")
        .text(item.label);
    });

  }, [frontierData, currentYear, onYearClick]);

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ minHeight: '300px' }}>
      {/* Particle field behind chart - ensure it doesn't block pointer events */}
      <div style={{ pointerEvents: 'none', position: 'absolute', width: '100%', height: '100%' }}>
        <SubtleParticleField
          width={containerSize.width}
          height={containerSize.height}
          particleCount={75}
          orbitShare={orbitShare}
          isActive={true}
        />
      </div>
      <svg 
        ref={svgRef}
        className="relative z-10"
        style={{ width: '100%', height: '100%', minHeight: '300px', pointerEvents: 'all' }}
      />
      <div
        ref={tooltipRef}
        className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white pointer-events-none z-50 shadow-lg"
        style={{ display: "none" }}
      />
    </div>
  );
}

