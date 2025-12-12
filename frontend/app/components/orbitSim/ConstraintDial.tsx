"use client";

import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { getDebugStateEntries, scenarioModeToKey } from "../../lib/orbitSim/debugState";
import { buildMassFractionsSeries, buildBottleneckSeries } from "../../lib/orbitSim/selectors/orbitalPhysics";
import type { DebugStateEntry } from "../../lib/orbitSim/debugState";

interface ConstraintDialProps {
  currentYear?: number;
  onYearChange?: (year: number) => void;
  scenarioMode?: string;
}

/**
 * ConstraintDial Radial Chart
 * - Center circle per year on vertical scrub bar
 * - Radial chart with spokes: Silicon, Radiator, Solar, Structure, Shielding, Power electronics
 * - Overlay second polygon for utilizations: heat, backhaul, manufacturing, maintenance, autonomy
 * - Scroll through years with mouse wheel or mini timeline
 * - Animate polygons morphing between years
 */
export default function ConstraintDial({ 
  currentYear,
  onYearChange,
  scenarioMode
}: ConstraintDialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear || 2025);
  const [hoveredSegment, setHoveredSegment] = useState<{ type: 'mass' | 'util'; label: string; value: number } | null>(null);

  // Get data from debug state, filtered by scenario
  const { massData, utilizationData, availableYears } = useMemo(() => {
    const scenarioKey = scenarioModeToKey(scenarioMode);
    const entries = getDebugStateEntries(scenarioKey);
    
    const sortedYears = entries.map(e => e.year).sort((a, b) => a - b);
    const massData = buildMassFractionsSeries(entries);
    const utilizationData = buildBottleneckSeries(entries);

    return { massData, utilizationData, availableYears: sortedYears };
  }, [scenarioMode]);

  // Update selected year when currentYear prop changes
  useEffect(() => {
    if (currentYear && availableYears.includes(currentYear)) {
      setSelectedYear(currentYear);
    }
  }, [currentYear, availableYears]);

  // Handle wheel scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentIndex = availableYears.indexOf(selectedYear);
      if (currentIndex === -1) return;

      if (e.deltaY > 0 && currentIndex < availableYears.length - 1) {
        const nextYear = availableYears[currentIndex + 1];
        setSelectedYear(nextYear);
        if (onYearChange) onYearChange(nextYear);
      } else if (e.deltaY < 0 && currentIndex > 0) {
        const prevYear = availableYears[currentIndex - 1];
        setSelectedYear(prevYear);
        if (onYearChange) onYearChange(prevYear);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [selectedYear, availableYears, onYearChange]);

  useEffect(() => {
    if (!svgRef.current || massData.length === 0 || utilizationData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Responsive dimensions - respect container height
    const container = svgRef.current.parentElement;
    const containerWidth = container?.clientWidth || 400;
    const containerHeight = container?.clientHeight || 400;
    const isMobile = containerWidth < 640;
    // CRITICAL FIX: Match sizing of well-sized charts (500px desktop)
    // Use the smaller of width/height to ensure it fits, but allow more space on desktop
    const size = Math.min(containerWidth - 32, containerHeight - 100, isMobile ? 300 : 500);
    const width = size;
    const height = size;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - (isMobile ? 30 : 50);
    
    // Set SVG dimensions to match container
    svg.attr("width", width).attr("height", height);

    // Get current year data
    const currentMass = massData.find(d => d.year === selectedYear);
    const currentUtil = utilizationData.find(d => d.year === selectedYear);

    if (!currentMass || !currentUtil) return;

    // Mass fraction categories (6 spokes)
    const massCategories = [
      { key: "silicon", label: "Silicon", color: "#3b82f6" },
      { key: "radiator", label: "Radiator", color: "#ef4444" },
      { key: "solar", label: "Solar", color: "#fbbf24" },
      { key: "structure", label: "Structure", color: "#8b5cf6" },
      { key: "shielding", label: "Shielding", color: "#10b981" },
      { key: "power_electronics", label: "Power", color: "#06b6d4" }
    ];

    // Utilization categories (5 spokes)
    const utilCategories = [
      { key: "heat", label: "Heat", color: "#ef4444" },
      { key: "backhaul", label: "Backhaul", color: "#3b82f6" },
      { key: "manufacturing", label: "Manufacturing", color: "#f59e0b" },
      { key: "maintenance", label: "Maintenance", color: "#8b5cf6" },
      { key: "autonomy", label: "Autonomy", color: "#10b981" }
    ];

    // Create angles for mass fractions (6 spokes, evenly spaced)
    const massAngles = massCategories.map((_, i) => 
      (i * 2 * Math.PI) / massCategories.length - Math.PI / 2
    );

    // Create angles for utilizations (5 spokes, evenly spaced, offset)
    const utilAngles = utilCategories.map((_, i) => 
      (i * 2 * Math.PI) / utilCategories.length - Math.PI / 2
    );

    // Draw mass fraction polygon
    const massPoints = massAngles.map((angle, i) => {
      const key = massCategories[i].key as keyof typeof currentMass;
      const value = (currentMass[key] as number) ?? 0;
      const r = radius * value;
      return [
        centerX + r * Math.cos(angle),
        centerY + r * Math.sin(angle)
      ] as [number, number];
    });

    const massLine = d3.line<[number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveLinearClosed);

    // Draw utilization polygon
    const utilPoints = utilAngles.map((angle, i) => {
      const key = utilCategories[i].key as keyof typeof currentUtil;
      const value = (currentUtil[key] as number) ?? 0;
      const r = radius * value;
      return [
        centerX + r * Math.cos(angle),
        centerY + r * Math.sin(angle)
      ] as [number, number];
    });

    const utilLine = d3.line<[number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveLinearClosed);

    // Draw axes (spokes)
    massAngles.forEach((angle, i) => {
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      svg.append("line")
        .attr("x1", centerX)
        .attr("y1", centerY)
        .attr("x2", x)
        .attr("y2", y)
        .attr("stroke", "#475569")
        .attr("stroke-width", 1)
        .style("opacity", 0.3);

      // Labels
      const labelX = centerX + (radius + 20) * Math.cos(angle);
      const labelY = centerY + (radius + 20) * Math.sin(angle);
      
      svg.append("text")
        .attr("x", labelX)
        .attr("y", labelY)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "11px")
        .style("fill", "#cbd5e1")
        .text(massCategories[i].label);
    });

    // Draw mass fraction polygon with hover
    const massPath = svg.append("path")
      .datum(massPoints)
      .attr("d", massLine)
      .attr("fill", "#3b82f6")
      .attr("opacity", 0.3)
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", function() {
        d3.select(this).attr("opacity", 0.5);
      })
      .on("mouseout", function() {
        d3.select(this).attr("opacity", 0.3);
        setHoveredSegment(null);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Draw utilization polygon (overlay) with hover
    const utilPath = svg.append("path")
      .datum(utilPoints)
      .attr("d", utilLine)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4")
      .style("cursor", "pointer")
      .on("mouseover", function() {
        d3.select(this).attr("stroke-width", 3);
      })
      .on("mouseout", function() {
        d3.select(this).attr("stroke-width", 2);
        setHoveredSegment(null);
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
      });

    // Add hover zones for each mass segment
    massAngles.forEach((angle, i) => {
      const key = massCategories[i].key as keyof typeof currentMass;
      const value = (currentMass[key] as number) ?? 0;
      const r = radius * value;
      const nextAngle = massAngles[(i + 1) % massAngles.length];
      
      // Create a triangle for hover detection
      const pathData = [
        [centerX, centerY],
        [centerX + r * Math.cos(angle), centerY + r * Math.sin(angle)],
        [centerX + r * Math.cos(nextAngle), centerY + r * Math.sin(nextAngle)],
        [centerX, centerY]
      ].map(d => `${d[0]},${d[1]}`).join(" ");
      
      svg.append("path")
        .attr("d", `M ${pathData} Z`)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("mouseover", function(event) {
          setHoveredSegment({ type: 'mass', label: massCategories[i].label, value });
          if (tooltipRef.current) {
            tooltipRef.current.style.display = "block";
            tooltipRef.current.style.left = `${event.clientX + 10}px`;
            tooltipRef.current.style.top = `${event.clientY - 10}px`;
          }
        })
        .on("mousemove", function(event) {
          if (tooltipRef.current) {
            tooltipRef.current.style.left = `${event.clientX + 10}px`;
            tooltipRef.current.style.top = `${event.clientY - 10}px`;
          }
        })
        .on("mouseout", function() {
          setHoveredSegment(null);
          if (tooltipRef.current) {
            tooltipRef.current.style.display = "none";
          }
        });
    });

    // Add hover zones for each utilization segment
    utilAngles.forEach((angle, i) => {
      const key = utilCategories[i].key as keyof typeof currentUtil;
      const value = (currentUtil[key] as number) ?? 0;
      const r = radius * value;
      const nextAngle = utilAngles[(i + 1) % utilAngles.length];
      
      // Create a triangle for hover detection
      const pathData = [
        [centerX, centerY],
        [centerX + r * Math.cos(angle), centerY + r * Math.sin(angle)],
        [centerX + r * Math.cos(nextAngle), centerY + r * Math.sin(nextAngle)],
        [centerX, centerY]
      ].map(d => `${d[0]},${d[1]}`).join(" ");
      
      svg.append("path")
        .attr("d", `M ${pathData} Z`)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("mouseover", function(event) {
          setHoveredSegment({ type: 'util', label: utilCategories[i].label, value });
          if (tooltipRef.current) {
            tooltipRef.current.style.display = "block";
            tooltipRef.current.style.left = `${event.clientX + 10}px`;
            tooltipRef.current.style.top = `${event.clientY - 10}px`;
          }
        })
        .on("mousemove", function(event) {
          if (tooltipRef.current) {
            tooltipRef.current.style.left = `${event.clientX + 10}px`;
            tooltipRef.current.style.top = `${event.clientY - 10}px`;
          }
        })
        .on("mouseout", function() {
          setHoveredSegment(null);
          if (tooltipRef.current) {
            tooltipRef.current.style.display = "none";
          }
        });
    });

    // Draw center circle with year
    svg.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", 40)
      .attr("fill", "#1e293b")
      .attr("stroke", "#475569")
      .attr("stroke-width", 2);

    svg.append("text")
      .attr("x", centerX)
      .attr("y", centerY - 5)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", isMobile ? "14px" : "16px")
      .style("font-weight", "bold")
      .style("fill", "#fbbf24")
      .text(selectedYear.toString());

    svg.append("text")
      .attr("x", centerX)
      .attr("y", centerY + 15)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", isMobile ? "9px" : "10px")
      .style("fill", "#94a3b8")
      .text("Year");

    // Legend (responsive position)
    const legendX = isMobile ? width - 100 : width - 120;
    const legend = svg.append("g")
      .attr("transform", `translate(${legendX}, 20)`);

    legend.append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", "#3b82f6")
      .attr("opacity", 0.3)
      .attr("stroke", "#3b82f6");

    legend.append("text")
      .attr("x", 16)
      .attr("y", 9)
      .style("font-size", isMobile ? "9px" : "10px")
      .style("fill", "#cbd5e1")
      .text("Mass Fractions");

    legend.append("line")
      .attr("x1", 0)
      .attr("x2", 12)
      .attr("y1", 25)
      .attr("y2", 25)
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4");

    legend.append("text")
      .attr("x", 16)
      .attr("y", 28)
      .style("font-size", isMobile ? "9px" : "10px")
      .style("fill", "#cbd5e1")
      .text("Utilizations");

  }, [massData, utilizationData, selectedYear]);

  return (
    <div ref={containerRef} className="relative w-full">
      <svg 
        ref={svgRef}
        className="w-full h-full max-w-full max-h-full"
        preserveAspectRatio="xMidYMid meet"
      />
      
      {/* Mini timeline scrubber */}
      {availableYears.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => {
              const currentIndex = availableYears.indexOf(selectedYear);
              if (currentIndex > 0) {
                const prevYear = availableYears[currentIndex - 1];
                setSelectedYear(prevYear);
                if (onYearChange) onYearChange(prevYear);
              }
            }}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300"
            disabled={availableYears.indexOf(selectedYear) === 0}
          >
            ←
          </button>
          
          <div className="flex-1 flex gap-1 overflow-x-auto">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => {
                  setSelectedYear(year);
                  if (onYearChange) onYearChange(year);
                }}
                className={`px-2 py-1 rounded text-xs transition ${
                  year === selectedYear
                    ? "bg-amber-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => {
              const currentIndex = availableYears.indexOf(selectedYear);
              if (currentIndex < availableYears.length - 1) {
                const nextYear = availableYears[currentIndex + 1];
                setSelectedYear(nextYear);
                if (onYearChange) onYearChange(nextYear);
              }
            }}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300"
            disabled={availableYears.indexOf(selectedYear) === availableYears.length - 1}
          >
            →
          </button>
        </div>
      )}
      
      <div className="mt-2 text-xs text-slate-500 text-center">
        Scroll to change year
      </div>
      
      {/* Tooltip */}
      {hoveredSegment && (
        <div
          ref={tooltipRef}
          className="absolute bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white pointer-events-none z-50"
          style={{ display: "none" }}
        >
          <div className="font-semibold mb-1">
            {hoveredSegment.type === 'mass' ? 'Mass Fraction' : 'Utilization'}
          </div>
          <div style={{ color: hoveredSegment.type === 'mass' ? "#3b82f6" : "#10b981" }}>
            {hoveredSegment.label}: {(hoveredSegment.value * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

